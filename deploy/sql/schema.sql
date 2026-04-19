-- ============================================================
-- schema.sql - Genere depuis supabase/migrations/
-- Schema oliveapp pour deploiement local PostgreSQL
-- ============================================================
-- NOTE : les politiques RLS Supabase (qui dependent de auth.uid())
-- sont incluses telles quelles. Si votre API locale n'utilise pas
-- le schema 'auth' de Supabase, vous pouvez ignorer les erreurs RLS
-- ou desactiver RLS apres l'application :
--   ALTER TABLE <nom> DISABLE ROW LEVEL SECURITY;
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Stub minimal du schema 'auth' pour eviter les erreurs sur les FK / fonctions
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, raw_user_meta_data jsonb);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated'::text $$;


-- ====== 20260418144756_dfb96d4e-a2b8-4807-bf7c-d8788cdb9d12.sql ======
-- Extensions
create extension if not exists "pgcrypto";

-- =====================================================================
-- 1. ROLES & PROFILES
-- =====================================================================
create type public.app_role as enum (
  'admin','superviseur','peseur','operateur','caisse','public_display'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  preferred_language text not null default 'fr' check (preferred_language in ('fr','ar')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.has_any_role(_user_id uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = any(_roles))
$$;

-- =====================================================================
-- 2. SETTINGS
-- =====================================================================
create table public.settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- =====================================================================
-- 3. CLIENTS & VEHICLES
-- =====================================================================
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  full_name text not null,
  phone text,
  address text,
  preferred_language text not null default 'fr' check (preferred_language in ('fr','ar')),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create index idx_clients_phone on public.clients(phone);
create index idx_clients_full_name on public.clients(full_name);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  plate text not null unique,
  vehicle_type text,
  notes text,
  created_at timestamptz not null default now()
);
create index idx_vehicles_client on public.vehicles(client_id);

-- =====================================================================
-- 4. CRUSHING LINES
-- =====================================================================
create type public.line_status as enum ('available','busy','maintenance','offline');

create table public.crushing_lines (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  hourly_capacity_kg numeric(10,2) not null default 0,
  status public.line_status not null default 'available',
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 5. ARRIVALS
-- =====================================================================
create type public.service_type as enum ('weigh_simple','weigh_double','crushing');
create type public.arrival_status as enum ('open','routed','closed','cancelled');

create table public.arrivals (
  id uuid primary key default gen_random_uuid(),
  ticket_number text unique not null,
  client_id uuid references public.clients(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  service_type public.service_type not null,
  status public.arrival_status not null default 'open',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  closed_at timestamptz
);
create index idx_arrivals_status on public.arrivals(status);
create index idx_arrivals_created_at on public.arrivals(created_at desc);

-- =====================================================================
-- 6. WEIGHINGS
-- =====================================================================
create type public.weighing_kind as enum ('simple','first','second');
create type public.weighing_source as enum ('scale','manual');

create table public.weighings (
  id uuid primary key default gen_random_uuid(),
  arrival_id uuid not null references public.arrivals(id) on delete cascade,
  kind public.weighing_kind not null,
  weight_kg numeric(12,2) not null,
  source public.weighing_source not null default 'manual',
  manual_reason text,
  performed_at timestamptz not null default now(),
  performed_by uuid references auth.users(id),
  is_corrected boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_weighings_arrival on public.weighings(arrival_id);

-- =====================================================================
-- 7. CRUSHING FILES
-- =====================================================================
create type public.crushing_status as enum ('queued','assigned','in_progress','completed','cancelled');
create type public.priority_level as enum ('normal','high','urgent');

create table public.crushing_files (
  id uuid primary key default gen_random_uuid(),
  tracking_code text unique not null,
  arrival_id uuid not null references public.arrivals(id) on delete cascade,
  client_id uuid references public.clients(id),
  status public.crushing_status not null default 'queued',
  priority public.priority_level not null default 'normal',
  gross_weight_kg numeric(12,2),
  tare_weight_kg numeric(12,2),
  net_weight_kg numeric(12,2),
  assigned_line_id uuid references public.crushing_lines(id),
  queue_position integer,
  estimated_wait_minutes integer,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index idx_crushing_files_status on public.crushing_files(status);
create index idx_crushing_files_queue on public.crushing_files(queue_position) where status in ('queued','assigned');
create index idx_crushing_files_line on public.crushing_files(assigned_line_id);

-- =====================================================================
-- 8. PRODUCTION
-- =====================================================================
create table public.production_records (
  id uuid primary key default gen_random_uuid(),
  crushing_file_id uuid not null references public.crushing_files(id) on delete cascade,
  line_id uuid references public.crushing_lines(id),
  input_kg numeric(12,2) not null default 0,
  oil_kg numeric(12,2) not null default 0,
  pomace_kg numeric(12,2) not null default 0,
  losses_kg numeric(12,2) not null default 0,
  yield_percent numeric(6,3) generated always as (
    case when input_kg > 0 then (oil_kg / input_kg) * 100 else 0 end
  ) stored,
  duration_minutes integer,
  operator_ids uuid[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index idx_production_file on public.production_records(crushing_file_id);

-- =====================================================================
-- 9. STOCKS
-- =====================================================================
create type public.stock_kind as enum ('client_olives','client_oil','own_oil','pomace','byproduct');
create type public.stock_movement_type as enum ('in','out','adjustment');

create table public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  lot_code text unique not null,
  kind public.stock_kind not null,
  client_id uuid references public.clients(id),
  crushing_file_id uuid references public.crushing_files(id),
  quantity_kg numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
create index idx_stock_lots_client on public.stock_lots(client_id);
create index idx_stock_lots_kind on public.stock_lots(kind);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.stock_lots(id) on delete cascade,
  movement_type public.stock_movement_type not null,
  quantity_kg numeric(12,2) not null,
  reason text,
  reference_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index idx_stock_movements_lot on public.stock_movements(lot_id);

-- =====================================================================
-- 10. BILLING
-- =====================================================================
create type public.invoice_status as enum ('draft','issued','partial','paid','cancelled');
create type public.payment_method as enum ('cash','transfer','card','other');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique not null,
  client_id uuid references public.clients(id),
  crushing_file_id uuid references public.crushing_files(id),
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  paid numeric(12,2) not null default 0,
  status public.invoice_status not null default 'draft',
  notes text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12,3) not null default 1,
  unit_price numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(12,2) not null,
  method public.payment_method not null default 'cash',
  reference text,
  paid_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- =====================================================================
-- 11. NOTIFICATIONS
-- =====================================================================
create type public.notification_channel as enum ('whatsapp','sms');
create type public.notification_status as enum ('pending','sent','failed');

create table public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  channel public.notification_channel not null,
  language text not null check (language in ('fr','ar')),
  subject text,
  body text not null,
  is_active boolean not null default true,
  unique (code, channel, language)
);

create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  template_code text,
  channel public.notification_channel not null,
  recipient text not null,
  body text not null,
  status public.notification_status not null default 'pending',
  error text,
  reference_type text,
  reference_id uuid,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 12. AUDIT
-- =====================================================================
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  reason text,
  ip_address text,
  created_at timestamptz not null default now()
);
create index idx_audit_entity on public.audit_logs(entity_type, entity_id);
create index idx_audit_user on public.audit_logs(user_id);
create index idx_audit_created_at on public.audit_logs(created_at desc);

-- =====================================================================
-- 13. RLS
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.settings enable row level security;
alter table public.clients enable row level security;
alter table public.vehicles enable row level security;
alter table public.crushing_lines enable row level security;
alter table public.arrivals enable row level security;
alter table public.weighings enable row level security;
alter table public.crushing_files enable row level security;
alter table public.production_records enable row level security;
alter table public.stock_lots enable row level security;
alter table public.stock_movements enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.notification_templates enable row level security;
alter table public.notification_logs enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_select" on public.profiles for select to authenticated
  using (auth.uid() = id or public.has_role(auth.uid(), 'admin'));
create policy "profiles_update" on public.profiles for update to authenticated
  using (auth.uid() = id or public.has_role(auth.uid(), 'admin'));
create policy "profiles_insert" on public.profiles for insert to authenticated
  with check (auth.uid() = id);

create policy "user_roles_select" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "user_roles_admin" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "settings_read" on public.settings for select to authenticated using (true);
create policy "settings_admin" on public.settings for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "clients_read" on public.clients for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','peseur','operateur','caisse']::public.app_role[]));
create policy "clients_insert" on public.clients for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['admin','superviseur','peseur','caisse']::public.app_role[]));
create policy "clients_update" on public.clients for update to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','peseur','caisse']::public.app_role[]));
create policy "clients_delete" on public.clients for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "vehicles_read" on public.vehicles for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','peseur','operateur','caisse']::public.app_role[]));
create policy "vehicles_write" on public.vehicles for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','peseur']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','superviseur','peseur']::public.app_role[]));

