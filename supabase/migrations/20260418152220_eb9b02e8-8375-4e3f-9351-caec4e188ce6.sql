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