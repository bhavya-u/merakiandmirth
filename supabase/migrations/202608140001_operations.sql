-- Operational inventory, enquiry, fulfilment, and reminder layer.
create extension if not exists pgcrypto;

alter table public.library_items
  add column if not exists sku text,
  add column if not exists stock_on_hand integer not null default 0 check (stock_on_hand >= 0),
  add column if not exists reorder_level integer not null default 0 check (reorder_level >= 0),
  add column if not exists supplier_name text not null default '',
  add column if not exists lead_time_days integer not null default 0 check (lead_time_days >= 0);

alter table public.orders
  add column if not exists delivery_date date,
  add column if not exists advance_paid numeric(12,2) not null default 0 check (advance_paid >= 0),
  add column if not exists customer_phone text not null default '',
  add column if not exists notes text not null default '';

create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  customer_name text not null,
  customer_phone text not null default '',
  occasion text not null default '',
  event_date date,
  expected_quantity integer check (expected_quantity > 0),
  expected_value numeric(12,2) check (expected_value >= 0),
  stage text not null default 'New' check (stage in ('New','Quoted','Follow-up','Won','Lost')),
  follow_up_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  library_item_id text not null references public.library_items(id) on delete restrict,
  quantity_delta integer not null check (quantity_delta <> 0),
  movement_type text not null check (movement_type in ('opening','purchase','reservation','release','fulfilment','adjustment','damage')),
  order_id uuid references public.orders(id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.delivery_reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('three_days','one_day','delivery_day','overdue')),
  due_at timestamptz not null,
  sent_at timestamptz,
  channel text not null default 'telegram' check (channel in ('telegram','email')),
  unique (order_id, reminder_type)
);

create index if not exists enquiries_owner_stage_follow_up_idx on public.enquiries(owner_id, stage, follow_up_at);
create index if not exists inventory_movements_item_created_idx on public.inventory_movements(library_item_id, created_at desc);
create index if not exists delivery_reminders_due_unsent_idx on public.delivery_reminders(due_at) where sent_at is null;

drop trigger if exists enquiries_updated_at on public.enquiries;
create trigger enquiries_updated_at before update on public.enquiries for each row execute function public.set_updated_at();

alter table public.enquiries enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.delivery_reminders enable row level security;
drop policy if exists "Users manage their enquiries" on public.enquiries;
create policy "Users manage their enquiries" on public.enquiries for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "Users manage their inventory movements" on public.inventory_movements;
create policy "Users manage their inventory movements" on public.inventory_movements for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "Users manage their delivery reminders" on public.delivery_reminders;
create policy "Users manage their delivery reminders" on public.delivery_reminders for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Creates the standard operational reminder schedule for orders with a delivery date.
create or replace function public.ensure_delivery_reminders()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.delivery_date is not null then
    insert into public.delivery_reminders (owner_id, order_id, reminder_type, due_at)
    values
      (new.owner_id, new.id, 'three_days', (new.delivery_date - 3)::timestamp at time zone 'Asia/Kolkata'),
      (new.owner_id, new.id, 'one_day', (new.delivery_date - 1)::timestamp at time zone 'Asia/Kolkata'),
      (new.owner_id, new.id, 'delivery_day', new.delivery_date::timestamp at time zone 'Asia/Kolkata')
    on conflict (order_id, reminder_type) do update set due_at = excluded.due_at;
  end if;
  return new;
end; $$;
drop trigger if exists orders_delivery_reminders on public.orders;
create trigger orders_delivery_reminders after insert or update of delivery_date on public.orders
for each row execute function public.ensure_delivery_reminders();

insert into storage.buckets (id, name, public) values ('catalogue', 'catalogue', true)
on conflict (id) do nothing;
drop policy if exists "Authenticated users upload catalogue assets" on storage.objects;
create policy "Authenticated users upload catalogue assets" on storage.objects for insert to authenticated with check (bucket_id = 'catalogue');
drop policy if exists "Public catalogue assets are readable" on storage.objects;
create policy "Public catalogue assets are readable" on storage.objects for select using (bucket_id = 'catalogue');
