create table if not exists public.occasion_types (
  code text primary key check (code = lower(code) and code ~ '^[a-z0-9_]{2,50}$'),
  label text not null,
  sort_order smallint not null unique,
  active boolean not null default true
);

insert into public.occasion_types (code, label, sort_order) values
  ('all', 'All occasions', 10),
  ('wedding', 'Wedding', 20),
  ('baby_shower', 'Baby shower', 30),
  ('birthday', 'Birthday', 40),
  ('naming_ceremony', 'Naming ceremony', 50),
  ('housewarming', 'Housewarming', 60),
  ('pooja', 'Pooja', 70),
  ('corporate_gifting', 'Corporate gifting', 80),
  ('diwali_festivals', 'Diwali & festivals', 90),
  ('return_gift', 'Simple return gift', 100),
  ('anniversary', 'Anniversary', 110),
  ('farewell', 'Farewell', 120)
on conflict (code) do update set label = excluded.label, sort_order = excluded.sort_order;

alter table public.occasion_types enable row level security;
drop policy if exists "Workspace members read occasion types" on public.occasion_types;
create policy "Workspace members read occasion types" on public.occasion_types
  for select to authenticated using (public.is_app_member());
