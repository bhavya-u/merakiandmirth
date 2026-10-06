import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const app = await readFile(new URL('../app.js', import.meta.url),'utf8');
test('ledger uses explicit columns, stable cursor ordering and one lookahead row', () => {
 const calls=[]; const chain={};
 for(const name of ['select','order','limit','or']) chain[name]=(...args)=>{calls.push([name,...args]);return chain;};
 const c=vm.createContext({db:{from:()=>chain}});
 vm.runInContext(app.slice(app.indexOf('const expenseFields ='),app.indexOf('async function loadMoreExpenses')),c);
 c.expensePageQuery({created_at:'2026-01-01T00:00:00+00:00',id:'abc'});
 assert.ok(!calls[0][1].includes('*'));
 assert.deepEqual(calls.filter(x=>x[0]==='order').map(x=>x[1]),['created_at','id']);
 assert.equal(calls.find(x=>x[0]==='limit')[1],51);
 assert.equal(calls.find(x=>x[0]==='or')[1],'created_at.lt.2026-01-01T00:00:00+00:00,and(created_at.eq.2026-01-01T00:00:00+00:00,id.lt.abc)');
});
