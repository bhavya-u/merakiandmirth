import { status, sql } from './common.mjs';
status();
console.log(sql(`begin;
do $$
declare before jsonb; after jsonb; owner uuid;
begin
 select id into owner from auth.users where email='owner@example.test';
 if owner is null then raise exception 'Local owner missing'; end if;
 before := public.workspace_expense_summary();
 insert into public.expense_claims(submitted_by_id,submitted_by_name,expense_type,description,amount,created_at)
 select owner,'Pagination Test','purchase','Temporary paging fixture',10,'2026-01-01'::timestamptz from generate_series(1,61);
 after := public.workspace_expense_summary();
 if (after->>'count')::int <> (before->>'count')::int+61 then raise exception 'Count mismatch'; end if;
 if (after->>'pending')::numeric <> (before->>'pending')::numeric+610 then raise exception 'Total only covers one page'; end if;
 if has_function_privilege('anon','public.workspace_expense_summary()','execute') then raise exception 'Anonymous summary access'; end if;
 if (select prosecdef from pg_proc where oid='public.workspace_expense_summary()'::regprocedure) then raise exception 'Summary must preserve invoker RLS'; end if;
end $$;
rollback;`));
console.log('PASS: complete summary across 61 added claims, restricted RPC and invoker rights; fixtures rolled back.');
