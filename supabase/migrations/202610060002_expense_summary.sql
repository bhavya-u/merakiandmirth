-- Invoker rights preserve the same RLS visibility as the ledger query.
create function public.workspace_expense_summary()
returns jsonb language sql stable security invoker set search_path = '' as $$
select jsonb_build_object(
 'count', count(*),
 'pending', coalesce(sum(amount) filter(where approval_status='pending'),0),
 'approved', coalesce(sum(amount) filter(where approval_status='approved' and settled_at is null),0),
 'settled', coalesce(sum(amount) filter(where settled_at is not null),0),
 'people', (select coalesce(jsonb_agg(p), '[]'::jsonb) from (
   select submitted_by_name as name,
   coalesce(sum(amount) filter(where approval_status='pending'),0) as pending,
   coalesce(sum(amount) filter(where approval_status='approved' and settled_at is null),0) as approved
   from public.expense_claims group by submitted_by_name
 ) p)
) from public.expense_claims;
$$;
revoke all on function public.workspace_expense_summary() from public, anon;
grant execute on function public.workspace_expense_summary() to authenticated, service_role;
create index if not exists expense_claims_ledger_page on public.expense_claims(created_at desc, id desc);
