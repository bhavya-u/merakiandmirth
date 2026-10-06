import { status, sql } from './common.mjs';
status(); // Refuse linked or non-local stacks before any database operation.

console.log(sql(`begin;
do $$
declare old_url text; result text; batch uuid := gen_random_uuid();
begin
 select photo into old_url from public.library_items where id='p00001';
 if not found then raise exception 'Local fixture missing'; end if;
 result := public.apply_image_migration(batch,'p00001',old_url,'local-test-new');
 if result <> 'applied' then raise exception 'Apply failed'; end if;
 if public.apply_image_migration(batch,'p00001',old_url,'local-test-new') <> 'already_applied' then raise exception 'Retry failed'; end if;
 update public.library_items set photo='later-edit' where id='p00001';
 if public.rollback_image_migration(batch,'p00001') <> 'conflict' then raise exception 'Overwrote later edit'; end if;
 update public.library_items set photo='local-test-new' where id='p00001';
 if public.rollback_image_migration(batch,'p00001') <> 'rolled_back' then raise exception 'Rollback failed'; end if;
 if public.rollback_image_migration(batch,'p00001') <> 'already_rolled_back' then raise exception 'Rollback retry failed'; end if;
 if (select photo from public.library_items where id='p00001') is distinct from old_url then raise exception 'Wrong restored URL'; end if;
 if public.apply_image_migration(gen_random_uuid(),'p00001','stale','new') <> 'conflict' then raise exception 'Apply overwrote edit'; end if;
 if has_function_privilege('authenticated','public.apply_image_migration(uuid,text,text,text)','execute') or has_function_privilege('anon','public.rollback_image_migration(uuid,text)','execute') then raise exception 'Client RPC access'; end if;
 if has_table_privilege('authenticated','public.image_migration_history','select') then raise exception 'Client history access'; end if;
end $$;
rollback;`));
console.log('PASS: apply, retry, conflict protection, rollback and client access restrictions. Test changes rolled back.');
