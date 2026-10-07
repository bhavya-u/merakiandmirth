import test from 'node:test';
import assert from 'node:assert/strict';
import {assessEgress} from '../scripts/egress-budget.mjs';
test('each quota is independent and projected usage triggers review',()=>{
 const result=assessEgress({cachedGB:2,uncachedGB:.1,elapsedDays:10,cycleDays:30});
 assert.equal(result.cached.projectedGB,6);assert.equal(result.cached.status,'investigate');assert.equal(result.uncached.status,'within-target');
});
test('breached quota has zero remaining and bad inputs fail',()=>{
 assert.equal(assessEgress({cachedGB:6,uncachedGB:0,elapsedDays:1,cycleDays:30}).cached.remainingGB,0);
 assert.throws(()=>assessEgress({cachedGB:1,uncachedGB:1,elapsedDays:0,cycleDays:30}));
});
