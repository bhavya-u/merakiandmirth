-- Product images replace the old visual marker. The legacy category data stays
-- intact in the database for historical reference, but is no longer used by the app.
alter table public.library_items
  drop column if exists emoji;
