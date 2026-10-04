-- Passwords are held exclusively by Supabase Auth; this is a non-sensitive staff directory.
create table if not exists public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username = lower(username) and username ~ '^[a-z0-9_]{3,40}$'),
  email text not null unique check (email = lower(email)),
  role text not null default 'staff' check (role in ('owner', 'staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.app_users enable row level security;
drop policy if exists "Workspace members read users" on public.app_users;
create policy "Workspace members read users" on public.app_users
  for select to authenticated using (public.is_app_member());

insert into public.app_members (email, role, active) values
  ('ashwinijayaraj08@gmail.com', 'owner', true),
  ('bhavyanair08@gmail.com', 'staff', true),
  ('mahashankar@gmail.com', 'staff', true)
on conflict (email) do update set role = excluded.role, active = excluded.active;
