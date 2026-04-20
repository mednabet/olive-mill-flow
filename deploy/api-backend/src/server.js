// ============================================================
// OliveApp API backend - Fastify + JWT + PostgreSQL
// ============================================================
// Endpoints:
//   POST   /auth/signup      { email, password, full_name? }
//   POST   /auth/login       { email, password }       -> { token, user }
//   POST   /auth/logout
//   GET    /auth/me                                    (Bearer JWT)
//   GET    /api/:table       ?limit=50&offset=0&order=col.asc
//   GET    /api/:table/:id
//   POST   /api/:table       { ...row }
//   PATCH  /api/:table/:id   { ...patch }
//   DELETE /api/:table/:id
//   GET    /health
//
// Tables exposees (whitelist) : voir ALLOWED_TABLES ci-dessous.
// Auth : un JWT signe avec process.env.JWT_SECRET.
// ============================================================
import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { z } from 'zod';

const {
  PORT = '4000',
  HOST = '0.0.0.0',
  DATABASE_URL,
  JWT_SECRET,
  CORS_ORIGIN = '*',
  LOG_LEVEL = 'info',
  BCRYPT_ROUNDS = '10',
} = process.env;

if (!DATABASE_URL) {
  console.error('[FATAL] DATABASE_URL manquant');
  process.exit(1);
}
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('[FATAL] JWT_SECRET manquant ou < 32 caracteres');
  process.exit(1);
}

// Whitelist des tables exposees via /api/:table.
// Ajoutez ici les tables que le frontend doit lire/ecrire.
const ALLOWED_TABLES = new Set([
  'clients',
  'vehicles',
  'products',
  'arrivals',
  'weighings',
  'crushing_files',
  'crushing_file_arrivals',
  'crushing_lines',
  'production_records',
  'invoices',
  'invoice_items',
  'payments',
  'stock_lots',
  'stock_movements',
  'scales',
  'settings',
  'profiles',
  'user_roles',
  'audit_logs',
  'notification_logs',
  'notification_templates',
]);

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });

const fastify = Fastify({ logger: { level: LOG_LEVEL } });

await fastify.register(cors, {
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map((s) => s.trim()),
  credentials: true,
});
await fastify.register(jwt, { secret: JWT_SECRET });

// ---------- Helpers ----------
function assertTable(name) {
  if (!ALLOWED_TABLES.has(name)) {
    const err = new Error(`Table inconnue ou non autorisee: ${name}`);
    err.statusCode = 404;
    throw err;
  }
}

function quoteIdent(id) {
  return '"' + String(id).replace(/"/g, '""') + '"';
}

async function authPreHandler(request, reply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
}

// ---------- Health ----------
fastify.get('/health', async () => {
  const r = await pool.query('SELECT 1 as ok');
  return { status: 'ok', db: r.rows[0].ok === 1 };
});

// ---------- Auth ----------
const signupSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  full_name: z.string().min(1).max(255).optional(),
});

fastify.post('/auth/signup', async (request, reply) => {
  const parsed = signupSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });
  const { email, password, full_name } = parsed.data;

  const existing = await pool.query('SELECT id FROM auth_users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rowCount > 0) return reply.code(409).send({ error: 'Email already registered' });

  const password_hash = await bcrypt.hash(password, parseInt(BCRYPT_ROUNDS, 10));
  const userRes = await pool.query(
    `INSERT INTO auth_users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at`,
    [email.toLowerCase(), password_hash]
  );
  const user = userRes.rows[0];

  // Profil applicatif
  await pool.query(
    `INSERT INTO profiles (id, full_name, preferred_language, username)
     VALUES ($1, $2, 'fr', $3)
     ON CONFLICT (id) DO NOTHING`,
    [user.id, full_name || email.split('@')[0], email.split('@')[0]]
  );

  // Premier utilisateur => admin
  const countRes = await pool.query('SELECT COUNT(*)::int AS c FROM auth_users');
  if (countRes.rows[0].c === 1) {
    await pool.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin') ON CONFLICT DO NOTHING`,
      [user.id]
    );
  }

  const token = fastify.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: '7d' });
  return { token, user: { id: user.id, email: user.email } };
});

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

