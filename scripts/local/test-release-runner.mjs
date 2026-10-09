import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {root,status,request} from './common.mjs';
import {readJson,saveJson,hash} from '../release/image-migration-lib.mjs';
const settings=status(),dir=`${root}/.local/release-runner-${randomUUID()}`;
await mkdir(dir,{recursive:true,mode:0o700});
const credentials=`${dir}/credentials.json`;
await saveJson(credentials,{url:settings.API_URL,key:settings.SERVICE_ROLE_KEY});
const run=(mode,extra=[])=>execFileSync(process.execPath,[`${root}/scripts/release/image-migration.mjs`,mode,dir,'--credentials',credentials,'--project-ref','local',...extra],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
const original=(await request('/rest/v1/library_items?id=eq.p00001&select=*',{key:settings.SERVICE_ROLE_KEY}))[0];
let plan;
try {
 run('inventory');run('inventory',['--resume']);run('prepare');
 const manifest=await readJson(`${dir}/manifest.json`);manifest.products=manifest.products.filter(p=>p.id==='p00001');await saveJson(`${dir}/manifest.json`,manifest);
 run('plan');plan=await readJson(`${dir}/plan.json`);if(plan.entries.length!==1) throw Error('Expected one local candidate');
 const approval=['--approve-plan',hash(JSON.stringify(plan))];
 const file=`${dir}/${plan.entries[0].variants.grid.file}`,bytes=await readFile(file);await writeFile(file,'corrupt');
 let rejected=false;try{run('apply',approval);}catch{rejected=true;}if(!rejected)throw Error('Corrupt variant accepted');await writeFile(file,bytes);
 run('apply',[...approval,'--product','p00001']);run('apply',approval);
 const current=(await request('/rest/v1/library_items?id=eq.p00001&select=*',{key:settings.SERVICE_ROLE_KEY}))[0];
 if(current.photo!==plan.entries[0].next)throw Error('Apply failed');
 for(const field of Object.keys(original).filter(k=>!['photo','updated_at'].includes(k))) if(JSON.stringify(original[field])!==JSON.stringify(current[field]))throw Error(`Business field changed: ${field}`);
 run('rollback',approval);run('rollback',approval);
 const restored=(await request('/rest/v1/library_items?id=eq.p00001&select=photo',{key:settings.SERVICE_ROLE_KEY}))[0];if(restored.photo!==original.photo)throw Error('Rollback failed');
 console.log('PASS: external originals, hash validation, real variant prepare/plan, corrupt-file rejection, apply/retry, unchanged business fields and rollback/retry.');
} finally {
 await request('/rest/v1/library_items?id=eq.p00001',{key:settings.SERVICE_ROLE_KEY,method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({photo:original.photo})});
}
