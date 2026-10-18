import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const c=vm.createContext({editingQuote:{comboId:'old',unitCost:50,price:65,margin:30},comboCost:()=>100});
vm.runInContext(source.split('\n').find(line=>line.startsWith('function quotePricing(')),c);
test('editing preserves historical price and cost despite catalogue price changes',()=>{assert.equal(c.quotePricing({id:'old'},30).price,65);assert.equal(c.quotePricing({id:'old'},30).cost,50);});
test('margin edits reprice historical cost, different combo uses current cost',()=>{assert.equal(c.quotePricing({id:'old'},40).price,70);assert.equal(c.quotePricing({id:'new'},30).price,130);assert.equal(c.quotePricing({id:'old'},0).price,50);});
test('same-user auth refresh preserves edit identity and does not clear workspace',async()=>{
 const edit={id:'original-quote',expected:{id:'original-quote'}};
 const context=vm.createContext({user:{id:'owner'},accessGranted:true,editingQuote:edit,dataEpoch:7,resetQuoteEdit:()=>{throw Error('Edit must survive refresh');}});
 vm.runInContext(source.slice(source.indexOf('async function updateAccess('),source.indexOf('\nasync function signInWithPassword(')),context);
 await context.updateAccess({user:{id:'owner',email:'owner@example.test'}});
 assert.equal(context.editingQuote,edit);assert.equal(context.dataEpoch,7);
});
test('a populated saved quote cannot fall back to insert after losing edit state',async()=>{
 let message='';const context=vm.createContext({savingQuote:false,assertAccess:()=>true,editingQuote:null,$:()=>({dataset:{quoteId:'existing'}}),notify:value=>{message=value;},quoteValues:()=>{throw Error('Must block before new-quote save');}});
 vm.runInContext(source.slice(source.indexOf('async function saveOrder()'),source.indexOf('\nasync function exportQuoteNativeEnhanced')),context);
 await context.saveOrder();assert.match(message,/existing quotation/);
});
test('editing routes to update RPC with original id and cannot insert on repeat save',async()=>{
 const calls=[],elements=new Map(),quote={combo:{id:'combo',occasion:'all'},clientName:'Client',clientMobile:'9000000001',quantity:2,cost:10,total:26};
 const context=vm.createContext({savingQuote:false,assertAccess:()=>true,editingQuote:{id:'original',expected:{id:'original'}},$:key=>{if(!elements.has(key))elements.set(key,{dataset:{}});return elements.get(key);},quoteValues:()=>quote,notify:()=>{},writeOnce:async(kind,payload,run)=>run('operation'),db:{rpc:async(name,args)=>{calls.push({name,args});return{id:'original'};}},resetQuoteEdit:()=>{context.editingQuote=null;},dispatchTelegramNotifications:()=>{},refreshAfterCommit:async()=>{},navigate:async()=>{},openOrderDetail:async()=>{}});
 vm.runInContext(source.slice(source.indexOf('async function saveOrder()'),source.indexOf('\nasync function exportQuoteNativeEnhanced')),context);
 await context.saveOrder();await context.saveOrder();assert.equal(calls.length,1);assert.equal(calls[0].name,'update_quotation_once');assert.equal(calls[0].args.p_id,'original');
});