create policy "lines_read" on public.crushing_lines for select to authenticated using (true);
create policy "lines_write" on public.crushing_lines for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','superviseur']::public.app_role[]));

create policy "arrivals_read" on public.arrivals for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','peseur','operateur','caisse','public_display']::public.app_role[]));
create policy "arrivals_insert" on public.arrivals for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['admin','superviseur','peseur']::public.app_role[]));
create policy "arrivals_update" on public.arrivals for update to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','peseur']::public.app_role[]));
create policy "arrivals_delete" on public.arrivals for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "weighings_read" on public.weighings for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','peseur','operateur','caisse']::public.app_role[]));
create policy "weighings_insert" on public.weighings for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['admin','superviseur','peseur']::public.app_role[]));
create policy "weighings_update" on public.weighings for update to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur']::public.app_role[]));

create policy "files_read" on public.crushing_files for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','peseur','operateur','caisse','public_display']::public.app_role[]));
create policy "files_write" on public.crushing_files for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','peseur','operateur']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','superviseur','peseur','operateur']::public.app_role[]));

create policy "production_read" on public.production_records for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','operateur','caisse']::public.app_role[]));
create policy "production_write" on public.production_records for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','operateur']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','superviseur','operateur']::public.app_role[]));

create policy "lots_read" on public.stock_lots for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','operateur','caisse']::public.app_role[]));
create policy "lots_write" on public.stock_lots for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','operateur']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','superviseur','operateur']::public.app_role[]));

