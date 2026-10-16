// Catalogue-only preview against the existing production schema. Other unreleased
// features stay on the last compatible client until their migrations are deployed.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const baseline='06ea2e8';
const old=path=>execFileSync('git',['show',`${baseline}:${path}`],{cwd:root,encoding:'utf8'});
const current=await readFile(resolve(root,'app.js'),'utf8');
const html=await readFile(resolve(root,'index.html'),'utf8');
let app=old('app.js'),index=old('index.html');
const section=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
app=app.replace(section(app,'const pdfPalette =','function selectedQuoteCombo()'),section(current,'const pdfPalette =','function quotePricing('));
app=current.split('\n').slice(0,2).join('\n')+'\n'+app;
app=app.replace('let quoteAdditionalCosts = [];','const productCatalogueSelection = new Set();\nlet quoteAdditionalCosts = [];');
app=app.replace('function renderAll() {','function renderAll() { renderProductCatalogue();');
app=app.replace('<h3>${escapeHtml(product.name)}</h3>','<h3>${escapeHtml(product.name)}</h3>${onlineProductBadge(product)}').replace('<h2>${escapeHtml(product.name)}</h2>','<h2>${escapeHtml(product.name)}</h2>${onlineProductBadge(product)}');
app+='\n'+section(current,'async function saveExportBlob(','async function exportExpenses(');
app+='\n'+current.slice(current.indexOf('// Individual gift catalogues'));
// These columns have not yet been deployed; do not show unusable filters.
app+="\n$('#pcRole').disabled=true;$('#pcTag').disabled=true;\n";
const catalogueSection=section(html,'    <section class="view" id="catalogues">','    <section class="view" id="quotes">');
index=index.replace(section(index,'    <section class="view" id="catalogues">','    <section class="view" id="quotes">'),catalogueSection);
index=index.replace(/<script src="app.js[^\"]*"><\/script>/,'<script src="product-catalogue.js?v=catalogue-tabs-1"></script><script src="app.js?v=catalogue-tabs-1"></script>');
index=index.replace(/styles\.css(?:\?[^"]*)?"/,'styles.css?v=catalogue-tabs-1"');
app+="\n$('#pcRole').closest('label').hidden=true;$('#pcTag').closest('label').hidden=true;\n";
index=index.replace('Prices include 45% added to cost plus buffer. Assign roles and collection tags in Product Library → Edit.','Prices include 45% added to cost plus buffer.');
await writeFile(resolve(root,'dist/app.js'),app);await writeFile(resolve(root,'dist/index.html'),index);
for(const file of ['styles.css','product-catalogue.js'])await copyFile(resolve(root,file),resolve(root,'dist',file));
console.log('Updated dist catalogue preview; existing production config and non-catalogue workflows preserved.');
