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