create policy "movements_read" on public.stock_movements for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','operateur','caisse']::public.app_role[]));
create policy "movements_write" on public.stock_movements for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','operateur']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','superviseur','operateur']::public.app_role[]));

create policy "invoices_read" on public.invoices for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','caisse']::public.app_role[]));
create policy "invoices_write" on public.invoices for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','caisse']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','superviseur','caisse']::public.app_role[]));

create policy "invoice_items_read" on public.invoice_items for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','caisse']::public.app_role[]));
create policy "invoice_items_write" on public.invoice_items for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','caisse']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','superviseur','caisse']::public.app_role[]));

create policy "payments_read" on public.payments for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','caisse']::public.app_role[]));
create policy "payments_write" on public.payments for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur','caisse']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','superviseur','caisse']::public.app_role[]));

create policy "notif_templates_read" on public.notification_templates for select to authenticated using (true);
create policy "notif_templates_write" on public.notification_templates for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','superviseur']::public.app_role[]));

create policy "notif_logs_read" on public.notification_logs for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur']::public.app_role[]));
create policy "notif_logs_insert" on public.notification_logs for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['admin','superviseur','peseur','operateur']::public.app_role[]));

create policy "audit_read" on public.audit_logs for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin','superviseur']::public.app_role[]));
create policy "audit_insert" on public.audit_logs for insert to authenticated
  with check (auth.uid() is not null);

