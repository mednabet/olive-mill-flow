-- 1. Table de jonction pour permettre plusieurs arrivées par dossier d'écrasement
create table public.crushing_file_arrivals (
  id uuid primary key default gen_random_uuid(),
  crushing_file_id uuid not null references public.crushing_files(id) on delete cascade,
  arrival_id uuid not null references public.arrivals(id) on delete restrict,
  gross_weight_kg numeric,
  tare_weight_kg numeric,
  net_weight_kg numeric,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique(arrival_id) -- une arrivée ne peut être que dans un seul dossier
);

create index idx_cfa_file on public.crushing_file_arrivals(crushing_file_id);
create index idx_cfa_arrival on public.crushing_file_arrivals(arrival_id);

alter table public.crushing_file_arrivals enable row level security;

create policy cfa_read on public.crushing_file_arrivals for select to authenticated
  using (has_any_role(auth.uid(), array['admin','superviseur','peseur','operateur','caisse','public_display']::app_role[]));

create policy cfa_write on public.crushing_file_arrivals for all to authenticated
  using (has_any_role(auth.uid(), array['admin','superviseur','peseur','operateur']::app_role[]))
  with check (has_any_role(auth.uid(), array['admin','superviseur','peseur','operateur']::app_role[]));

-- 2. Migrer les liens existants : pour chaque crushing_file existant, créer la ligne de jonction
insert into public.crushing_file_arrivals (crushing_file_id, arrival_id, gross_weight_kg, tare_weight_kg, net_weight_kg, position)
select id, arrival_id, gross_weight_kg, tare_weight_kg, net_weight_kg, 0
from public.crushing_files
where arrival_id is not null
on conflict (arrival_id) do nothing;

-- 3. Rendre crushing_files.arrival_id nullable (car les totaux sont maintenant agrégés depuis la jonction)
alter table public.crushing_files alter column arrival_id drop not null;

-- 4. Trigger : mettre à jour les totaux du dossier d'écrasement quand on modifie la jonction
create or replace function public.tg_recalc_crushing_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file uuid;
  v_gross numeric;
  v_tare numeric;
  v_net numeric;
begin
  v_file := coalesce(new.crushing_file_id, old.crushing_file_id);
  select
    coalesce(sum(gross_weight_kg), 0),
    coalesce(sum(tare_weight_kg), 0),
    coalesce(sum(net_weight_kg), 0)
    into v_gross, v_tare, v_net
    from public.crushing_file_arrivals
    where crushing_file_id = v_file;
  update public.crushing_files
    set gross_weight_kg = v_gross,
        tare_weight_kg = v_tare,
        net_weight_kg = v_net
    where id = v_file;
  return null;
end;
$$;

create trigger trg_cfa_recalc
after insert or update or delete on public.crushing_file_arrivals
for each row execute function public.tg_recalc_crushing_totals();

-- 5. Fonction utilitaire : calculer net = gross - tare avant insert/update
create or replace function public.tg_cfa_compute_net()
returns trigger
language plpgsql
as $$
begin
  if new.gross_weight_kg is not null and new.tare_weight_kg is not null then
    new.net_weight_kg := greatest(0, new.gross_weight_kg - new.tare_weight_kg);
  elsif new.gross_weight_kg is not null and new.tare_weight_kg is null then
    new.net_weight_kg := new.gross_weight_kg;
  end if;
  return new;
end;
$$;

create trigger trg_cfa_net
before insert or update on public.crushing_file_arrivals
for each row execute function public.tg_cfa_compute_net();

-- 6. Insérer les nouveaux paramètres système
insert into public.settings (key, value, description) values
  ('weighing.allow_manual_for_peseur', '{"enabled": true}'::jsonb, 'Autoriser les peseurs à saisir un poids manuellement (admin/superviseur toujours autorisés)'),
  ('scale.websocket_url', '{"url": "ws://localhost:9001"}'::jsonb, 'URL du service WebSocket local de la balance électronique')
on conflict (key) do nothing;