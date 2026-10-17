begin;
create table public.quotation_revisions (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
 actor_id uuid not null, created_at timestamptz not null default now(), previous_quote jsonb not null
);
alter table public.quotation_revisions enable row level security;
revoke all on public.quotation_revisions from public,anon,authenticated;
grant select on public.quotation_revisions to authenticated;
create policy quotation_revision_read on public.quotation_revisions for select to authenticated using(public.is_app_member());
create function public.update_quotation_once(p_operation uuid,p_id uuid,p_expected jsonb,p_client jsonb,p_order jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; request jsonb:=jsonb_build_object('id',p_id,'expected',p_expected,'client',p_client,'order',p_order); old public.orders%rowtype; r public.orders%rowtype; client uuid;
begin
 result:=public.check_workspace_write(p_operation,'quotation-edit',request);
 if result is not null then return result; end if;
 select * into old from public.orders where id=p_id for update;
 if not found then raise exception 'Quotation not found'; end if;
 if to_jsonb(old) is distinct from p_expected then raise exception 'Quotation changed. Reopen it before editing again.'; end if;
 if old.status not in ('Enquiry','Quotation sent','Follow-up') then raise exception 'Confirmed orders cannot be edited as quotations'; end if;
 r:=jsonb_populate_record(null::public.orders,p_order);
 if r.qty is null or r.qty<1 or r.total is null or r.total<0 or r.total::text in ('NaN','Infinity') or coalesce(trim(r.title),'')='' or coalesce(p_client->>'mobile_number','') !~ '^[0-9]{7,15}$' or coalesce(trim(p_client->>'name'),'')='' then raise exception 'Invalid quotation details'; end if;
 insert into public.clients(owner_id,name,mobile_number,delivery_area) values(auth.uid(),p_client->>'name',p_client->>'mobile_number',coalesce(p_client->>'delivery_area','')) on conflict(mobile_number) do update set name=excluded.name,delivery_area=excluded.delivery_area returning id into client;
 insert into public.quotation_revisions(order_id,actor_id,previous_quote) values(p_id,auth.uid(),to_jsonb(old));
 update public.orders set client_id=client, title=r.title, event=r.event, qty=r.qty, total=r.total, combo_id=r.combo_id, customer_name=r.customer_name, customer_phone=r.customer_phone, delivery_area=r.delivery_area, special_request=r.special_request, complimentary=r.complimentary, event_date=r.event_date, delivery_date=r.delivery_date, net_wrapping=r.net_wrapping, net_wrapping_unit_price=r.net_wrapping_unit_price, additional_costs=r.additional_costs, discount_percent=r.discount_percent, discount_amount=r.discount_amount, subtotal_before_discount=r.subtotal_before_discount, cost_snapshot=r.cost_snapshot, items=r.items where id=p_id;
 result:=jsonb_build_object('id',p_id);
 insert into public.workspace_write_receipts values(auth.uid(),p_operation,'quotation-edit',request,result,now());
 return result;
end; $$;
revoke all on function public.update_quotation_once(uuid,uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.update_quotation_once(uuid,uuid,jsonb,jsonb,jsonb) to authenticated;
commit;
