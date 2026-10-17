import {status,sql} from './common.mjs';
import {readFileSync} from 'node:fs';
status();
const migration=sql("select to_regclass('public.quotation_revisions') is not null")==='t' ? '' : readFileSync(new URL('../../supabase/migrations/202610130001_quote_revisions.sql',import.meta.url),'utf8').replace(/^begin;/,'').replace(/commit;\s*$/,'');
console.log(sql(`begin; ${migration}
do $$
declare actor uuid; saved jsonb; before_row jsonb; payload jsonb; client jsonb:='{"name":"Quote edit test","mobile_number":"9990001234"}'; ident uuid; op uuid:=gen_random_uuid(); failed boolean;
begin
select id into actor from auth.users where email='owner@example.test';
perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'email','owner@example.test','role','authenticated')::text,true);
payload:='{"title":"Test quote","event":"birthday","qty":2,"total":100,"items":[],"additional_costs":[],"customer_name":"Quote edit test","customer_phone":"9990001234","delivery_area":"","special_request":"","complimentary":"","net_wrapping":false,"net_wrapping_unit_price":0,"discount_percent":0,"discount_amount":0,"subtotal_before_discount":100,"cost_snapshot":50}';
saved:=public.save_quotation_once(gen_random_uuid(),client,payload);ident:=(saved->>'id')::uuid;
select to_jsonb(o) into before_row from public.orders o where id=ident;
payload:=payload||'{"total":150,"qty":3}';
perform public.update_quotation_once(op,ident,before_row,client,payload);
perform public.update_quotation_once(op,ident,before_row,client,payload);
if (select count(*) from public.quotation_revisions where order_id=ident)<>1 then raise exception 'Duplicate audit';end if;
if (select total from public.orders where id=ident)<>150 or (select code from public.orders where id=ident)<>before_row->>'code' then raise exception 'Incorrect update';end if;
if (select previous_quote from public.quotation_revisions where order_id=ident)<>before_row then raise exception 'Snapshot differs';end if;
failed:=false;begin perform public.update_quotation_once(gen_random_uuid(),ident,before_row,client,payload);exception when others then failed:=true;end;if not failed then raise exception 'Stale accepted';end if;
update public.orders set status='Confirmed' where id=ident;
select to_jsonb(o) into before_row from public.orders o where id=ident;
failed:=false;begin perform public.update_quotation_once(gen_random_uuid(),ident,before_row,client,payload);exception when others then failed:=true;end;if not failed then raise exception 'Confirmed accepted';end if;
perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","email":"outsider@example.test"}',true);
failed:=false;begin perform public.update_quotation_once(gen_random_uuid(),ident,before_row,client,payload);exception when others then failed:=true;end;if not failed then raise exception 'Outsider accepted';end if;
if has_function_privilege('anon','public.update_quotation_once(uuid,uuid,jsonb,jsonb,jsonb)','execute') then raise exception 'Anonymous permission';end if;
end $$; rollback;`));
console.log('PASS: same quote, revision snapshot, idempotent retry, stale conflict, confirmed lock, outsider and anonymous guards. All fixtures and test migration rolled back.');
