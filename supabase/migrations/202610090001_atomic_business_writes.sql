DO $migration$
BEGIN
EXECUTE $ddl$
create table public.workspace_write_receipts (
 actor_id uuid not null, operation_id uuid not null, kind text not null,
 request jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(actor_id,operation_id)
);
alter table public.workspace_write_receipts enable row level security;
revoke all on public.workspace_write_receipts from public,anon,authenticated;

create function public.check_workspace_write(p_operation uuid,p_kind text,p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare receipt public.workspace_write_receipts%rowtype;
begin
 if auth.uid() is null or not public.is_app_member() then raise exception 'Workspace membership required'; end if;
 if p_operation is null then raise exception 'Operation ID required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_operation::text,0));
 select * into receipt from public.workspace_write_receipts where actor_id=auth.uid() and operation_id=p_operation;
 if found then
  if receipt.kind<>p_kind or receipt.request is distinct from p_request then raise exception 'Operation ID already used with different input'; end if;
  return receipt.result;
 end if;
 return null;
end;
$function$;
revoke all on function public.check_workspace_write(uuid,text,jsonb) from public,anon,authenticated;

create function public.record_inventory_once(p_operation uuid,p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare result jsonb; stock integer; delta integer; movement uuid; action text:=p_request->>'action'; quantity integer:=(p_request->>'quantity')::integer;
begin
 result:=public.check_workspace_write(p_operation,'inventory',p_request);
 if result is not null then return result; end if;
 select stock_on_hand into stock from public.library_items where id=p_request->>'product_id' and kind='product' for update;
 if not found then raise exception 'Product not found'; end if;
 if action not in ('receive','damage','adjustment','set') or action is null or quantity is null then raise exception 'Invalid stock action'; end if;
 if action in ('receive','damage','set') and quantity<0 then raise exception 'Quantity must be nonnegative'; end if;
 if action='set' and stock is distinct from (p_request->>'expected_stock')::integer then raise exception 'Stock changed; reopen the stock dialog'; end if;
 delta:=case action when 'set' then quantity-stock when 'damage' then -quantity else quantity end;
 if delta=0 then raise exception 'Stock is unchanged'; end if;
 insert into public.inventory_movements(owner_id,library_item_id,quantity_delta,movement_type,note)
 values(auth.uid(),p_request->>'product_id',delta,case action when 'receive' then 'purchase' when 'damage' then 'damage' else 'adjustment' end,coalesce(p_request->>'note','')) returning id into movement;
 update public.library_items set reorder_level=(p_request->>'reorder_level')::integer where id=p_request->>'product_id';
 result:=jsonb_build_object('movement_id',movement);
 insert into public.workspace_write_receipts values(auth.uid(),p_operation,'inventory',p_request,result,now());
 return result;
end;
$function$;

create function public.save_quotation_once(p_operation uuid,p_client jsonb,p_order jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare result jsonb; request jsonb:=jsonb_build_object('client',p_client,'order',p_order); client uuid; saved uuid;
begin
 result:=public.check_workspace_write(p_operation,'quotation',request);
 if result is not null then return result; end if;
 insert into public.clients(owner_id,name,mobile_number,delivery_area)
 values(auth.uid(),p_client->>'name',p_client->>'mobile_number',coalesce(p_client->>'delivery_area',''))
 on conflict(mobile_number) do update set name=excluded.name,delivery_area=excluded.delivery_area returning id into client;
 insert into public.orders(owner_id,client_id,code,title,event,qty,total,status,combo_id,customer_name,customer_phone,delivery_area,special_request,complimentary,event_date,delivery_date,net_wrapping,net_wrapping_unit_price,additional_costs,discount_percent,discount_amount,subtotal_before_discount,quote_sent_at,cost_snapshot,items)
 select auth.uid(),client,'MAM-'||p_operation::text,r.title,r.event,r.qty,r.total,'Quotation sent',r.combo_id,r.customer_name,r.customer_phone,r.delivery_area,r.special_request,r.complimentary,r.event_date,r.delivery_date,r.net_wrapping,r.net_wrapping_unit_price,r.additional_costs,r.discount_percent,r.discount_amount,r.subtotal_before_discount,now(),r.cost_snapshot,r.items
 from jsonb_populate_record(null::public.orders,p_order) r returning id into saved;
 result:=jsonb_build_object('id',saved);
 insert into public.workspace_write_receipts values(auth.uid(),p_operation,'quotation',request,result,now());
 return result;
end;
$function$;

create function public.delete_product_atomic(p_product text)
returns boolean language plpgsql security definer set search_path='' as $function$
begin
 if auth.uid() is null or not public.is_app_member() then raise exception 'Workspace membership required'; end if;
 perform 1 from public.library_items where id=p_product and kind='product' for update;
 if not found then return false; end if;
 update public.library_items set component_ids=array_remove(component_ids,p_product)
 where kind='combo' and p_product=any(component_ids);
 delete from public.library_items where id=p_product and kind='product';
 return true;
end;
$function$;

revoke all on function public.record_inventory_once(uuid,jsonb) from public,anon;
revoke all on function public.save_quotation_once(uuid,jsonb,jsonb) from public,anon;
revoke all on function public.delete_product_atomic(text) from public,anon;
grant execute on function public.record_inventory_once(uuid,jsonb) to authenticated;
grant execute on function public.save_quotation_once(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.delete_product_atomic(text) to authenticated;


$ddl$;
END;
$migration$;
