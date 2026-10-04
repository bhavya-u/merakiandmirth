-- Shared admin expenses with controlled approval and settlement.
alter table public.app_members
  add column if not exists display_name text not null default '',
  add column if not exists can_approve_expenses boolean not null default false;

update public.app_members
set display_name = case email
  when 'ashwinijayaraj08@gmail.com' then 'Ashwini'
  when 'bhavyanair08@gmail.com' then 'Bhavya'
  when 'mahashankar95@gmail.com' then 'Maha'
  else display_name
end,
can_approve_expenses = email in ('ashwinijayaraj08@gmail.com', 'bhavyanair08@gmail.com')
where email in ('ashwinijayaraj08@gmail.com', 'bhavyanair08@gmail.com', 'mahashankar95@gmail.com');

create table if not exists public.expense_rate_policies (
  delivery_mode text primary key check (delivery_mode in ('bike', 'car')),
  fuel_price_per_litre numeric(10,2) not null check (fuel_price_per_litre > 0),
  kilometres_per_litre numeric(10,2) not null check (kilometres_per_litre > 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.expense_rate_policies (delivery_mode, fuel_price_per_litre, kilometres_per_litre)
values ('bike', 105, 45), ('car', 105, 12)
on conflict (delivery_mode) do nothing;

create table if not exists public.expense_claims (
  id uuid primary key default gen_random_uuid(),
  submitted_by_id uuid not null references auth.users(id) on delete restrict,
  submitted_by_name text not null,
  expense_type text not null check (expense_type in ('purchase', 'delivery')),
  description text not null,
  vendor text not null default '',
  delivery_mode text check (delivery_mode in ('bike', 'car', 'third_party')),
  delivery_provider text not null default '',
  distance_km numeric(10,2),
  rate_per_km numeric(10,4),
  amount numeric(12,2) not null check (amount > 0),
  note text not null default '',
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  approved_by_id uuid references auth.users(id) on delete set null,
  approved_by_name text not null default '',
  approved_at timestamptz,
  review_note text not null default '',
  settled_by_id uuid references auth.users(id) on delete set null,
  settled_by_name text not null default '',
  settled_at timestamptz,
  settlement_note text not null default '',
  created_at timestamptz not null default now(),
  check ((expense_type = 'purchase' and delivery_mode is null and distance_km is null and rate_per_km is null) or (expense_type = 'delivery' and delivery_mode is not null)),
  check ((delivery_mode in ('bike', 'car') and distance_km > 0 and rate_per_km > 0) or delivery_mode is null or delivery_mode = 'third_party')
);

create index if not exists expense_claims_submitted_created_idx on public.expense_claims(submitted_by_id, created_at desc);
create index if not exists expense_claims_status_unsettled_idx on public.expense_claims(approval_status, settled_at) where approval_status = 'approved' and settled_at is null;
create index if not exists expense_claims_approved_by_idx on public.expense_claims(approved_by_id);
create index if not exists expense_claims_settled_by_idx on public.expense_claims(settled_by_id);

alter table public.expense_rate_policies enable row level security;
alter table public.expense_claims enable row level security;

revoke all on public.expense_rate_policies from anon, authenticated;
revoke all on public.expense_claims from anon, authenticated;
grant select on public.expense_rate_policies, public.expense_claims to authenticated;

drop policy if exists "Workspace members view expense rate policies" on public.expense_rate_policies;
create policy "Workspace members view expense rate policies" on public.expense_rate_policies for select to authenticated using (public.is_app_member());
drop policy if exists "Workspace members view expense claims" on public.expense_claims;
create policy "Workspace members view expense claims" on public.expense_claims for select to authenticated using (public.is_app_member());

create or replace function public.workspace_expense_people()
returns table (email text, display_name text, can_approve_expenses boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.email, coalesce(nullif(m.display_name, ''), split_part(m.email, '@', 1)), m.can_approve_expenses
  from public.app_members m
  where public.is_app_member() and m.active
  order by m.can_approve_expenses desc, m.display_name, m.email;
$$;

create or replace function public.submit_expense_claim(
  p_expense_type text,
  p_description text,
  p_vendor text default '',
  p_delivery_mode text default null,
  p_delivery_provider text default '',
  p_distance_km numeric default null,
  p_amount numeric default null,
  p_note text default ''
)
returns public.expense_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_rate numeric(10,4);
  v_amount numeric(12,2);
  v_claim public.expense_claims;
begin
  select coalesce(nullif(display_name, ''), split_part(email, '@', 1)) into v_name
  from public.app_members
  where email = lower(coalesce(auth.jwt() ->> 'email', '')) and active;
  if auth.uid() is null or v_name is null then raise exception 'Only active workspace members can submit expenses'; end if;
  if trim(coalesce(p_description, '')) = '' then raise exception 'Describe what this expense was for'; end if;

  if p_expense_type = 'purchase' then
    if coalesce(p_amount, 0) <= 0 then raise exception 'Enter the amount paid'; end if;
    v_amount := round(p_amount, 2);
    p_delivery_mode := null; p_delivery_provider := ''; p_distance_km := null; v_rate := null;
  elsif p_expense_type = 'delivery' and p_delivery_mode in ('bike', 'car') then
    if coalesce(p_distance_km, 0) <= 0 then raise exception 'Enter the delivery distance'; end if;
    select round(fuel_price_per_litre / kilometres_per_litre, 4) into v_rate
    from public.expense_rate_policies where delivery_mode = p_delivery_mode and active;
    if v_rate is null then raise exception 'No active mileage rate is configured for %', p_delivery_mode; end if;
    v_amount := round(p_distance_km * v_rate, 2);
    p_delivery_provider := '';
  elsif p_expense_type = 'delivery' and p_delivery_mode = 'third_party' then
    if coalesce(p_amount, 0) <= 0 then raise exception 'Enter the service amount'; end if;
    v_amount := round(p_amount, 2); p_distance_km := null; v_rate := null;
  else
    raise exception 'Choose a valid expense and delivery method';
  end if;

  insert into public.expense_claims (submitted_by_id, submitted_by_name, expense_type, description, vendor, delivery_mode, delivery_provider, distance_km, rate_per_km, amount, note)
  values (auth.uid(), v_name, p_expense_type, trim(p_description), trim(coalesce(p_vendor, '')), p_delivery_mode, trim(coalesce(p_delivery_provider, '')), p_distance_km, v_rate, v_amount, trim(coalesce(p_note, '')))
  returning * into v_claim;
  return v_claim;
end;
$$;

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
  if v_claim.submitted_by_id = auth.uid() then raise exception 'You cannot approve your own expense'; end if;
  if v_claim.approval_status <> 'pending' then raise exception 'This claim has already been reviewed'; end if;
  update public.expense_claims set approval_status = p_action, approved_by_id = auth.uid(), approved_by_name = v_name, approved_at = now(), review_note = trim(coalesce(p_note, '')) where id = p_claim_id returning * into v_claim;
  return v_claim;
end;
$$;

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
  update public.expense_claims set settled_by_id = auth.uid(), settled_by_name = v_name, settled_at = now(), settlement_note = trim(coalesce(p_note, ''))
  where id = p_claim_id and approval_status = 'approved' and settled_at is null returning * into v_claim;
  if not found then raise exception 'Only approved, unsettled expenses can be marked settled'; end if;
  return v_claim;
end;
$$;

grant execute on function public.workspace_expense_people() to authenticated;
grant execute on function public.submit_expense_claim(text, text, text, text, text, numeric, numeric, text) to authenticated;
grant execute on function public.review_expense_claim(uuid, text, text) to authenticated;
grant execute on function public.settle_expense_claim(uuid, text) to authenticated;
