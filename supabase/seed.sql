-- Local development only. Applied by the CLI after migrations, never by db push.
-- Do not import production Vault secrets into this environment.
select cron.unschedule(jobid) from cron.job;
delete from public.app_members;
insert into public.app_members (email, role, active, display_name, can_approve_expenses) values
 ('owner@example.test', 'owner', true, 'Local Owner', true),
 ('staff@example.test', 'staff', true, 'Local Staff', false);
update public.library_items
set photo = 'http://127.0.0.1:54321/storage/v1/object/public/catalogue/seed-products/' || id || '.webp',
    cost = 100 + (substring(id from 2)::int % 10) * 25,
    stock_on_hand = 20, reorder_level = 5
where kind = 'product' and id ~ '^p[0-9]{5}$';