-- =====================================================================
-- 14. TRIGGERS
-- =====================================================================
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.tg_set_updated_at();
create trigger trg_clients_updated before update on public.clients
  for each row execute function public.tg_set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, preferred_language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'preferred_language', 'fr')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 15. SEED
-- =====================================================================
insert into public.settings (key, value, description) values
  ('mill.name', '"Moulin à Huile"'::jsonb, 'Nom du moulin'),
  ('mill.address', '""'::jsonb, 'Adresse'),
  ('mill.phone', '""'::jsonb, 'Téléphone'),
  ('billing.enabled', 'false'::jsonb, 'Module facturation activé'),
  ('billing.tax_rate', '0'::jsonb, 'Taux TVA (%)'),
  ('billing.price_per_kg', '0.5'::jsonb, 'Prix par kg pour écrasement'),
  ('queue.avg_minutes_per_kg', '0.05'::jsonb, 'Min/kg estimation file'),
  ('print.ticket_width_mm', '80'::jsonb, 'Largeur ticket (mm)'),
  ('display.refresh_seconds', '5'::jsonb, 'Rafraîchissement écran public (s)'),
  ('app.default_language', '"fr"'::jsonb, 'Langue par défaut')
on conflict (key) do nothing;

insert into public.crushing_lines (code, name, hourly_capacity_kg, status) values
  ('L1','Ligne 1', 500, 'available'),
  ('L2','Ligne 2', 500, 'available'),
  ('L3','Ligne 3', 750, 'available')
on conflict (code) do nothing;

insert into public.notification_templates (code, channel, language, body) values
  ('arrival_received','whatsapp','fr','Bonjour, votre arrivée n°{{ticket}} a été enregistrée. Merci.'),
  ('arrival_received','whatsapp','ar','مرحباً، تم تسجيل وصولكم رقم {{ticket}}. شكراً.'),
  ('crushing_ready','whatsapp','fr','Votre dossier {{tracking}} passe sur la ligne {{line}}.'),
  ('crushing_ready','whatsapp','ar','ملفكم {{tracking}} على الخط {{line}}.'),
  ('crushing_done','sms','fr','Écrasement terminé - dossier {{tracking}}. Huile: {{oil}}kg.'),
  ('crushing_done','sms','ar','اكتملت العصر - الملف {{tracking}}. الزيت: {{oil}}كغ.')
on conflict do nothing;

-- ====== 20260418144806_29786714-3866-4b49-baa4-6c79b121c497.sql ======
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ====== 20260418145718_4c500bc3-875c-4a09-9dd5-dc63507bdbff.sql ======
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

-- ====== 20260418150650_80649613-98fc-4eeb-9af9-e4b18e3f9b96.sql ======
-- Extension trigram d'abord
create extension if not exists pg_trgm;

-- Index uniques
create unique index if not exists arrivals_ticket_number_unique on public.arrivals(ticket_number);
create unique index if not exists clients_code_unique on public.clients(code);

-- Index de recherche
create index if not exists clients_full_name_idx on public.clients using gin (full_name gin_trgm_ops);
create index if not exists clients_phone_idx on public.clients(phone);

-- Fonction : prochain numéro de ticket d'arrivée (format AAAAMMJJ-NNNN, reset quotidien)
create or replace function public.next_arrival_ticket()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  today_prefix text;
  next_seq int;
begin
  today_prefix := to_char(now() at time zone 'utc', 'YYYYMMDD');
  select coalesce(max(cast(split_part(ticket_number, '-', 2) as int)), 0) + 1
    into next_seq
  from public.arrivals
  where ticket_number like today_prefix || '-%';
  return today_prefix || '-' || lpad(next_seq::text, 4, '0');
