import { status, sql } from './common.mjs';
status();
console.log(sql(`begin;
do $$
declare owner uuid; client uuid; stats jsonb; n bigint;
begin
 select id into owner from auth.users where email='owner@example.test';
 insert into public.clients(owner_id,name,mobile_number,delivery_area) values(owner,'Paging Test','9888877776','Local') returning id into client;
 insert into public.orders(owner_id,client_id,code,title,event,qty,total,status,items,cost_snapshot,expenses_total,created_at)
 select owner,client,'PAGE-'||g,'Pagination Test','all',2,100,'Full amount paid','[{"unitCost":10}]',0,5,'2030-01-01 23:59:59+00' from generate_series(1,61) g;
 stats := public.workspace_order_summary('2030-01-01','2030-01-01');
 if (stats->>'count')::int<>61 or (stats->>'profit')::numeric<>4575 then raise exception 'Full summary incorrect: %',stats; end if;
 if (public.workspace_order_summary('2030-01-02','2030-01-02')->>'count')::int<>0 then raise exception 'Date boundary incorrect'; end if;
 select order_count into n from public.workspace_client_order_summary() where client_id=client;
 if n<>61 then raise exception 'Client count incomplete'; end if;
 if has_function_privilege('anon','public.workspace_order_summary(date,date)','execute') then raise exception 'Anonymous access'; end if;
end $$;
rollback;`));
console.log('PASS: 61-order summary, legacy unit-cost profit, inclusive UTC date boundaries and complete client counts; fixtures rolled back.');
