-- Internal cost adjustments are retained with a quotation but are never part of
-- the client-facing itemisation. Each object is { label: text, amount: number }.
alter table public.orders
  add column if not exists additional_costs jsonb not null default '[]'::jsonb;

alter table public.orders
  drop constraint if exists orders_additional_costs_is_array;

alter table public.orders
  add constraint orders_additional_costs_is_array
  check (jsonb_typeof(additional_costs) = 'array');
