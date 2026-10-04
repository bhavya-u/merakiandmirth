-- Run this in Supabase Dashboard → SQL Editor.
create table if not exists public.library_items (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('product', 'combo')),
  name text not null check (char_length(name) between 1 and 160),
  cost numeric(12,2) not null check (cost >= 0),
  contents text not null default '',
  component_ids text[] not null default '{}',
  occasions text[] not null default '{All occasions}',
  photo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bags (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  cost numeric(12,2) not null check (cost >= 0),
  detail text not null default '',
  recommended boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.library_items
  add column if not exists buffer numeric(12,2) not null default 0 check (buffer >= 0);

alter table public.library_items
  add column if not exists rounded_price numeric(12,0) generated always as (round(cost + buffer)) stored;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  code text not null,
  title text not null,
  event text not null,
  qty integer not null check (qty > 0),
  total numeric(12,2) not null check (total >= 0),
  status text not null default 'Enquiry' check (status in ('Enquiry','Quotation sent','Follow-up','Confirmed','Advance pending','Advance paid','Procurement','Packaging','Ready for dispatch','Out for delivery','Delivered','Full amount paid','Closed','Lost','Cancelled')),
  host text not null default '',
  need_by date,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, code)
);

-- Quote add-on prices are shared configuration. A quotation saves a snapshot of
-- the chosen price and charges in `orders`, so later price changes are safe.
create table if not exists public.quote_card_options (
  code text primary key,
  label text not null check (char_length(label) between 1 and 100),
  size_inches numeric(3,1) not null check (size_inches > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  custom_design_fee numeric(12,2) not null default 100 check (custom_design_fee >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists event_date date,
  add column if not exists delivery_date date,
  add column if not exists net_wrapping boolean not null default false,
  add column if not exists thank_you_card_code text references public.quote_card_options(code) on delete set null,
  add column if not exists thank_you_card_style text not null default 'none' check (thank_you_card_style in ('none', 'general', 'customized')),
  add column if not exists thank_you_card_unit_price numeric(12,2) not null default 0 check (thank_you_card_unit_price >= 0),
  add column if not exists thank_you_card_design_fee numeric(12,2) not null default 0 check (thank_you_card_design_fee >= 0),
  add column if not exists complimentary text not null default '',
  add column if not exists discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  add column if not exists discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  add column if not exists subtotal_before_discount numeric(12,2) not null default 0 check (subtotal_before_discount >= 0);

create index if not exists library_items_owner_kind_idx on public.library_items (owner_id, kind);
create index if not exists orders_owner_status_need_by_idx on public.orders (owner_id, status, need_by);
create index if not exists orders_event_date_idx on public.orders (event_date);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists library_items_updated_at on public.library_items;
create trigger library_items_updated_at before update on public.library_items for each row execute function public.set_updated_at();
drop trigger if exists bags_updated_at on public.bags;
create trigger bags_updated_at before update on public.bags for each row execute function public.set_updated_at();
drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders for each row execute function public.set_updated_at();
drop trigger if exists quote_card_options_updated_at on public.quote_card_options;
create trigger quote_card_options_updated_at before update on public.quote_card_options for each row execute function public.set_updated_at();

alter table public.library_items enable row level security;
alter table public.bags enable row level security;
alter table public.orders enable row level security;
alter table public.quote_card_options enable row level security;
create policy "Users manage their library" on public.library_items for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Users manage their bags" on public.bags for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Users manage their orders" on public.orders for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Workspace members manage quote card options" on public.quote_card_options for all to authenticated using (public.is_app_member()) with check (public.is_app_member());
