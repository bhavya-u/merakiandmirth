import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const code=app.slice(app.indexOf('async function fetchAllMetadata'),app.indexOf('\nfunction dataQueries'));
test('complete metadata crosses API page boundaries without losing rows',async()=>{
 const c=vm.createContext({dataEpoch:1,accessGranted:true});vm.runInContext(code,c);
 const rows=Array.from({length:1001},(_,i)=>({id:String(i).padStart(5,'0')}));let calls=0;
 const make=()=>{let cursor='';const query={order:()=>query,limit:()=>query,gt:(_k,v)=>{cursor=v;return query;},then:yes=>{calls++;return Promise.resolve(yes({data:rows.filter(r=>r.id>cursor).slice(0,500),error:null}));}};return query;};
 const result=await c.fetchAllMetadata(make);
 assert.equal(result.data.length,1001);assert.equal(new Set(result.data.map(r=>r.id)).size,1001);assert.equal(calls,3);
});
test('a later page failure cannot publish a truncated catalogue',async()=>{
 const c=vm.createContext({dataEpoch:1,accessGranted:true});vm.runInContext(code,c);let calls=0;
 const make=()=>{const q={order:()=>q,limit:()=>q,gt:()=>q,then:yes=>Promise.resolve(yes(++calls===1?{data:Array.from({length:500},(_,i)=>({id:String(i)}))}:{error:{message:'offline'}}))};return q;};
 const result=await c.fetchAllMetadata(make);assert.equal(result.data,null);assert.equal(result.error.message,'offline');
});
