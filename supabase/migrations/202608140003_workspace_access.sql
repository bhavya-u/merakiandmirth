-- Shared staff workspace with a one-time, authenticated owner claim.
-- Before the first claim, restrict Google OAuth to the owner's account in Google Cloud.
create table if not exists public.app_members (
  email text primary key check (email = lower(email)),
  role text not null default 'staff' check (role in ('owner', 'staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_app_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_members
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and active
  );
$$;

create or replace function public.workspace_access_state()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'member', public.is_app_member(),
    'unclaimed', not exists (select 1 from public.app_members where active)
  );
$$;

create or replace function public.claim_workspace_owner()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or member_email = '' then
    raise exception 'You must sign in before claiming this workspace';
  end if;
  if exists (select 1 from public.app_members where active) then
    raise exception 'This workspace has already been claimed';
  end if;
  insert into public.app_members (email, role) values (member_email, 'owner');
end;
$$;

revoke all on public.app_members from anon, authenticated;
grant execute on function public.is_app_member() to authenticated;
grant execute on function public.workspace_access_state() to authenticated;
grant execute on function public.claim_workspace_owner() to authenticated;

-- Seeded catalogue records are shared workspace data, not personal records.
alter table public.library_items alter column owner_id drop not null;

drop policy if exists "Users manage their library" on public.library_items;
create policy "Workspace members manage library" on public.library_items
  for all to authenticated using (public.is_app_member()) with check (public.is_app_member());
drop policy if exists "Users manage their bags" on public.bags;
create policy "Workspace members manage bags" on public.bags
  for all to authenticated using (public.is_app_member()) with check (public.is_app_member());
drop policy if exists "Users manage their orders" on public.orders;
create policy "Workspace members manage orders" on public.orders
  for all to authenticated using (public.is_app_member()) with check (public.is_app_member());
drop policy if exists "Users manage their enquiries" on public.enquiries;
create policy "Workspace members manage enquiries" on public.enquiries
  for all to authenticated using (public.is_app_member()) with check (public.is_app_member());
drop policy if exists "Users manage their inventory movements" on public.inventory_movements;
create policy "Workspace members manage inventory movements" on public.inventory_movements
  for all to authenticated using (public.is_app_member()) with check (public.is_app_member());
drop policy if exists "Users manage their delivery reminders" on public.delivery_reminders;
create policy "Workspace members manage delivery reminders" on public.delivery_reminders
  for all to authenticated using (public.is_app_member()) with check (public.is_app_member());

drop policy if exists "Authenticated users upload catalogue assets" on storage.objects;
drop policy if exists "Workspace members manage catalogue assets" on storage.objects;
create policy "Workspace members manage catalogue assets" on storage.objects
  for all to authenticated
  using (bucket_id = 'catalogue' and public.is_app_member())
  with check (bucket_id = 'catalogue' and public.is_app_member());
