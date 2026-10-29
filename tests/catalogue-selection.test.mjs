import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import '../product-catalogue.js';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('search and filters retain selections, and export includes hidden selections',async()=>{
 const products=[{id:'tray',name:'Tray',baseCost:100,events:[]},{id:'bag',name:'Bag',baseCost:50,events:[]}],selection=new Set(['tray']);
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:true,querySelectorAll:()=>[],innerHTML:''});return nodes.get(id);};$('#pcMarkup').value='45';$('#pcSearch').value='bag';
 let exported;
 const c=vm.createContext({products,productCatalogueSelection:selection,$,ProductCatalogue:{...globalThis.ProductCatalogue,pdf:async args=>{exported=args.products;return{output:()=>''};}},escapeHtml:s=>s,imageMarkup:()=>'',tagLabel:s=>s, money:String,assertAccess:()=>true,dataEpoch:1,accessGranted:true,setExportPending:()=>{},window:{jspdf:{jsPDF(){}}},pdfTileCache:new Map(),imageDataForPdf:async()=>'',pdfExportFilename:()=>'',isNativeApp:()=>false,saveExportBlob:async()=>{},notify:message=>{throw Error(message);}});
 vm.runInContext(source.slice(source.indexOf('function productCatalogueOptions()'),source.indexOf("\n['pcMarkup','pcSearch'")),c);
 c.renderProductCatalogue();assert.deepEqual([...selection],['tray']);assert.match($('#pcCount').textContent,/1 outside current filters/);
 selection.add('bag');$('#pcSearch').value='tray';c.renderProductCatalogue();assert.equal(selection.size,2);assert.match($('#pcProducts').innerHTML,/checked/);
 $('#pcSearch').value='no matches';c.renderProductCatalogue();assert.equal(selection.size,2);assert.equal($('#pcExport').disabled,false);
 await c.exportProductCatalogue();assert.deepEqual(Array.from(exported,p=>p.id),['bag','tray']);assert.equal(selection.size,2);
});
