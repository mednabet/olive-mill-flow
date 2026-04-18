-- Réaffecter le rôle admin au compte 'admin' s'il manque
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::app_role
FROM public.profiles p
WHERE p.username = 'admin'
ON CONFLICT (user_id, role) DO NOTHING;