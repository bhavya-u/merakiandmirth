import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
function fixture() {
  const calls = [], failures = new Set();
  const rows = { library_items:[{id:'p',kind:'product'},{id:'c',kind:'combo'}], orders:[{id:'o'}], clients:[{id:'client'}] };
  const response = name => { calls.push(name); return { data: rows[name] || [], error: failures.has(name) ? { message:'test failure' } : null }; };
  const db = { from: name => { const chain = { select:()=>chain, order:()=>chain, eq:()=>chain, then:(yes,no)=>Promise.resolve(response(name)).then(yes,no) }; return chain; }, rpc:name=>Promise.resolve(response(name)) };
  const c = vm.createContext({ db, ordersFrom:'', ordersTo:'', orderSummary:{},orderHasMore:false,orderRevision:0,orderPageQuery:()=>Promise.resolve(response('orders')), accessGranted:true, products:[],combos:[],orders:[],clients:[],vendors:[],occasionTypes:[],defaultOccasionTypes:[],expenseClaims:[],expensePolicies:[],expenseAdmins:[],productFromRow:x=>x,comboFromRow:x=>x,orderFromRow:x=>x,syncOccasionLists:()=>{},renderAll:()=>{} });
  vm.runInContext(app.slice(app.indexOf('const viewData ='), app.indexOf('\nasync function updateAccess')), c);
  return { c, calls, failures };
}
test('Studio reads only items/occasions; targeted refresh preserves other data', async () => {
  const {c,calls} = fixture();
  await vm.runInContext('hydrateFromSupabase(viewData.studio)',c);
  assert.deepEqual(calls.sort(), ['library_items','occasion_types']);
  assert.equal(c.products.length,1);
  const products=c.products;
  calls.length=0;
  await c.hydrateFromSupabase(['clients']);
  assert.deepEqual(calls.sort(),['clients','workspace_client_order_summary']);
  assert.equal(c.products,products);
  assert.equal(c.clients[0].id,'client');
});
test('failed refresh publishes no partial data and next refresh recovers', async () => {
  const {c,failures} = fixture(); failures.add('orders');
  await assert.rejects(c.hydrateFromSupabase(['items','orders']), /test failure/);
  assert.equal(c.products.length,0);
  failures.clear();
  await c.hydrateFromSupabase(['items','orders']);
  assert.equal(c.orders.length,1);
});
test('queued reads from a previous auth epoch cannot publish data', async () => {
  const {c,calls}=fixture();
  const task=c.hydrateFromSupabase(['items']);
  vm.runInContext('dataEpoch++',c);
  await task;
  assert.equal(calls.length,0);
  assert.equal(c.products.length,0);
});
