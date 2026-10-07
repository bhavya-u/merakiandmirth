import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { root, status, sql } from './common.mjs';
status();
const path = `${root}/.local/expense-browser-fixtures.json`;
if (process.argv.includes('--cleanup')) {
 const ids = JSON.parse(await readFile(path,'utf8'));
 if (!ids.every(id=>/^[a-f0-9-]{36}$/.test(id))) throw new Error('Invalid fixture IDs');
 sql(`delete from public.expense_claims where id in (${ids.map(id=>`'${id}'`).join(',')});`);
 console.log('Removed exact temporary expense fixtures.');
} else {
 const prior = JSON.parse(await readFile(path,'utf8').catch(()=> '[]'));
 if (prior.length && prior.every(id=>/^[a-f0-9-]{36}$/.test(id)) && Number(sql(`select count(*) from public.expense_claims where id in (${prior.map(id=>`'${id}'`).join(',')});`))) throw new Error('Clean up prior fixtures before creating another batch');
 const ids = Array.from({length:61},()=>randomUUID());
 await writeFile(path,JSON.stringify(ids));
 sql(`insert into public.expense_claims(id,submitted_by_id,submitted_by_name,expense_type,description,amount,created_at)
 select x.id::uuid,u.id,'Local Owner','purchase','Temporary pagination check',10,'2026-10-06 12:00:00+00'
 from unnest(array[${ids.map(id=>`'${id}'`).join(',')}]) x(id) cross join auth.users u where u.email='owner@example.test';`);
 console.log('Added 61 local expense fixtures; exact IDs saved for cleanup.');
}
