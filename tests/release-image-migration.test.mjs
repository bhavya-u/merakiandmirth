import test from 'node:test';
import assert from 'node:assert/strict';
import {allPages,objectPath,readBytes,client,hash} from '../scripts/release/image-migration-lib.mjs';
test('administrative inventory/history pagination exceeds default API row limit',async()=>{
 const source=Array.from({length:1001},(_,i)=>({id:String(i).padStart(5,'0')}));let calls=0;
 const rows=await allPages(async path=>{calls++;const q=new URL(path,'http://local').searchParams;return source.filter(r=>!q.get('id') || r.id>q.get('id').slice(3)).slice(0,500);},'/rest/v1/library_items');
 assert.equal(rows.length,1001);assert.equal(calls,3);
 await assert.rejects(allPages(async()=>Array(500).fill({id:'same'}),'/x'),/advance/);
});
test('image backup refuses foreign, signed or traversal URLs',()=>{
 const origin='https://example.supabase.co',prefix=origin+'/storage/v1/object/public/catalogue/';
 assert.equal(objectPath(prefix+'owner/a%20b.png',origin),'owner/a b.png');
 for(const url of ['https://evil.example/a',prefix+'a?token=secret',prefix+'%2e%2e%2fx']) assert.throws(()=>objectPath(url,origin));
});
test('backup enforces byte limit and computes content hash',async()=>{
 assert.equal(hash(await readBytes(new Response('hello'),5)),hash('hello'));
 await assert.rejects(readBytes(new Response('too large'),3),/limit/);
});
test('credentials go only to validated project and redirects are disabled',async()=>{
 let seen;const api=client({url:'https://example.supabase.co',key:'test'},async(url,opts)=>{seen={url,opts};return new Response('[]');});
 await api.json('/rest/v1/library_items');assert.equal(seen.opts.redirect,'error');
 await assert.rejects(api.raw('//evil.example'),/Absolute/);
 assert.throws(()=>client({url:'https://evil.example',key:'test'}),/Unsupported/);
});
