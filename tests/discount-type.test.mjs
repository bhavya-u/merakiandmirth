import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const fn=name=>app.split('\n').find(line=>line.startsWith(`function ${name}(`));
const c=vm.createContext({combos:[],profitStatuses:new Set(),comboCost:()=>0});
vm.runInContext(fn('quoteDiscountLabel')+'\n'+fn('orderFromRow'),c);
test('discount type survives saved order mapping; legacy orders retain generic label',()=>{
 for(const type of ['', 'Family','Friends']){
 const order=c.orderFromRow({items:[{discountType:type}],discount_percent:5,discount_amount:10,qty:1,total:190,created_at:'2026-10-11T00:00:00Z'});
 assert.equal(c.quoteDiscountLabel(order),`5% ${type?type+' ':''}discount`);
 }
 assert.equal(c.quoteDiscountLabel(c.orderFromRow({items:[],discount_percent:5,created_at:'2026-10-11'})),'5% discount');
});
test('optional type changes wording without changing discount calculations',()=>{
 const values={'#quoteQuantity':'35','#quoteMargin':'30','#quoteClientName':'Sample','#quoteClientMobile':'9999999999','#quoteDeliveryArea':'Local','#quoteSpecialRequest':'','#quoteComplimentary':'','#quoteEventDate':'','#quoteDeliveryDate':'','#quoteNetWrapping':'false','#quoteDiscountPercent':'5','#quoteDiscountType':'Family','#quoteTitle':'Sample quote'};
 const context=vm.createContext({$:id=>({value:values[id]}),selectedQuoteCombo:()=>({productIds:[]}),quoteAdditionalCostValues:()=>[],comboCost:()=>39,quoteDefaultTitle:()=>''});
 vm.runInContext(fn('quoteValues'),context);
 const family=context.quoteValues();values['#quoteDiscountType']='';const plain=context.quoteValues();
 assert.equal(family.discountType,'Family');assert.equal(family.total,1695.75);assert.equal(family.total,plain.total);assert.equal(family.discountAmount,89.25);
});
