-- Keep a direct, durable reference to the saved combo used for each quotation.
alter table public.orders
  add column if not exists combo_id text references public.library_items(id) on delete set null;

create index if not exists orders_combo_id_idx on public.orders (combo_id);

-- Existing quotations already preserve this ID inside their immutable item snapshot.
-- Copy it across only when it still refers to a saved combo.
update public.orders as orders
set combo_id = orders.items -> 0 ->> 'comboId'
where orders.combo_id is null
  and nullif(orders.items -> 0 ->> 'comboId', '') is not null
  and exists (
    select 1
    from public.library_items as item
    where item.id = orders.items -> 0 ->> 'comboId'
      and item.kind = 'combo'
  );
