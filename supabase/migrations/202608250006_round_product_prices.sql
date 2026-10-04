-- Client-facing product prices are always whole rupees. Values below 50 paise
-- round down; values from 50 paise round up. Combos retain their own saved cost.
alter table public.library_items
  add column if not exists rounded_price numeric(12,0)
  generated always as (round(cost + buffer)) stored;
