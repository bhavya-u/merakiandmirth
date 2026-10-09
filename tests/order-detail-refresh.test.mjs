import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function setup(read) {
 const rendered=[], notices=[],dialog={open:true,close(){this.open=false;}};
 const c=vm.createContext({openOrderId:'page-two',dataEpoch:0,accessGranted:true,orders:[],$:()=>dialog,orderBaseQuery:()=>({eq:(_key,id)=>{assert.equal(id,'page-two');return {maybeSingle:read};}}),orderFromRow:x=>x,renderOrderDetail:x=>rendered.push(x),notify:x=>notices.push(x)});
 vm.runInContext(app.slice(app.indexOf('async function refreshOpenOrderDetail'),app.indexOf('async function openOrderDetail')),c);
 return {c,rendered,notices,dialog};
}
test('selected order outside refreshed first page loads current detail',async()=>{
 const h=setup(async()=>({data:{id:'page-two',status:'Delivered'}}));
 await h.c.refreshOpenOrderDetail();assert.equal(h.rendered[0].status,'Delivered');
});
test('deleted order closes detail; failed refresh never leaves stale actions open',async()=>{
 for(const response of [{data:null},{error:{message:'offline'}}]) {
  const h=setup(async()=>response);await h.c.refreshOpenOrderDetail();assert.equal(h.dialog.open,false);assert.equal(h.c.openOrderId,null);
 }
});
test('late detail response cannot overwrite another selection or auth epoch',async()=>{
 for(const mutate of [c=>c.openOrderId='other',c=>c.dataEpoch++]) {
  let release;const h=setup(()=>new Promise(r=>release=r));const pending=h.c.refreshOpenOrderDetail();mutate(h.c);release({data:{id:'page-two'}});await pending;assert.equal(h.rendered.length,0);
 }
});
