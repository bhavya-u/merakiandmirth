import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('const workspaceReadControllers'),app.indexOf('\nwindow.fetch ='));
function fixture(fetch) {
 const context=vm.createContext({browserFetch:fetch,Request,Response,AbortController,setTimeout,clearTimeout});
 vm.runInContext(source,context);return context;
}
test('quota response pauses subsequent reads without another network request',async()=>{
 let requests=0;const c=fixture(async()=>{requests++;return new Response('{}',{status:402});});
 assert.equal((await c.fetchWorkspaceRead('/local',{})).status,402);
 assert.equal((await c.fetchWorkspaceRead('/local',{})).status,429);
 assert.equal(requests,1);
});
test('caller abort is forwarded and controllers are released',async()=>{
 const c=fixture(async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})));
 const abort=new AbortController();const pending=c.fetchWorkspaceRead('/local',{signal:abort.signal});abort.abort();
 await assert.rejects(pending,/aborted/);
 assert.equal(vm.runInContext('workspaceReadControllers.size',c),0);
});
