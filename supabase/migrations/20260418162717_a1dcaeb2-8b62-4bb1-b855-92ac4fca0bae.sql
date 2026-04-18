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