-- 1. Ajouter colonne username au profil
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text;

-- Pré-remplir avec la partie locale de l'email (sauf si déjà rempli)
UPDATE public.profiles p
SET username = lower(split_part(u.email, '@', 1))
FROM auth.users u
WHERE p.id = u.id AND p.username IS NULL;

-- Modifier handle_new_user pour récupérer le username depuis user_metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, preferred_language, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'preferred_language', 'fr'),
    coalesce(new.raw_user_meta_data->>'username', lower(split_part(new.email, '@', 1)))
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- 2. Créer ou ré-initialiser le compte admin/admin
DO $$
DECLARE
  admin_uid uuid;
BEGIN
  -- Récupère l'ID si l'admin existe déjà (par email synthétique OU par username)
  SELECT u.id INTO admin_uid
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.email = 'admin@local.app' OR lower(p.username) = 'admin'
  LIMIT 1;
  
  IF admin_uid IS NOT NULL THEN
    -- Réinitialise le mot de passe et les métadonnées pour s'assurer que admin/admin fonctionne
    UPDATE auth.users
    SET 
      email = 'admin@local.app',
      encrypted_password = crypt('admin', gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_user_meta_data = jsonb_build_object(
        'full_name', coalesce(raw_user_meta_data->>'full_name', 'Administrateur'),
        'username', 'admin',
        'preferred_language', coalesce(raw_user_meta_data->>'preferred_language', 'fr')
      ),
      updated_at = now()
    WHERE id = admin_uid;
    
    -- S'assurer que le profil a username='admin'
    UPDATE public.profiles
    SET username = 'admin', full_name = coalesce(full_name, 'Administrateur')
    WHERE id = admin_uid;
    
    -- S'assurer du rôle admin
    INSERT INTO public.user_roles (user_id, role)
    VALUES (admin_uid, 'admin'::app_role)
    ON CONFLICT DO NOTHING;
  ELSE
    -- Création complète
    admin_uid := gen_random_uuid();
    
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      admin_uid,
      'authenticated', 'authenticated',
      'admin@local.app',
      crypt('admin', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Administrateur","username":"admin","preferred_language":"fr"}'::jsonb,
      now(), now(),
      '', '', '', ''
    );
    
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      admin_uid,
      jsonb_build_object('sub', admin_uid::text, 'email', 'admin@local.app'),
      'email',
      admin_uid::text,
      now(), now(), now()
    );
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (admin_uid, 'admin'::app_role)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- 3. Index unique APRÈS avoir aligné les données
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_idx
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;