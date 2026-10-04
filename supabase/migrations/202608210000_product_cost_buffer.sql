-- Keep the internal cost buffer separate while all client-facing calculations use
-- product cost plus buffer as one combined product cost.
alter table public.library_items
  add column if not exists buffer numeric(12,2) not null default 0 check (buffer >= 0);