end;
$$;

-- Fonction : prochain code client (format C-NNNNNN)
create or replace function public.next_client_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_seq int;
begin
  select coalesce(max(cast(substring(code from 3) as int)), 0) + 1
    into next_seq
  from public.clients
  where code ~ '^C-[0-9]+$';
  return 'C-' || lpad(next_seq::text, 6, '0');
end;
$$;

grant execute on function public.next_arrival_ticket() to authenticated;
grant execute on function public.next_client_code() to authenticated;

-- ====== 20260418152220_eb9b02e8-8375-4e3f-9351-caec4e188ce6.sql ======
-- Sequences for tracking codes & invoice numbers
create or replace function public.next_crushing_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  today_prefix text;
  next_seq int;
begin
  today_prefix := to_char(now() at time zone 'utc', 'YYYYMMDD');
  select coalesce(max(cast(split_part(tracking_code, '-', 3) as int)), 0) + 1
    into next_seq
  from public.crushing_files
  where tracking_code like 'E-' || today_prefix || '-%';
  return 'E-' || today_prefix || '-' || lpad(next_seq::text, 4, '0');
end;
$$;

create or replace function public.next_invoice_number()
returns text language plpgsql security definer set search_path = public as $$
declare
  yyyy text;
  next_seq int;
begin
  yyyy := to_char(now() at time zone 'utc', 'YYYY');
  select coalesce(max(cast(split_part(invoice_number, '-', 3) as int)), 0) + 1
    into next_seq
  from public.invoices
  where invoice_number like 'F-' || yyyy || '-%';
  return 'F-' || yyyy || '-' || lpad(next_seq::text, 5, '0');
end;
$$;

create or replace function public.next_lot_code(_kind stock_kind)
returns text language plpgsql security definer set search_path = public as $$
declare
  prefix text;
  yyyymm text;
  next_seq int;
begin
  prefix := case _kind
    when 'client_oil' then 'HC'
    when 'own_oil' then 'HP'
    when 'client_olives' then 'OL'
    when 'pomace' then 'GR'
    else 'BY'
  end;
  yyyymm := to_char(now() at time zone 'utc', 'YYYYMM');
  select coalesce(max(cast(split_part(lot_code, '-', 3) as int)), 0) + 1
    into next_seq
  from public.stock_lots
  where lot_code like prefix || '-' || yyyymm || '-%';
  return prefix || '-' || yyyymm || '-' || lpad(next_seq::text, 4, '0');
end;
$$;

