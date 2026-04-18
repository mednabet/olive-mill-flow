-- Trigger : le tout premier utilisateur créé reçoit automatiquement le rôle admin
create or replace function public.handle_first_user_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_count int;
begin
  select count(*) into user_count from auth.users;
  -- Si c'est le premier utilisateur (celui qu'on vient d'insérer)
  if user_count <= 1 then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin'::app_role)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

-- S'assure que le trigger handle_new_user existe sur auth.users (créé dans la migration initiale)
-- On ajoute notre trigger après celui qui crée le profile
drop trigger if exists on_auth_user_created_assign_admin on auth.users;
create trigger on_auth_user_created_assign_admin
  after insert on auth.users
  for each row
  execute function public.handle_first_user_admin();

-- Vérifie aussi que le trigger handle_new_user (création profile) est bien attaché
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();