fastify.post('/auth/login', async (request, reply) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
  const { email, password } = parsed.data;

  const r = await pool.query(
    'SELECT id, email, password_hash FROM auth_users WHERE email = $1',
    [email.toLowerCase()]
  );
  if (r.rowCount === 0) return reply.code(401).send({ error: 'Invalid credentials' });

  const user = r.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return reply.code(401).send({ error: 'Invalid credentials' });

  const token = fastify.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: '7d' });
  return { token, user: { id: user.id, email: user.email } };
});

fastify.post('/auth/logout', async () => ({ ok: true }));

fastify.get('/auth/me', { preHandler: authPreHandler }, async (request) => {
  const userId = request.user.sub;
  const profileRes = await pool.query('SELECT * FROM profiles WHERE id = $1', [userId]);
  const rolesRes = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
  return {
    user: { id: userId, email: request.user.email },
    profile: profileRes.rows[0] || null,
    roles: rolesRes.rows.map((r) => r.role),
  };
});

// ---------- Generic CRUD ----------
fastify.get('/api/:table', { preHandler: authPreHandler }, async (request, reply) => {
  const { table } = request.params;
  assertTable(table);
  const limit = Math.min(parseInt(request.query.limit ?? '50', 10) || 50, 1000);
  const offset = Math.max(parseInt(request.query.offset ?? '0', 10) || 0, 0);
  const order = request.query.order; // ex "created_at.desc"

  let orderSql = '';
  if (order && /^[a-zA-Z_][a-zA-Z0-9_]*\.(asc|desc)$/.test(order)) {
    const [col, dir] = order.split('.');
    orderSql = ` ORDER BY ${quoteIdent(col)} ${dir.toUpperCase()}`;
  }

  const sql = `SELECT * FROM ${quoteIdent(table)}${orderSql} LIMIT $1 OFFSET $2`;
  const r = await pool.query(sql, [limit, offset]);
  return { data: r.rows, count: r.rowCount, limit, offset };
});

fastify.get('/api/:table/:id', { preHandler: authPreHandler }, async (request, reply) => {
  const { table, id } = request.params;
  assertTable(table);
  const r = await pool.query(`SELECT * FROM ${quoteIdent(table)} WHERE id = $1`, [id]);
  if (r.rowCount === 0) return reply.code(404).send({ error: 'Not found' });
  return r.rows[0];
});

fastify.post('/api/:table', { preHandler: authPreHandler }, async (request, reply) => {
  const { table } = request.params;
  assertTable(table);
  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const cols = Object.keys(body);
  if (cols.length === 0) return reply.code(400).send({ error: 'Empty body' });

  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const colsSql = cols.map(quoteIdent).join(', ');
  const sql = `INSERT INTO ${quoteIdent(table)} (${colsSql}) VALUES (${placeholders}) RETURNING *`;
  const r = await pool.query(sql, cols.map((c) => body[c]));
  return reply.code(201).send(r.rows[0]);
});

fastify.patch('/api/:table/:id', { preHandler: authPreHandler }, async (request, reply) => {
  const { table, id } = request.params;
  assertTable(table);
  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const cols = Object.keys(body);
  if (cols.length === 0) return reply.code(400).send({ error: 'Empty body' });

  const setSql = cols.map((c, i) => `${quoteIdent(c)} = $${i + 1}`).join(', ');
  const sql = `UPDATE ${quoteIdent(table)} SET ${setSql} WHERE id = $${cols.length + 1} RETURNING *`;
  const r = await pool.query(sql, [...cols.map((c) => body[c]), id]);
  if (r.rowCount === 0) return reply.code(404).send({ error: 'Not found' });
  return r.rows[0];
});

fastify.delete('/api/:table/:id', { preHandler: authPreHandler }, async (request, reply) => {
  const { table, id } = request.params;
  assertTable(table);
  const r = await pool.query(`DELETE FROM ${quoteIdent(table)} WHERE id = $1 RETURNING id`, [id]);
  if (r.rowCount === 0) return reply.code(404).send({ error: 'Not found' });
  return { deleted: id };
});

// ---------- Error handler ----------
fastify.setErrorHandler((err, request, reply) => {
  request.log.error(err);
  const status = err.statusCode || 500;
  reply.code(status).send({ error: err.message || 'Internal error' });
});

// ---------- Start ----------
try {
  await fastify.listen({ port: parseInt(PORT, 10), host: HOST });
  fastify.log.info(`OliveApp API listening on http://${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
