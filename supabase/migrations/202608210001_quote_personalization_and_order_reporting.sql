-- A celebration title and a client request travel with the quotation into the
-- order workboard.  The date/status index supports the filtered operational
-- dashboard without weakening the existing workspace RLS policy.
alter table public.orders
  add column if not exists special_request text not null default '';

create index if not exists orders_status_created_at_idx
  on public.orders (status, created_at desc);
