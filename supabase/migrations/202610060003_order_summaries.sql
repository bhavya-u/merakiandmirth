create function public.workspace_order_summary(p_from date, p_to date)
returns jsonb language sql stable security invoker set search_path = '' as $$
with scoped as (
 select o.*, coalesce(nullif(o.cost_snapshot,0),
   coalesce((o.items->0->>'unitCost')::numeric,
     (select coalesce(sum(coalesce(p.rounded_price,round(greatest(p.cost,0)+greatest(p.buffer,0)))),0)
      from public.library_items c cross join lateral unnest(c.component_ids) component(id)
      join public.library_items p on p.id=component.id
      where c.id=coalesce(o.combo_id,o.items->0->>'comboId')),
     0) * o.qty,0) as effective_cost
 from public.orders o
 where (p_from is null or o.created_at >= p_from::timestamp at time zone 'UTC')
   and (p_to is null or o.created_at < (p_to+1)::timestamp at time zone 'UTC')
)
select jsonb_build_object(
 'count',count(*),
 'packing',count(*) filter(where status in ('Packaging','Ready for dispatch')),
 'delivered',count(*) filter(where status in ('Delivered','Full amount paid','Closed')),
 'converted',count(*) filter(where status in ('Confirmed','Advance paid','Procurement','Packaging','Ready for dispatch','Out for delivery','Delivered','Full amount paid','Closed')),
 'qualifying',count(*) filter(where status not in ('Lost','Dropped')),
 'profit',coalesce(sum(total-effective_cost-coalesce(expenses_total,0)) filter(where status in ('Full amount paid','Closed')),0)
) from scoped;
$$;
create function public.workspace_client_order_summary()
returns table(client_id uuid, order_count bigint, latest_title text, latest_status text)
language sql stable security invoker set search_path = '' as $$
select c.id, stats.n, latest.title, latest.status
from public.clients c
cross join lateral (
 select count(*) as n from public.orders o where o.client_id=c.id or (o.client_id is null and o.customer_phone=c.mobile_number)
) stats
left join lateral (
 select o.title,o.status from public.orders o where o.client_id=c.id or (o.client_id is null and o.customer_phone=c.mobile_number)
 order by o.created_at desc,o.id desc limit 1
) latest on true;
$$;
revoke all on function public.workspace_order_summary(date,date) from public,anon;
revoke all on function public.workspace_client_order_summary() from public,anon;
grant execute on function public.workspace_order_summary(date,date) to authenticated,service_role;
grant execute on function public.workspace_client_order_summary() to authenticated,service_role;
create index if not exists orders_ledger_page on public.orders(created_at desc,id desc);
create index if not exists orders_client_lookup on public.orders(client_id,created_at desc,id desc);
create index if not exists orders_legacy_phone_lookup on public.orders(customer_phone,created_at desc,id desc) where client_id is null;
