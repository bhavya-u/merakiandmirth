-- A shared operational foundation for the Celebration lifecycle and inventory ledger.
-- A celebration begins as an enquiry and remains one record through quote, payment,
-- fulfilment, and delivery. The client UI will introduce these stages progressively.

alter table public.orders
  add column if not exists customer_name text not null default '',
  add column if not exists customer_email text not null default '',
  add column if not exists delivery_address text not null default '',
  add column if not exists delivery_pincode text not null default '',
  add column if not exists quote_sent_at timestamptz,
  add column if not exists quote_valid_until date,
  add column if not exists converted_at timestamptz,
  add column if not exists advance_due numeric(12,2) not null default 0 check (advance_due >= 0),
  add column if not exists final_paid numeric(12,2) not null default 0 check (final_paid >= 0),
  add column if not exists expenses_total numeric(12,2) not null default 0 check (expenses_total >= 0),
  add column if not exists cost_snapshot numeric(12,2) not null default 0 check (cost_snapshot >= 0),
  add column if not exists lost_reason text not null default '';

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in (
  'Enquiry', 'Quotation sent', 'Follow-up', 'Confirmed', 'Advance pending',
  'Advance paid', 'Procurement', 'Packaging', 'Ready for dispatch',
  'Out for delivery', 'Delivered', 'Closed', 'Lost', 'Cancelled'
));

create table if not exists public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null default auth.uid(),
  from_status text,
  to_status text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null default auth.uid(),
  payment_type text not null check (payment_type in ('advance', 'balance', 'refund')),
  amount numeric(12,2) not null check (amount > 0),
  received_at timestamptz not null default now(),
  method text not null default '',
  reference text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.order_fulfilment_tasks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  task_type text not null check (task_type in ('procurement', 'packaging', 'dispatch', 'delivery')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'blocked')),
  due_at timestamptz,
  completed_at timestamptz,
  note text not null default '',
  unique (order_id, task_type)
);

-- Notifications are deliberately queued and logged server-side. The Telegram Edge
-- Function can process unsent rows without relying on a browser remaining open.
create table if not exists public.operation_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  event_type text not null,
  message text not null,
  channel text not null default 'telegram' check (channel in ('telegram', 'email')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  failure_reason text not null default '',
  created_at timestamptz not null default now(),
  unique (order_id, event_type, channel)
);

create index if not exists order_status_events_order_created_idx on public.order_status_events(order_id, created_at desc);
create index if not exists order_payments_order_received_idx on public.order_payments(order_id, received_at desc);
create index if not exists order_fulfilment_tasks_order_status_idx on public.order_fulfilment_tasks(order_id, status);
create index if not exists operation_notifications_pending_idx on public.operation_notifications(created_at) where status = 'pending';
create index if not exists orders_status_delivery_date_idx on public.orders(status, delivery_date);

alter table public.order_status_events enable row level security;
alter table public.order_payments enable row level security;
alter table public.order_fulfilment_tasks enable row level security;
alter table public.operation_notifications enable row level security;

drop policy if exists "Workspace members manage order status events" on public.order_status_events;
create policy "Workspace members manage order status events" on public.order_status_events for all to authenticated using (public.is_app_member()) with check (public.is_app_member());
drop policy if exists "Workspace members manage order payments" on public.order_payments;
create policy "Workspace members manage order payments" on public.order_payments for all to authenticated using (public.is_app_member()) with check (public.is_app_member());
drop policy if exists "Workspace members manage fulfilment tasks" on public.order_fulfilment_tasks;
create policy "Workspace members manage fulfilment tasks" on public.order_fulfilment_tasks for all to authenticated using (public.is_app_member()) with check (public.is_app_member());
drop policy if exists "Workspace members manage operation notifications" on public.operation_notifications;
create policy "Workspace members manage operation notifications" on public.operation_notifications for all to authenticated using (public.is_app_member()) with check (public.is_app_member());

-- Inventory movements are the source of truth. Applying a movement and changing the
-- on-hand number happen in the same database transaction, so concurrent updates cannot
-- silently overwrite each other or make stock negative.
create or replace function public.apply_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_id text := case when tg_op = 'DELETE' then old.library_item_id else new.library_item_id end;
  delta integer := case when tg_op = 'DELETE' then -old.quantity_delta else new.quantity_delta end;
begin
  update public.library_items
     set stock_on_hand = stock_on_hand + delta
   where id = item_id
     and kind = 'product'
     and stock_on_hand + delta >= 0;

  if not found then
    raise exception 'Stock update rejected: product was not found or stock cannot go below zero';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists inventory_movements_apply_stock on public.inventory_movements;
create trigger inventory_movements_apply_stock
after insert or delete on public.inventory_movements
for each row execute function public.apply_inventory_movement();

create index if not exists inventory_movements_workspace_item_created_idx on public.inventory_movements(library_item_id, created_at desc);

-- Keep the ledger append-only for staff. Corrections are new adjustment rows rather
-- than edits to past history.
drop policy if exists "Workspace members manage inventory movements" on public.inventory_movements;
drop policy if exists "Workspace members view inventory movements" on public.inventory_movements;
drop policy if exists "Workspace members record inventory movements" on public.inventory_movements;
create policy "Workspace members view inventory movements" on public.inventory_movements for select to authenticated using (public.is_app_member());
create policy "Workspace members record inventory movements" on public.inventory_movements for insert to authenticated with check (public.is_app_member());
