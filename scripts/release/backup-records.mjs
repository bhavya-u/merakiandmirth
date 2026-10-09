// Read-only application data backup, not a substitute for a transaction-consistent pg_dump.
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {readJson,saveJson,allPages,client,hash} from './image-migration-lib.mjs';
const [directory,credentials,ref]=process.argv.slice(2);
if(!directory || !credentials || !ref) throw Error('Usage: backup-records.mjs DIRECTORY CREDENTIALS_FILE PROJECT_REF');
const dir=resolve(directory),api=client(await readJson(credentials));
if(api.origin!==(ref==='local'?'http://127.0.0.1:54321':`https://${ref}.supabase.co`))throw Error('Project mismatch');
const tables={library_items:'id',bags:'id',orders:'id',enquiries:'id',inventory_movements:'id',delivery_reminders:'id',app_members:'email',app_users:'id',occasion_types:'code',order_status_events:'id',order_payments:'id',order_fulfilment_tasks:'id',operation_notifications:'id',expense_rate_policies:'delivery_mode',expense_claims:'id',quote_card_options:'code',clients:'id',vendors:'id'};
const index={project:ref,createdAt:new Date().toISOString(),complete:false,tables:{}};
await mkdir(`${dir}/records`,{recursive:true,mode:0o700});
await writeFile(`${dir}/records/index.json`,JSON.stringify(index),{flag:'wx',mode:0o600});
for(const [table,key] of Object.entries(tables)) {
 const rows=await allPages(api.json,`/rest/v1/${table}`,key);
 const digest=hash(JSON.stringify(rows));
 await saveJson(`${dir}/records/${table}.json`,rows);
 index.tables[table]={count:rows.length,sha256:digest};await saveJson(`${dir}/records/index.json`,index);
}
for(const [table,key] of Object.entries(tables)) if(hash(JSON.stringify(await allPages(api.json,`/rest/v1/${table}`,key)))!==index.tables[table].sha256)throw Error('Application data changed while exporting; keep snapshot incomplete and retry during a quiet period');
index.complete=true;await saveJson(`${dir}/records/index.json`,index);
console.log(`Exported and rechecked ${Object.keys(tables).length} application tables; credentials/auth secrets are excluded.`);
