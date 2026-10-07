import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { root, status, sql } from './common.mjs';
status();
const path = `${root}/.local/order-browser-fixtures.json`;
if (process.argv.includes('--cleanup')) {
 const ids = JSON.parse(await readFile(path,'utf8'));
 if (!ids.every(id=>/^[a-f0-9-]{36}$/.test(id))) throw new Error('Invalid fixture IDs');
 sql(`delete from public.orders where id in (${ids.map(id=>`'${id}'`).join(',')});`);
 console.log('Removed exact temporary order fixtures.');
} else {
 const ids = Array.from({length:61},()=>randomUUID());
 await writeFile(path,JSON.stringify(ids));
 sql(`insert into public.orders(id,owner_id,client_id,code,title,event,qty,total,status,items,cost_snapshot,created_at)
 select x.id::uuid,u.id,c.id,'PAGECHECK-'||x.id,'Temporary pagination check','all',1,100,'Quotation sent','[]',50,'2026-10-06 12:00:00+00'
 from unnest(array[${ids.map(id=>`'${id}'`).join(',')}]) x(id)
 cross join auth.users u cross join public.clients c where u.email='owner@example.test' and c.id='10000000-0000-4000-8000-000000000001';`);
 console.log('Added 61 local browser fixtures; IDs saved for exact cleanup.');
}
