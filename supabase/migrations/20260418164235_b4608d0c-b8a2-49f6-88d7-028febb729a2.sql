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