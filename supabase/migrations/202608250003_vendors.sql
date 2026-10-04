-- A shared supplier directory keeps vendor contact and fulfilment details separate
-- from the product catalogue while allowing every workspace member to maintain it.
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict default auth.uid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 120),
  phone text not null default '' check (char_length(phone) <= 32),
  email text not null default '' check (char_length(email) <= 160),
  address text not null default '' check (char_length(address) <= 240),
  notes text not null default '' check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendors_name_idx on public.vendors (name);

-- Product suppliers already recorded in the catalogue become starter directory rows.
insert into public.vendors (owner_id, name)
select distinct on (lower(btrim(supplier_name))) owner_id, btrim(supplier_name)
from public.library_items
where kind = 'product' and nullif(btrim(coalesce(supplier_name, '')), '') is not null
order by lower(btrim(supplier_name)), created_at
on conflict (name) do nothing;

alter table public.vendors enable row level security;
drop policy if exists "Workspace members manage vendors" on public.vendors;
create policy "Workspace members manage vendors" on public.vendors
  for all to authenticated using (public.is_app_member()) with check (public.is_app_member());

drop trigger if exists vendors_updated_at on public.vendors;
create trigger vendors_updated_at before update on public.vendors
for each row execute function public.set_updated_at();
