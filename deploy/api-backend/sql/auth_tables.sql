-- ============================================================
-- Tables d'authentification pour le backend Node.js custom
-- (remplace auth.users de Supabase)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.auth_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_users_email_idx ON public.auth_users (email);

-- Si la table profiles utilise une FK vers auth.users (Supabase), on ne peut
-- pas la recreer ici. On cree plutot une vue de compatibilite si besoin.
-- Le backend Node insere directement dans profiles avec id = auth_users.id.
