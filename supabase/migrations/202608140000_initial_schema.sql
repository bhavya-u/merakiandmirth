create extension if not exists pgcrypto;
create table if not exists public.library_items (
 id text primary key, owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
 kind text not null check (kind in ('product','combo')), name text not null, cost numeric(12,2) not null check(cost>=0),
 category text not null default '', emoji text not null default '✦', contents text not null default '', component_ids text[] not null default '{}', occasions text[] not null default '{All occasions}', photo text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.bags (
 id text primary key, owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
 name text not null, cost numeric(12,2) not null check(cost>=0), detail text not null default '', recommended boolean not null default false, updated_at timestamptz not null default now());
create table if not exists public.orders (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
 code text not null, title text not null, event text not null, qty integer not null check(qty>0), total numeric(12,2) not null check(total>=0),
 status text not null default 'Enquiry' check(status in ('Enquiry','Confirmed','Advance paid','Ready','Delivered')),
 host text not null default '', need_by date, items jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_id,code));
create index if not exists library_items_owner_kind_idx on public.library_items(owner_id,kind);
create index if not exists orders_owner_status_need_by_idx on public.orders(owner_id,status,need_by);
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists library_items_updated_at on public.library_items;
create trigger library_items_updated_at before update on public.library_items for each row execute function public.set_updated_at();
drop trigger if exists bags_updated_at on public.bags;
create trigger bags_updated_at before update on public.bags for each row execute function public.set_updated_at();
drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders for each row execute function public.set_updated_at();
alter table public.library_items enable row level security; alter table public.bags enable row level security; alter table public.orders enable row level security;
drop policy if exists "Users manage their library" on public.library_items;
create policy "Users manage their library" on public.library_items for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());
drop policy if exists "Users manage their bags" on public.bags;
create policy "Users manage their bags" on public.bags for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());
drop policy if exists "Users manage their orders" on public.orders;
create policy "Users manage their orders" on public.orders for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());
