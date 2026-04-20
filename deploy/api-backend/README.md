# OliveApp API backend (Node.js + Fastify)

API REST locale qui remplace Supabase pour le déploiement on-premise Windows.

## Stack

- **Fastify 4** — serveur HTTP rapide
- **@fastify/jwt** — auth Bearer JWT
- **bcrypt** — hash des mots de passe
- **pg** — driver PostgreSQL natif
- **zod** — validation d'entrée

## Endpoints

### Auth
- `POST /auth/signup` — `{ email, password, full_name? }` → `{ token, user }`
- `POST /auth/login` — `{ email, password }` → `{ token, user }`
- `GET  /auth/me` (Bearer) → `{ user, profile, roles }`
- `POST /auth/logout`

### CRUD générique (Bearer)
Whitelist de tables dans `src/server.js` (`ALLOWED_TABLES`).
- `GET    /api/:table?limit=50&offset=0&order=created_at.desc`
- `GET    /api/:table/:id`
- `POST   /api/:table`
- `PATCH  /api/:table/:id`
- `DELETE /api/:table/:id`

### Health
- `GET /health` → `{ status: "ok", db: true }`

## Installation locale (dev)

```bash
cd deploy/api-backend
cp .env.example .env
# édite .env (DATABASE_URL + JWT_SECRET)
npm install
npm start
```

## Installation Windows (production)

Lance `deploy\install.bat` — l'étape 7 installe ce backend en service Windows
via NSSM (`OliveAppAPI`), génère un `.env` sécurisé et démarre le service.

## Sécurité

- Le `JWT_SECRET` est généré aléatoirement (48 chars) et stocké dans `.env`
  protégé en lecture admin seulement.
- Mots de passe stockés en bcrypt (cost configurable via `BCRYPT_ROUNDS`).
- CORS verrouillable via `CORS_ORIGIN` (séparateur virgule).
- La whitelist `ALLOWED_TABLES` empêche d'accéder à des tables non prévues.

## Limitations actuelles

- Pas de RLS — toute personne authentifiée peut lire/écrire les tables
  whitelistées. Ajoutez la logique d'autorisation par rôle dans `src/server.js`
  selon vos besoins (`request.user.sub` + table `user_roles`).
- Pas de Realtime — utilisez du polling côté client ou ajoutez un service
  WebSocket séparé qui écoute `LISTEN/NOTIFY` PostgreSQL.
- Le reset password n'est pas inclus (à ajouter avec un email transactionnel).
