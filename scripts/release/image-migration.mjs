// Administrative tool. Defaults to inspection; never accepts credentials on the command line.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import '../../product-images.js';
import {hash,saveJson,readJson,allPages,objectPath,encodedPath,readBytes,client,businessSnapshot} from './image-migration-lib.mjs';
const [mode='help',directory,...args]=process.argv.slice(2);
if(mode==='help') {
 console.log('Usage: node scripts/release/image-migration.mjs inventory|prepare|plan|apply|rollback DIRECTORY --credentials FILE --project-ref REF [--resume] [--approve-plan SHA256] [--product ID]');
 process.exit(0);
}
if(!['inventory','prepare','plan','apply','rollback'].includes(mode) || !directory) throw Error('Unknown mode or missing directory');
const option=name=>{const i=args.indexOf(`--${name}`);return i<0?undefined:args[i+1];};
const dir=resolve(directory),credentials=option('credentials'),ref=option('project-ref');
if(!credentials || !ref) throw Error('Credentials file and explicit project reference required');
const api=client(await readJson(credentials));
if(api.origin!==(ref==='local'?'http://127.0.0.1:54321':`https://${ref}.supabase.co`)) throw Error('Project reference does not match credentials');
await mkdir(dir,{recursive:true,mode:0o700});
const inventoryFile=`${dir}/inventory.json`,manifestFile=`${dir}/manifest.json`,planFile=`${dir}/plan.json`;
const inventory=()=>allPages(api.json,'/rest/v1/library_items');
const history=batch=>allPages(api.json,`/rest/v1/image_migration_history?batch_id=eq.${batch}`,'product_id');
if(mode==='inventory') {
 // Resume verifies previous files and inventory; it never redownloads verified originals.
 let snapshot;
 if(args.includes('--resume')) {
  snapshot=await readJson(inventoryFile);
  if(snapshot.project!==ref || snapshot.origin!==api.origin || !snapshot.rows) throw Error('Resume snapshot is incomplete or targets another project');
  if(hash(JSON.stringify(snapshot.rows))!==hash(JSON.stringify(await inventory()))) throw Error('Inventory changed; resume refused');
 } else {
  await writeFile(inventoryFile,JSON.stringify({complete:false,project:ref}),{flag:'wx',mode:0o600});
  snapshot={complete:false,project:ref,origin:api.origin,createdAt:new Date().toISOString(),rows:await inventory(),objects:[]};
 }
 const rows=snapshot.rows,seen=new Map();let downloaded=0;
 for(const object of snapshot.objects) {
  if(hash(await readFile(`${dir}/${object.file}`))!==object.sha256) throw Error('Resume backup hash mismatch');
  if(!seen.has(object.path)) {seen.set(object.path,object);downloaded+=object.bytes;}
 }
 await saveJson(inventoryFile,snapshot);
 const pending=rows.filter(r=>r.kind==='product' && r.photo && !snapshot.objects.some(o=>o.productId===r.id));
 const paths=[...new Set(pending.map(row=>objectPath(row.photo,api.origin)))].filter(path=>!seen.has(path));
 for(let offset=0;offset<paths.length;offset+=3) {
  const batch=paths.slice(offset,offset+3);
  if(downloaded+batch.length*30*1024*1024>500*1024*1024) throw Error('Backup download budget reached; review before continuing');
  const objects=await Promise.all(batch.map(async path=>{
   const bytes=await readBytes(await api.raw(`/storage/v1/object/authenticated/catalogue/${encodedPath(path)}`));
   const sha256=hash(bytes),file=`original-${sha256}.bin`;
   await writeFile(`${dir}/${file}`,bytes,{mode:0o600});
   await sharp(bytes,{limitInputPixels:24000000}).metadata();
   return {path,file,sha256,bytes:bytes.length};
  }));
  for(const object of objects) {downloaded+=object.bytes;seen.set(object.path,object);}
  for(const row of pending) {
   if(snapshot.objects.some(o=>o.productId===row.id)) continue;
   const object=seen.get(objectPath(row.photo,api.origin));
   if(object) snapshot.objects.push({productId:row.id,previous:row.photo,...object});
  }
  await saveJson(inventoryFile,snapshot);
 }
 // Also account for references to an object already present in a resumed snapshot.
 for(const row of pending) if(!snapshot.objects.some(o=>o.productId===row.id)) snapshot.objects.push({productId:row.id,previous:row.photo,...seen.get(objectPath(row.photo,api.origin))});
 // Abort if business/photo data changed while the backup was being captured.
 if(hash(JSON.stringify(rows))!==hash(JSON.stringify(await inventory()))) throw Error('Inventory changed during backup; use a fresh directory');
 snapshot.complete=true;snapshot.downloadedBytes=downloaded;await saveJson(inventoryFile,snapshot);
 console.log(`Backed up ${rows.length} catalogue rows and ${snapshot.objects.length} product image references (${downloaded} downloaded bytes).`);
 process.exit(0);
}
const snapshot=await readJson(inventoryFile);
if(!snapshot.complete || snapshot.project!==ref || snapshot.origin!==api.origin) throw Error('Complete matching external backup required');
for(const object of snapshot.objects) if(hash(await readFile(`${dir}/${object.file}`))!==object.sha256) throw Error('Original backup hash mismatch');
if(mode==='prepare') {
 const products=[];
 for(const object of snapshot.objects) {
  const source=await readFile(`${dir}/${object.file}`),variants={};
  for(const [name,[limit,budget]] of Object.entries(ProductImages.specs)) {
   let bytes;
   for(const quality of [82,72,62,52]) {
    bytes=await sharp(source,{limitInputPixels:24000000}).rotate().resize(limit,limit,{fit:'inside',withoutEnlargement:true}).webp({quality}).toBuffer();
    if(bytes.length<=budget) break;
   }
   if(bytes.length>budget) throw Error(`Variant exceeds budget: ${object.productId}/${name}`);
   variants[name]={bytes:bytes.length,sha256:hash(bytes),buffer:bytes};
  }
  const version=hash(Object.values(variants).map(v=>v.sha256).join('')).slice(0,24);
  for(const [name,v] of Object.entries(variants)) {
   v.file=`variant-${version}-${name}.webp`;v.path=`variants-v1/${version}/${name}.webp`;
   await writeFile(`${dir}/${v.file}`,v.buffer,{mode:0o600});delete v.buffer;
  }
  products.push({id:object.productId,previous:object.previous,variants});
 }
 await saveJson(manifestFile,{project:ref,products});console.log(`Prepared variants for ${products.length} backed-up products.`);process.exit(0);
}
if(mode==='plan') {
 const manifest=await readJson(manifestFile);
 if(manifest.project!==ref) throw Error('Manifest project mismatch');
 const current=await inventory();
 if(hash(JSON.stringify(current))!==hash(JSON.stringify(snapshot.rows))) throw Error('Catalogue changed since backup; create a fresh snapshot');
 const entries=manifest.products.map(product=>{
  const original=snapshot.objects.find(o=>o.productId===product.id);
  if(!original || original.previous!==product.previous) throw Error('Manifest lacks matching original backup');
  return {...product,next:`${api.origin}/storage/v1/object/public/catalogue/${encodedPath(product.variants.grid.path)}`};
 }).filter(p=>p.previous!==p.next);
 const plan={project:ref,batch:randomUUID(),createdAt:new Date().toISOString(),backupHash:hash(JSON.stringify(snapshot)),entries};
 await saveJson(planFile,plan);console.log(`Dry run: ${entries.length} photo-only changes. Plan SHA256: ${hash(JSON.stringify(plan))}`);process.exit(0);
}
const plan=await readJson(planFile),planHash=hash(JSON.stringify(plan));
if(plan.project!==ref || plan.backupHash!==hash(JSON.stringify(snapshot)) || option('approve-plan')!==planHash) throw Error('Exact reviewed plan hash and matching backup required');
if(!/^[0-9a-f-]{36}$/.test(plan.batch)) throw Error('Invalid batch');
const selectedProduct=option('product');
if(selectedProduct && !plan.entries.some(entry=>entry.id===selectedProduct)) throw Error('Selected product is absent from the reviewed plan');
const ledger={project:ref,batch:plan.batch,mode,scope:selectedProduct || 'all',results:[],startedAt:new Date().toISOString()};
try {
 if(mode==='apply') {
  // Validate the complete source manifest before making any remote mutation.
  if(new Set(plan.entries.map(entry=>entry.id)).size!==plan.entries.length) throw Error('Duplicate product in plan');
  for(const entry of plan.entries) {
   const original=snapshot.objects.find(o=>o.productId===entry.id);
   if(!original || original.previous!==entry.previous || entry.next!==`${api.origin}/storage/v1/object/public/catalogue/${encodedPath(entry.variants.grid.path)}`) throw Error('Plan has invalid backup/URL mapping');
   if(Object.keys(entry.variants).sort().join(',')!=='detail,export,grid,thumb') throw Error('All four image variants are required');
   const version=hash(Object.keys(ProductImages.specs).map(name=>entry.variants[name].sha256).join('')).slice(0,24);
   for(const [name,v] of Object.entries(entry.variants)) {
    if(v.path!==`variants-v1/${version}/${name}.webp` || v.file!==`variant-${version}-${name}.webp`) throw Error('Variant version/path mismatch');
    if(!ProductImages.specs[name] || !/^variants-v1\/[a-f0-9]{24}\/(thumb|grid|export|detail)\.webp$/.test(v.path)) throw Error('Invalid immutable variant path');
    const bytes=await readFile(`${dir}/${v.file}`);
    if(bytes.length!==v.bytes || bytes.length>ProductImages.specs[name][1] || hash(bytes)!==v.sha256) throw Error('Variant source verification failed');
    const metadata=await sharp(bytes).metadata();if(metadata.format!=='webp' || Math.max(metadata.width,metadata.height)>ProductImages.specs[name][0]) throw Error('Invalid variant format/dimensions');
   }
  }
  const current=await inventory();
  if(hash(JSON.stringify(businessSnapshot(current)))!==hash(JSON.stringify(businessSnapshot(snapshot.rows)))) throw Error('Business data changed since backup; reconcile before applying');
  for(const entry of plan.entries.filter(entry=>!selectedProduct || entry.id===selectedProduct)) {
   const currentRow=current.find(r=>r.id===entry.id);
   if(!currentRow || ![entry.previous,entry.next].includes(currentRow.photo)) throw Error('Photo conflict; later edit preserved');
   const progress={id:entry.id,status:'verifying'};ledger.results.push(progress);await saveJson(`${dir}/progress.json`,ledger);
   for(const v of Object.values(entry.variants)) {
    const path=`/storage/v1/object/catalogue/${encodedPath(v.path)}`;
    const head=await api.raw(`/storage/v1/object/authenticated/catalogue/${encodedPath(v.path)}`,{method:'HEAD'});
    if(head.status===404 || head.status===400) await api.json(path,{method:'POST',headers:{'Content-Type':'image/webp','Cache-Control':'max-age=31536000','x-upsert':'false'},body:await readFile(`${dir}/${v.file}`)});
    else if(!head.ok) throw Error(`Variant lookup failed (${head.status})`);
    const response=await api.raw(`/storage/v1/object/authenticated/catalogue/${encodedPath(v.path)}`);
    const bytes=await readBytes(response,Math.max(v.bytes,1));
    if(bytes.length!==v.bytes || hash(bytes)!==v.sha256 || !response.headers.get('content-type')?.startsWith('image/webp')) throw Error('Remote variant content mismatch');
   }
   progress.status=await api.rpc('apply_image_migration',{p_batch:plan.batch,p_product:entry.id,p_previous:entry.previous,p_new:entry.next});
   await saveJson(`${dir}/progress.json`,ledger);
   if(!['applied','already_applied'].includes(progress.status)) throw Error('Photo update conflict; stopped safely');
  }
 } else {
  for(const entry of (await history(plan.batch)).filter(entry=>!selectedProduct || entry.product_id===selectedProduct)) {
   const result=await api.rpc('rollback_image_migration',{p_batch:plan.batch,p_product:entry.product_id});
   ledger.results.push({id:entry.product_id,status:result});await saveJson(`${dir}/progress.json`,ledger);
   if(!['rolled_back','already_rolled_back'].includes(result)) throw Error('Rollback conflict; later edit preserved');
  }
 }
 const after=await inventory();
 await saveJson(`${dir}/after.json`,{rows:after,businessFieldsUnchanged:hash(JSON.stringify(businessSnapshot(after)))===hash(JSON.stringify(businessSnapshot(snapshot.rows)))});
 ledger.complete=true;
} finally {
 await saveJson(`${dir}/progress.json`,ledger);
 await saveJson(`${dir}/history.json`,await history(plan.batch));
}
console.log(`${mode} completed for ${ledger.results.length} products; old objects retained.`);
