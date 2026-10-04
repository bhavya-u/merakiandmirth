-- Reclassify the products that were imported with the broad `all` fallback.
-- Keep `all` only for universal packaging materials (bags, gift boxes and cards).
-- The guard below deliberately leaves products that already have specific tags untouched.

with classification (id, occasions) as (
  values
    ('p00024', array['wedding', 'housewarming', 'pooja', 'lifestyle_events', 'return_gift']::text[]),
    ('p00026', array['birthday', 'kids_events', 'corporate_gifting', 'return_gift']::text[]),
    ('p00032', array['corporate_gifting', 'farewell', 'lifestyle_events', 'return_gift']::text[]),
    ('p00033', array['wedding', 'housewarming', 'pooja', 'diwali_festivals']::text[]),
    ('p00036', array['wedding', 'housewarming', 'pooja', 'diwali_festivals']::text[]),
    ('p00037', array['housewarming', 'corporate_gifting', 'return_gift']::text[]),
    ('p00038', array['birthday', 'kids_events', 'corporate_gifting', 'return_gift']::text[]),
    ('p00039', array['birthday', 'kids_events', 'return_gift']::text[]),
    ('p00047', array['birthday', 'kids_events', 'corporate_gifting', 'return_gift']::text[]),
    ('p00049', array['housewarming', 'corporate_gifting', 'return_gift']::text[]),
    ('p00051', array['birthday', 'kids_events', 'corporate_gifting', 'return_gift']::text[]),
    ('p00052', array['housewarming', 'pooja', 'return_gift']::text[]),
    ('p00053', array['housewarming', 'pooja', 'return_gift']::text[]),
    ('p00060', array['wedding', 'naming_ceremony', 'pooja', 'return_gift']::text[]),
    ('p00061', array['wedding', 'naming_ceremony', 'pooja', 'return_gift']::text[]),
    ('p00062', array['wedding', 'housewarming', 'pooja', 'diwali_festivals']::text[]),
    ('p00063', array['housewarming', 'pooja', 'return_gift']::text[]),
    ('p00064', array['birthday', 'kids_events', 'corporate_gifting', 'return_gift']::text[]),
    ('p00065', array['housewarming', 'corporate_gifting', 'return_gift']::text[]),
    ('p00067', array['wedding', 'housewarming', 'pooja', 'diwali_festivals']::text[]),
    ('p00077', array['wedding', 'housewarming', 'pooja', 'return_gift']::text[]),
    ('p00081', array['birthday', 'kids_events', 'corporate_gifting', 'return_gift']::text[]),
    ('p00082', array['housewarming', 'pooja', 'return_gift']::text[]),
    ('p00084', array['housewarming', 'corporate_gifting', 'return_gift']::text[]),
    ('p00085', array['housewarming', 'corporate_gifting', 'return_gift']::text[]),
    ('p00088', array['anniversary', 'lifestyle_events', 'return_gift']::text[]),
    ('product-051d7375-e9f0-4ba2-b7ca-8e974d29ed3c', array['birthday', 'kids_events', 'return_gift']::text[])
)
update public.library_items as item
set occasions = classification.occasions
from classification
where item.id = classification.id
  and item.kind = 'product'
  and item.occasions = array['all']::text[];
