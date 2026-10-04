-- Quote-specific add-ons are centrally priced, while every saved quotation
-- retains its own snapshot in `orders` so historical client totals never move.
create table if not exists public.quote_card_options (
  code text primary key,
  label text not null check (char_length(label) between 1 and 100),
  size_inches numeric(3,1) not null check (size_inches > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  custom_design_fee numeric(12,2) not null default 100 check (custom_design_fee >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.quote_card_options (code, label, size_inches, unit_price, custom_design_fee, sort_order)
values
  ('thank_you_card_1_5', '1.5 inch thank-you card', 1.5, 3.00, 100.00, 10),
  ('thank_you_card_2', '2 inch thank-you card', 2.0, 3.50, 100.00, 20),
  ('thank_you_card_2_5', '2.5 inch thank-you card', 2.5, 5.00, 100.00, 30)
on conflict (code) do update set
  label = excluded.label,
  size_inches = excluded.size_inches,
  unit_price = excluded.unit_price,
  custom_design_fee = excluded.custom_design_fee,
  sort_order = excluded.sort_order;

alter table public.orders
  add column if not exists event_date date,
  add column if not exists net_wrapping boolean not null default false,
  add column if not exists thank_you_card_code text references public.quote_card_options(code) on delete set null,
  add column if not exists thank_you_card_style text not null default 'none' check (thank_you_card_style in ('none', 'general', 'customized')),
  add column if not exists thank_you_card_unit_price numeric(12,2) not null default 0 check (thank_you_card_unit_price >= 0),
  add column if not exists thank_you_card_design_fee numeric(12,2) not null default 0 check (thank_you_card_design_fee >= 0),
  add column if not exists complimentary text not null default '',
  add column if not exists discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  add column if not exists discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  add column if not exists subtotal_before_discount numeric(12,2) not null default 0 check (subtotal_before_discount >= 0);

create index if not exists orders_event_date_idx on public.orders (event_date);

drop trigger if exists quote_card_options_updated_at on public.quote_card_options;
create trigger quote_card_options_updated_at before update on public.quote_card_options
for each row execute function public.set_updated_at();

alter table public.quote_card_options enable row level security;
drop policy if exists "Workspace members manage quote card options" on public.quote_card_options;
create policy "Workspace members manage quote card options" on public.quote_card_options
  for all to authenticated using (public.is_app_member()) with check (public.is_app_member());
