import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
const app = readFileSync(new URL('../app.js', import.meta.url),'utf8');
function setup() {
 const storage = new Map(); let next=0;
 const c=vm.createContext({crypto:webcrypto,TextEncoder,user:{id:'owner'},uuid:()=>`op-${++next}`,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
 vm.runInContext(app.slice(app.indexOf('const pendingBusinessWrites ='),app.indexOf('async function refreshAfterCommit')),c);
 return {write:c.writeOnce,storage};
}
test('lost response retries with same operation and blocks changed intent',async()=>{
 const h=setup(); let first;
 await assert.rejects(h.write('quotation',{total:10},async op=>{first=op;throw Error('network');}));
 await assert.rejects(h.write('quotation',{total:20},async()=>assert.fail()),/uncertain/);
 assert.equal(await h.write('quotation',{total:10},async op=>{assert.equal(op,first);return {data:'saved'};}),'saved');
 assert.equal(h.storage.size,0);
});
test('confirmed SQL failure permits corrected input',async()=>{
 const h=setup();
 await assert.rejects(h.write('quotation',{total:-1},async()=>({error:{code:'23514',message:'invalid'}})));
 assert.equal(h.storage.size,0);
 await h.write('quotation',{total:10},async()=>({data:'saved'}));
});
test('stock set recovery preserves original expected stock after reload',async()=>{
 const h=setup(); const original={quantity:5,expected_stock:2};
 await assert.rejects(h.write('inventory',original,async()=>{throw Error('lost');}));
 const retry={quantity:5,expected_stock:5};
 await h.write('inventory',retry,async()=>{assert.equal(retry.expected_stock,2);return {data:'saved'};});
});
test('concurrent identical submissions share one request',async()=>{
 const h=setup();let count=0,release;
 const gate=new Promise(r=>release=r);
 const execute=async()=>{count++;await gate;return {data:42};};
 const a=h.write('quotation',{total:10},execute),b=h.write('quotation',{total:10},execute);
 await new Promise(r=>setTimeout(r,30)); release();
 assert.deepEqual(await Promise.all([a,b]),[42,42]);assert.equal(count,1);
});
