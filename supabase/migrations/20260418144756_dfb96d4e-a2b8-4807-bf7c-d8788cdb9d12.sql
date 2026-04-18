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