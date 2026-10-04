-- Store the chosen net-wrapping rate on each order so historical quotes stay accurate.
alter table public.orders
  add column if not exists net_wrapping_unit_price numeric(12, 2) not null default 0;

alter table public.orders
  drop constraint if exists orders_net_wrapping_unit_price_check;

alter table public.orders
  add constraint orders_net_wrapping_unit_price_check
  check (net_wrapping_unit_price >= 0);
