-- Preserve original claim values and require fresh review after an adjustment.
alter table public.expense_claims add column extra_amount numeric(12,2) not null default 0 check(extra_amount >= 0 and extra_amount < amount), add column adjustment_reason text not null default '', add column revision integer not null default 0;
create table public.expense_claim_adjustments (
 id uuid primary key default gen_random_uuid(), claim_id uuid not null references public.expense_claims(id), actor_id uuid not null references auth.users(id), created_at timestamptz not null default now(), previous_claim jsonb not null, extra_amount numeric(12,2) not null, reason text not null
);
alter table public.expense_claim_adjustments enable row level security;
revoke all on public.expense_claim_adjustments from public,anon,authenticated;
grant select on public.expense_claim_adjustments to authenticated;
create policy "Members read claim adjustments" on public.expense_claim_adjustments for select to authenticated using(public.is_app_member());
create function public.advance_expense_revision() returns trigger language plpgsql set search_path='' as $$ begin new.revision:=old.revision+1; return new; end $$;
create trigger expense_revision before update on public.expense_claims for each row execute function public.advance_expense_revision();
revoke all on function public.advance_expense_revision() from public;
create function public.adjust_expense_claim(p_operation uuid,p_claim_id uuid,p_expected_revision integer,p_extra_amount numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.expense_claims%rowtype; result jsonb; request jsonb:=jsonb_build_object('claim',p_claim_id,'revision',p_expected_revision,'extra',p_extra_amount,'reason',p_reason);
begin
 result:=public.check_workspace_write(p_operation,'expense-adjustment',request);
 if result is not null then return result; end if;
 select * into c from public.expense_claims where id=p_claim_id for update;
 if not found then raise exception 'Claim not found'; end if;
 if c.submitted_by_id<>auth.uid() then raise exception 'Only the claimant can adjust this claim'; end if;
 if c.settled_at is not null then raise exception 'Settled claims cannot be changed'; end if;
 if p_expected_revision is distinct from c.revision then raise exception 'Claim changed; reopen it before editing'; end if;
 if p_extra_amount is null or p_extra_amount<0 or p_extra_amount>999999999 or p_extra_amount<>round(p_extra_amount,2) then raise exception 'Enter a valid extra amount with at most two decimal places'; end if;
 if length(btrim(coalesce(p_reason,''))) not between 1 and 240 then raise exception 'Enter an adjustment reason (up to 240 characters)'; end if;
 if p_extra_amount=c.extra_amount then raise exception 'Extra amount is unchanged'; end if;
 insert into public.expense_claim_adjustments(claim_id,actor_id,previous_claim,extra_amount,reason) values(c.id,auth.uid(),to_jsonb(c),p_extra_amount,btrim(p_reason));
 update public.expense_claims set amount=c.amount-c.extra_amount+p_extra_amount,extra_amount=p_extra_amount,adjustment_reason=btrim(p_reason),approval_status='pending',approved_by_id=null,approved_by_name='',approved_at=null,review_note='' where id=c.id returning * into c;
 result:=jsonb_build_object('id',c.id,'revision',c.revision);
 insert into public.workspace_write_receipts values(auth.uid(),p_operation,'expense-adjustment',request,result,now());
 return result;
end $$;
revoke all on function public.adjust_expense_claim(uuid,uuid,integer,numeric,text) from public,anon;
grant execute on function public.adjust_expense_claim(uuid,uuid,integer,numeric,text) to authenticated;

create or replace function public.review_expense_claim(p_claim_id uuid, p_action text, p_note text default '')
returns public.expense_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_can_approve boolean;
  v_claim public.expense_claims;
begin
  select coalesce(nullif(display_name, ''), split_part(email, '@', 1)), can_approve_expenses into v_name, v_can_approve
  from public.app_members where email = lower(coalesce(auth.jwt() ->> 'email', '')) and active;
  if auth.uid() is null or not coalesce(v_can_approve, false) then raise exception 'Only Ashwini or Bhavya can approve expenses'; end if;
  if p_action not in ('approved', 'rejected') then raise exception 'Use approved or rejected as the review action'; end if;
  select * into v_claim from public.expense_claims where id = p_claim_id for update;
  if not found then raise exception 'Expense claim not found'; end if;
  if v_claim.extra_amount<>0 or exists(select 1 from public.expense_claim_adjustments where claim_id=p_claim_id) then raise exception 'Update the app before reviewing or settling an adjusted claim'; end if;
  if v_claim.submitted_by_id = auth.uid() then raise exception 'You cannot approve your own expense'; end if;
  if v_claim.approval_status <> 'pending' then raise exception 'This claim has already been reviewed'; end if;
  update public.expense_claims set approval_status = p_action, approved_by_id = auth.uid(), approved_by_name = v_name, approved_at = now(), review_note = trim(coalesce(p_note, '')) where id = p_claim_id returning * into v_claim;
  return v_claim;
end;
$$;
create or replace function public.review_expense_claim_versioned(p_claim_id uuid, p_action text, p_expected_revision integer, p_note text default '')
returns public.expense_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_can_approve boolean;
  v_claim public.expense_claims;
begin
  select coalesce(nullif(display_name, ''), split_part(email, '@', 1)), can_approve_expenses into v_name, v_can_approve
  from public.app_members where email = lower(coalesce(auth.jwt() ->> 'email', '')) and active;
  if auth.uid() is null or not coalesce(v_can_approve, false) then raise exception 'Only Ashwini or Bhavya can approve expenses'; end if;
  if p_action not in ('approved', 'rejected') then raise exception 'Use approved or rejected as the review action'; end if;
  select * into v_claim from public.expense_claims where id = p_claim_id for update;
  if not found then raise exception 'Expense claim not found'; end if;
  if p_expected_revision is distinct from v_claim.revision then raise exception 'Claim changed; refresh before reviewing or settling'; end if;
  if v_claim.submitted_by_id = auth.uid() then raise exception 'You cannot approve your own expense'; end if;
  if v_claim.approval_status <> 'pending' then raise exception 'This claim has already been reviewed'; end if;
  update public.expense_claims set approval_status = p_action, approved_by_id = auth.uid(), approved_by_name = v_name, approved_at = now(), review_note = trim(coalesce(p_note, '')) where id = p_claim_id returning * into v_claim;
  return v_claim;
end;
$$;
revoke all on function public.review_expense_claim_versioned(uuid,text,integer,text) from public,anon;
grant execute on function public.review_expense_claim_versioned(uuid,text,integer,text) to authenticated;

create or replace function public.settle_expense_claim(p_claim_id uuid, p_note text default '')
returns public.expense_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_can_approve boolean;
  v_claim public.expense_claims;
begin
  select coalesce(nullif(display_name, ''), split_part(email, '@', 1)), can_approve_expenses into v_name, v_can_approve
  from public.app_members where email = lower(coalesce(auth.jwt() ->> 'email', '')) and active;
  if auth.uid() is null or not coalesce(v_can_approve, false) then raise exception 'Only Ashwini or Bhavya can settle expenses'; end if;
  select * into v_claim from public.expense_claims where id=p_claim_id for update;
  if not found then raise exception 'Expense claim not found'; end if;
  if v_claim.extra_amount<>0 or exists(select 1 from public.expense_claim_adjustments where claim_id=p_claim_id) then raise exception 'Update the app before reviewing or settling an adjusted claim'; end if;
  update public.expense_claims set settled_by_id = auth.uid(), settled_by_name = v_name, settled_at = now(), settlement_note = trim(coalesce(p_note, ''))
  where id = p_claim_id and approval_status = 'approved' and settled_at is null returning * into v_claim;
  if not found then raise exception 'Only approved, unsettled expenses can be marked settled'; end if;
  return v_claim;
end;
$$;
create or replace function public.settle_expense_claim_versioned(p_claim_id uuid, p_expected_revision integer, p_note text default '')
returns public.expense_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_can_approve boolean;
  v_claim public.expense_claims;
begin
  select coalesce(nullif(display_name, ''), split_part(email, '@', 1)), can_approve_expenses into v_name, v_can_approve
  from public.app_members where email = lower(coalesce(auth.jwt() ->> 'email', '')) and active;
  if auth.uid() is null or not coalesce(v_can_approve, false) then raise exception 'Only Ashwini or Bhavya can settle expenses'; end if;
  select * into v_claim from public.expense_claims where id=p_claim_id for update;
  if not found then raise exception 'Expense claim not found'; end if;
  if p_expected_revision is distinct from v_claim.revision then raise exception 'Claim changed; refresh before reviewing or settling'; end if;
  update public.expense_claims set settled_by_id = auth.uid(), settled_by_name = v_name, settled_at = now(), settlement_note = trim(coalesce(p_note, ''))
  where id = p_claim_id and approval_status = 'approved' and settled_at is null returning * into v_claim;
  if not found then raise exception 'Only approved, unsettled expenses can be marked settled'; end if;
  return v_claim;
end;
$$;
revoke all on function public.settle_expense_claim_versioned(uuid,integer,text) from public,anon;
grant execute on function public.settle_expense_claim_versioned(uuid,integer,text) to authenticated;

-- One RLS-scoped statement provides a consistent, bounded export snapshot.
create function public.export_expense_settlement(p_from date,p_to date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare rows jsonb;
begin
 if p_from is not null and p_to is not null and p_from>p_to then raise exception 'Start date must not follow end date'; end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at,c.id),'[]'::jsonb) into rows from (
 select * from public.expense_claims where (p_from is null or created_at>=p_from::timestamp at time zone 'Asia/Kolkata') and (p_to is null or created_at<(p_to+1)::timestamp at time zone 'Asia/Kolkata') order by created_at,id limit 10001
 ) c;
 if jsonb_array_length(rows)>10000 then raise exception 'Choose a smaller date range (maximum 10,000 claims per export)'; end if;
 return jsonb_build_object('claims',rows,'generated_at',now());
end $$;
revoke all on function public.export_expense_settlement(date,date) from public,anon;
grant execute on function public.export_expense_settlement(date,date) to authenticated;
