/**
 * Edge function admin-users :
 * - GET (action=list)  : liste tous les utilisateurs avec leurs rôles et profils
 * - POST (action=set_role)   : ajoute un rôle à un user (admin requis)
 * - POST (action=remove_role): retire un rôle (admin requis)
 *
 * Utilise la service-role key pour accéder à auth.users, mais valide
 * systématiquement que l'appelant possède le rôle admin via has_role().
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "missing_token" }, 401);
    }

    // Client "as-user" pour vérifier l'identité et le rôle admin via RLS
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);

    const { data: isAdmin, error: roleErr } = await userClient.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) return json({ error: "forbidden" }, 403);

    // Service client pour opérations privilégiées
    const admin = createClient(url, serviceKey);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action ?? new URL(req.url).searchParams.get("action") ?? "list";

    if (action === "list") {
      const { data: list, error } = await admin.auth.admin.listUsers({ perPage: 200 });
      if (error) throw error;
      const ids = list.users.map((u) => u.id);
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        admin.from("profiles").select("*").in("id", ids),
        admin.from("user_roles").select("user_id, role").in("user_id", ids),
      ]);
      const merged = list.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        profile: profiles?.find((p) => p.id === u.id) ?? null,
        roles: (roles ?? []).filter((r) => r.user_id === u.id).map((r) => r.role),
      }));
      return json({ users: merged });
    }

    if (action === "set_role") {
      const { user_id, role } = body;
      if (!user_id || !role) return json({ error: "missing_params" }, 400);
      const { error } = await admin.from("user_roles").insert({ user_id, role });
      if (error && !error.message.includes("duplicate")) throw error;
      await admin.from("audit_logs").insert({
        action: "role_added",
        entity_type: "user_roles",
        entity_id: user_id,
        user_id: userData.user.id,
        new_values: { role },
      });
      return json({ ok: true });
    }

    if (action === "remove_role") {
      const { user_id, role } = body;
      if (!user_id || !role) return json({ error: "missing_params" }, 400);
      const { error } = await admin.from("user_roles").delete().eq("user_id", user_id).eq("role", role);
      if (error) throw error;
      await admin.from("audit_logs").insert({
        action: "role_removed",
        entity_type: "user_roles",
        entity_id: user_id,
        user_id: userData.user.id,
        old_values: { role },
      });
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("admin-users error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
