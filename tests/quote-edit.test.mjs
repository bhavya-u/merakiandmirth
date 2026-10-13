import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const c=vm.createContext({editingQuote:{comboId:'old',unitCost:50,price:65,margin:30},comboCost:()=>100});
vm.runInContext(source.split('\n').find(line=>line.startsWith('function quotePricing(')),c);
test('editing preserves historical price and cost despite catalogue price changes',()=>{assert.equal(c.quotePricing({id:'old'},30).price,65);assert.equal(c.quotePricing({id:'old'},30).cost,50);});
test('margin edits reprice historical cost, different combo uses current cost',()=>{assert.equal(c.quotePricing({id:'old'},40).price,70);assert.equal(c.quotePricing({id:'new'},30).price,130);assert.equal(c.quotePricing({id:'old'},0).price,50);});
