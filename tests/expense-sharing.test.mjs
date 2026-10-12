import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import{readFileSync}from'node:fs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('Excel native share writes a cached XLSX and forwards only its file URI',async()=>{
 let written,shared;const c=vm.createContext({window:{Capacitor:{isNativePlatform:()=>true,Plugins:{Filesystem:{writeFile:async args=>(written=args,{uri:'file:///cache/settlement.xlsx'})},Share:{share:async args=>{shared=args;}}}}},FileReader:class{readAsDataURL(){this.result='data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,dGVzdA==';this.onload();}}});
 vm.runInContext(app.slice(app.indexOf('async function saveExportBlob('),app.indexOf('async function exportExpenses(')),c);
 await c.saveExportBlob({},'settlement.xlsx','Expense settlement');assert.equal(written.path,'settlement.xlsx');assert.equal(written.directory,'CACHE');assert.equal(written.data,'dGVzdA==');assert.equal(shared.url,'file:///cache/settlement.xlsx');
});
