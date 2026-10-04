-- Move the original catalogue product records to stable, optimised Storage URLs.
-- Newer admin-uploaded images already use Storage and are intentionally unchanged.
update public.library_items
set photo = 'https://hbptzcvqvfhpahbnamhn.supabase.co/storage/v1/object/public/catalogue/seed-products/' || id || '.webp'
where kind = 'product'
  and photo like 'assets/catalogue/%'
  and id ~ '^p[0-9]{5}$';