-- Auto-update invoice totals from items
create or replace function public.recalc_invoice_totals(_invoice_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_subtotal numeric;
  v_tax_rate numeric;
  v_tax numeric;
  v_total numeric;
  v_paid numeric;
  v_status invoice_status;
begin
  select coalesce(sum(total), 0) into v_subtotal
    from public.invoice_items where invoice_id = _invoice_id;

  -- Read VAT rate from settings (default 20% Morocco)
  select coalesce((value->>'rate')::numeric, 20)
    into v_tax_rate
    from public.settings where key = 'vat_default';

  v_tax := round(v_subtotal * v_tax_rate / 100, 3);
  v_total := v_subtotal + v_tax;

  select coalesce(sum(amount), 0) into v_paid
    from public.payments where invoice_id = _invoice_id;

  v_status := case
    when v_total = 0 then 'draft'::invoice_status
    when v_paid >= v_total then 'paid'::invoice_status
    when v_paid > 0 then 'partial'::invoice_status
    else (select status from public.invoices where id = _invoice_id)
  end;

  update public.invoices
    set subtotal = v_subtotal,
        tax = v_tax,
        total = v_total,
        paid = v_paid,
        status = v_status
    where id = _invoice_id;
end;
$$;

create or replace function public.tg_invoice_items_recalc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE') then
    perform public.recalc_invoice_totals(old.invoice_id);
    return old;
  end if;
  -- compute total = quantity * unit_price
  new.total := round(coalesce(new.quantity, 0) * coalesce(new.unit_price, 0), 3);
  return new;
end;
$$;

drop trigger if exists trg_invoice_items_compute on public.invoice_items;
create trigger trg_invoice_items_compute
  before insert or update on public.invoice_items
  for each row execute function public.tg_invoice_items_recalc();

create or replace function public.tg_invoice_items_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_invoice_totals(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;

drop trigger if exists trg_invoice_items_after on public.invoice_items;
create trigger trg_invoice_items_after
  after insert or update or delete on public.invoice_items
  for each row execute function public.tg_invoice_items_after();

create or replace function public.tg_payments_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_invoice_totals(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;

drop trigger if exists trg_payments_after on public.payments;
create trigger trg_payments_after
  after insert or update or delete on public.payments
  for each row execute function public.tg_payments_after();

-- Auto-update stock lot quantity from movements
create or replace function public.tg_stock_movements_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_lot uuid;
  v_total numeric;
begin
  v_lot := coalesce(new.lot_id, old.lot_id);
  select coalesce(sum(case
    when movement_type = 'in' then quantity_kg
    when movement_type = 'out' then -quantity_kg
    when movement_type = 'adjustment' then quantity_kg
  end), 0)
    into v_total
    from public.stock_movements where lot_id = v_lot;
  update public.stock_lots set quantity_kg = v_total where id = v_lot;
  return null;
end;
$$;

drop trigger if exists trg_stock_movements_after on public.stock_movements;
create trigger trg_stock_movements_after
  after insert or update or delete on public.stock_movements
  for each row execute function public.tg_stock_movements_after();

-- Default settings (idempotent)
insert into public.settings (key, value, description) values
  ('vat_default', '{"rate": 20, "label": "TVA 20%", "country": "MA"}'::jsonb, 'Taux TVA par défaut (Maroc)'),
  ('vat_rates', '[{"rate":0,"label":"Exonéré"},{"rate":7,"label":"7%"},{"rate":10,"label":"10%"},{"rate":14,"label":"14%"},{"rate":20,"label":"20% standard"}]'::jsonb, 'Taux TVA disponibles (Maroc)'),
  ('mill_info', '{"name":"Moulin à Huile","address":"","phone":"","ice":"","if":"","rc":"","patente":"","cnss":""}'::jsonb, 'Informations légales du moulin'),
  ('currency', '{"code":"MAD","symbol":"DH","decimals":2}'::jsonb, 'Devise')
on conflict (key) do nothing;

-- Default crushing lines (idempotent)
insert into public.crushing_lines (code, name, hourly_capacity_kg, status)
select 'L1', 'Ligne 1', 800, 'available'::line_status
where not exists (select 1 from public.crushing_lines where code = 'L1');

insert into public.crushing_lines (code, name, hourly_capacity_kg, status)
select 'L2', 'Ligne 2', 800, 'available'::line_status
where not exists (select 1 from public.crushing_lines where code = 'L2');

-- ====== 20260418162705_573417c6-1bb3-4191-8eb8-3939de7095b1.sql ======
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

-- ====== 20260418162717_a1dcaeb2-8b62-4bb1-b855-92ac4fca0bae.sql ======
create or replace function public.tg_cfa_compute_net()
returns trigger
language plpgsql
set search_path = public
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

-- ====== 20260418164235_b4608d0c-b8a2-49f6-88d7-028febb729a2.sql ======
-- Remplace next_arrival_ticket pour générer un numéro par type de service
CREATE OR REPLACE FUNCTION public.next_arrival_ticket(_service_type service_type DEFAULT 'weigh_simple')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  prefix text;
  today_part text;
  next_seq int;
  full_prefix text;
begin
  prefix := case _service_type
    when 'weigh_simple' then 'PS'
    when 'weigh_double' then 'PD'
    when 'crushing' then 'EC'
    else 'AR'
  end;
  today_part := to_char(now() at time zone 'utc', 'YYYYMMDD');
  full_prefix := prefix || '-' || today_part || '-';
  select coalesce(max(cast(split_part(ticket_number, '-', 3) as int)), 0) + 1
    into next_seq
  from public.arrivals
  where ticket_number like full_prefix || '%';
  return full_prefix || lpad(next_seq::text, 4, '0');
end;
$function$;

-- ====== 20260418164820_d6b61d61-5967-48bf-a89b-fff6f6d78351.sql ======
-- 1. Type de balance
CREATE TYPE public.scale_kind AS ENUM ('scale', 'truck_scale');

-- 2. Table des balances
CREATE TABLE public.scales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  kind public.scale_kind NOT NULL DEFAULT 'scale',
  websocket_url text,
  max_capacity_kg numeric NOT NULL DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scales ENABLE ROW LEVEL SECURITY;

CREATE POLICY scales_read ON public.scales
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY scales_write ON public.scales
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'superviseur'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'superviseur'::app_role]));

