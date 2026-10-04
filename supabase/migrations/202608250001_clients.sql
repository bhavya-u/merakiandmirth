-- Reusable client records keep contact and delivery information consistent across
-- quotations while orders retain a historical snapshot of the details used then.
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict default auth.uid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  mobile_number text not null unique check (mobile_number ~ '^[0-9]{7,15}$'),
  delivery_area text not null default '' check (char_length(delivery_area) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists delivery_area text not null default '' check (char_length(delivery_area) <= 160);

create index if not exists clients_name_idx on public.clients (name);
create index if not exists orders_client_id_idx on public.orders (client_id);

-- Preserve the most recently used client details when bringing past quotations
-- into the new shared client directory.
insert into public.clients (owner_id, name, mobile_number, delivery_area, created_at, updated_at)
select distinct on (regexp_replace(o.customer_phone, '[^0-9]', '', 'g'))
  o.owner_id,
  coalesce(nullif(btrim(o.customer_name), ''), 'Client'),
  regexp_replace(o.customer_phone, '[^0-9]', '', 'g'),
  coalesce(nullif(btrim(o.delivery_area), ''), ''),
  o.created_at,
  o.created_at
from public.orders o
where regexp_replace(coalesce(o.customer_phone, ''), '[^0-9]', '', 'g') ~ '^[0-9]{7,15}$'
order by regexp_replace(o.customer_phone, '[^0-9]', '', 'g'), o.created_at desc
on conflict (mobile_number) do nothing;

update public.orders o
set client_id = c.id
from public.clients c
where o.client_id is null
  and regexp_replace(coalesce(o.customer_phone, ''), '[^0-9]', '', 'g') = c.mobile_number;

alter table public.clients enable row level security;
drop policy if exists "Workspace members manage clients" on public.clients;
create policy "Workspace members manage clients" on public.clients
  for all to authenticated using (public.is_app_member()) with check (public.is_app_member());

drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at before update on public.clients
for each row execute function public.set_updated_at();
