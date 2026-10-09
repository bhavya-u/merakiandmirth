import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
export const hash = value => createHash('sha256').update(value).digest('hex');
export async function saveJson(file, value) {
 await mkdir(dirname(file), { recursive:true, mode:0o700 });
 await writeFile(`${file}.tmp`, JSON.stringify(value,null,2), {mode:0o600});
 await rename(`${file}.tmp`,file);
}
export async function readJson(file) { return JSON.parse(await readFile(file,'utf8')); }
export async function allPages(read, path, key='id') {
 const rows=[]; let cursor;
 for (;;) {
  const query=new URLSearchParams({select:'*',order:`${key}.asc`,limit:'500'});
  if(cursor!==undefined) query.set(key,`gt.${cursor}`);
  const page=await read(`${path}${path.includes('?')?'&':'?'}${query}`);
  if(!Array.isArray(page)) throw Error('Expected an inventory array');
  for(const row of page) {
   if(row[key]===undefined || (cursor!==undefined && row[key]<=cursor)) throw Error('Inventory cursor failed to advance');
   rows.push(row);cursor=row[key];
  }
  if(page.length<500) return rows;
 }
}
export function objectPath(url, origin) {
 const parsed=new URL(url),base=new URL(origin),prefix='/storage/v1/object/public/catalogue/';
 if(parsed.origin!==base.origin || !parsed.pathname.startsWith(prefix) || parsed.search || parsed.hash) throw Error('Image URL is not a plain public catalogue object on the selected project');
 const path=decodeURIComponent(parsed.pathname.slice(prefix.length));
 if(!path || path.split('/').some(x=>!x || x==='.' || x==='..')) throw Error('Unsafe object path');
 return path;
}
export const encodedPath = path => path.split('/').map(encodeURIComponent).join('/');
export async function readBytes(response, max=30*1024*1024) {
 if(!response.ok) throw Error(`Object download failed (${response.status})`);
 if(Number(response.headers.get('content-length'))>max) throw Error('Object exceeds backup limit');
 const chunks=[];let size=0;
 for await(const chunk of response.body) {
  size+=chunk.length;if(size>max) throw Error('Object exceeds backup limit');chunks.push(chunk);
 }
 return Buffer.concat(chunks);
}
export function client({url,key},fetcher=fetch) {
 const base=new URL(url);
 if(base.pathname!=='/' || base.search || base.hash || base.username || base.password || !(base.protocol==='https:' && /^[a-z0-9]+\.supabase\.co$/.test(base.hostname) || base.origin==='http://127.0.0.1:54321')) throw Error('Unsupported Supabase endpoint');
 const raw=async(path,options={})=>{
  if(!path.startsWith('/') || path.startsWith('//')) throw Error('Absolute API path required');
  return fetcher(base.origin+path,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,...options.headers},signal:AbortSignal.timeout(30000),redirect:'error'});
 };
 const json=async(path,options={})=>{
  const r=await raw(path,options);if(!r.ok)throw Error(`API request failed (${r.status})`);
  const text=await r.text();return text?JSON.parse(text):null;
 };
 return {origin:base.origin,raw,json,rpc:(name,body)=>json(`/rest/v1/rpc/${name}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})};
}
export function businessSnapshot(rows) { return rows.map(({photo,updated_at,...row})=>row).sort((a,b)=>a.id.localeCompare(b.id)); }