-- Trigger updated_at
CREATE TRIGGER tg_scales_updated_at
  BEFORE UPDATE ON public.scales
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. Balance par défaut sur le profil utilisateur
ALTER TABLE public.profiles
  ADD COLUMN default_scale_id uuid REFERENCES public.scales(id) ON DELETE SET NULL;

-- 4. Traçabilité de la balance utilisée pour chaque pesée
ALTER TABLE public.weighings
  ADD COLUMN scale_id uuid REFERENCES public.scales(id) ON DELETE SET NULL;

CREATE INDEX idx_weighings_scale_id ON public.weighings(scale_id);

-- 5. Seed : reprendre l'URL existante des settings comme première balance "Balance 1"
DO $$
DECLARE
  v_url text;
BEGIN
  SELECT (value->>'url') INTO v_url
  FROM public.settings
  WHERE key = 'scale.websocket';

  IF v_url IS NOT NULL AND v_url <> '' THEN
    INSERT INTO public.scales (code, name, kind, websocket_url, max_capacity_kg, is_active)
    VALUES ('B-001', 'Balance 1', 'scale', v_url, 5000, true)
    ON CONFLICT (code) DO NOTHING;
  END IF;
END $$;

-- ====== 20260418170631_c3734c03-4b3f-48f0-b8f1-5b8fafb3c3bf.sql ======
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

-- ====== 20260418171830_a91ef0a6-c629-477d-a5f5-f628746f15ba.sql ======
-- Réaffecter le rôle admin au compte 'admin' s'il manque
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::app_role
FROM public.profiles p
WHERE p.username = 'admin'
ON CONFLICT (user_id, role) DO NOTHING;

-- ====== 20260418172536_6a143eec-514c-4731-8672-a4e48ccd180c.sql ======
-- Table des variétés d'olives
CREATE TABLE public.olive_varieties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_ar TEXT,
  avg_yield_percent NUMERIC(5,2),
  color TEXT DEFAULT '#84cc16',
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

-- RLS
ALTER TABLE public.olive_varieties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "varieties_read"
  ON public.olive_varieties
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "varieties_write"
  ON public.olive_varieties
  FOR ALL
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'superviseur'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'superviseur'::app_role]));

-- Trigger updated_at
CREATE TRIGGER tg_olive_varieties_updated_at
  BEFORE UPDATE ON public.olive_varieties
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_updated_at();

-- Données initiales : variétés courantes au Maroc
INSERT INTO public.olive_varieties (code, name, name_ar, avg_yield_percent, color, notes) VALUES
  ('PICHM', 'Picholine Marocaine', 'بيشولين المغربية', 20.00, '#65a30d', 'Variété principale au Maroc, double aptitude (huile + table)'),
  ('HAOUZ', 'Haouzia', 'الحوزية', 19.00, '#84cc16', 'Sélection de la Picholine, région du Haouz'),
  ('MENAR', 'Menara', 'المنارة', 21.00, '#16a34a', 'Variété marocaine sélectionnée, bon rendement'),
  ('ARBEQ', 'Arbequina', 'أربكينا', 22.00, '#22c55e', 'Variété espagnole, rendement élevé'),
  ('PICUA', 'Picual', 'بيكوال', 23.00, '#15803d', 'Variété espagnole, huile très stable');


