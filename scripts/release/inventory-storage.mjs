import {createClient} from '@supabase/supabase-js';
import {readJson,saveJson,client} from './image-migration-lib.mjs';
const [directory,credentials,ref]=process.argv.slice(2);
if(!directory || !credentials || !ref)throw Error('Usage: inventory-storage.mjs DIRECTORY CREDENTIALS_FILE PROJECT_REF');
const settings=await readJson(credentials),api=client(settings);
if(api.origin!==(ref==='local'?'http://127.0.0.1:54321':`https://${ref}.supabase.co`))throw Error('Project mismatch');
const db=createClient(settings.url,settings.key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000)})}});
const objects=[],folders=[''],visited=new Set();
while(folders.length) {
 const prefix=folders.shift();if(visited.has(prefix))throw Error('Repeated folder');visited.add(prefix);
 for(let offset=0;;offset+=500) {
  const {data,error}=await db.storage.from('catalogue').list(prefix,{limit:500,offset,sortBy:{column:'name',order:'asc'}});
  if(error)throw Error('Storage inventory request failed');
  for(const object of data) {
   const path=prefix?`${prefix}/${object.name}`:object.name;
   if(!object.id)folders.push(path);else objects.push({path,...object});
  }
  if(data.length<500)break;
 }
}
const bytes=objects.reduce((sum,o)=>sum+Number(o.metadata?.size||0),0);
await saveJson(`${directory}/storage-inventory.json`,{project:ref,createdAt:new Date().toISOString(),bytes,objects});
console.log(`Catalogue bucket inventory: ${objects.length} objects, ${bytes} stored bytes. No objects changed.`);