-- ====== 20260419055828_f4c2d072-d4d5-4892-9757-06f5dcb3700e.sql ======
-- Create enum for product categories
DO $$ BEGIN
  CREATE TYPE public.product_category AS ENUM ('olive', 'oil', 'byproduct', 'service');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.product_unit AS ENUM ('kg', 'liter', 'unit', 'service');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Rename table
ALTER TABLE public.olive_varieties RENAME TO products;

-- Add new columns
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category public.product_category NOT NULL DEFAULT 'olive',
  ADD COLUMN IF NOT EXISTS unit public.product_unit NOT NULL DEFAULT 'kg',
  ADD COLUMN IF NOT EXISTS unit_price numeric(12,3);

-- Migrate existing rows: all are olives
UPDATE public.products SET category = 'olive', unit = 'kg' WHERE category IS NULL OR true;

-- Drop default after backfill (so future inserts must specify)
ALTER TABLE public.products ALTER COLUMN category DROP DEFAULT;

-- Rename existing RLS policies (they follow the table)
-- Policies remain valid; rename for clarity
ALTER POLICY varieties_read ON public.products RENAME TO products_read;
ALTER POLICY varieties_write ON public.products RENAME TO products_write;


-- ====== 20260419061009_04cbbb7f-9707-4a8d-bb4d-c2184121f34d.sql ======
-- Ajout du produit (variété d'olive) sur les arrivées pour catégoriser ce qui est apporté à l'écrasement
ALTER TABLE public.arrivals
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_arrivals_product_id ON public.arrivals(product_id);

-- ====== 20260419085311_d088487b-11ea-496b-b2bc-f7d4d2871353.sql ======
-- Add needs_crushing flag on arrivals
ALTER TABLE public.arrivals
  ADD COLUMN IF NOT EXISTS needs_crushing boolean NOT NULL DEFAULT false;

-- Backfill: existing rows with service_type = 'crushing' should have the flag set
UPDATE public.arrivals
  SET needs_crushing = true
  WHERE service_type = 'crushing' AND needs_crushing = false;

CREATE INDEX IF NOT EXISTS arrivals_needs_crushing_idx
  ON public.arrivals (needs_crushing)
  WHERE needs_crushing = true;

-- ====== 20260419091500_24e28053-8fa7-412a-a42e-354818104676.sql ======
-- Allow an arrival to be pre-attached to an existing crushing file (chosen at arrival creation)
ALTER TABLE public.arrivals
  ADD COLUMN IF NOT EXISTS target_crushing_file_id uuid NULL
    REFERENCES public.crushing_files(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS arrivals_target_crushing_file_id_idx
  ON public.arrivals (target_crushing_file_id)
  WHERE target_crushing_file_id IS NOT NULL;

-- ====== 20260419094929_287aef0e-2423-450e-a723-7fc465d39165.sql ======
-- Permettre aux peseurs de corriger les pesages (le code applicatif vérifie
-- que le dossier rattaché est encore queued/assigned avant de mettre à jour).
DROP POLICY IF EXISTS weighings_update ON public.weighings;
CREATE POLICY weighings_update
ON public.weighings
FOR UPDATE
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'superviseur'::app_role, 'peseur'::app_role]));

-- ============================================================
-- Mode local : desactive RLS pour toutes les tables publiques
-- (les RLS Supabase utilisent auth.uid() qui retournera NULL ici)
-- Commentez ce bloc si vous integrez une auth compatible.
-- ============================================================
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;