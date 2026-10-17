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
app=app.replace('<div class="expense-actions">','<div class="expense-actions"><button class="soft-btn" data-expense-copy="${claim.id}">Copy for WhatsApp</button>');
app=app.replace("  document.querySelectorAll('[data-expense-review]')","  document.querySelectorAll('[data-expense-copy]').forEach(button => button.onclick = () => copyExpenseClaim(button.dataset.expenseCopy));\n  document.querySelectorAll('[data-expense-review]')");
app+='\n'+section(current,'function expenseWhatsappMessage(','function renderExpenses(');
app+='\n'+section(current,'async function saveExportBlob(','async function exportExpenses(');
app+='\n'+current.slice(current.indexOf('// Individual gift catalogues'));
// Product metadata is deployed independently from quote/expense migrations.
for (const [start,end] of [['function productFromRow(', 'function comboFromRow('], ['function openProductDialog(', 'async function uploadImage('], ['async function saveProduct(', 'async function deleteProduct(']]) {
  if (!app.includes(start) || !app.includes(end) || !current.includes(end)) throw Error('Product preview boundary missing: '+start);
  app=app.replace(section(app,start,end),section(current,start,end));
}
app=app.replace("lead_time_days,created_at'", "lead_time_days,created_at,catalogue_role,collection_tags'");
app=app.replaceAll('product.name.toLowerCase().includes(query)','ProductCatalogue.matches(product,query)');
index=index.replace(section(index,'  <dialog id="productDialog"','  <dialog id="occasionDialog"'),section(html,'  <dialog id="productDialog"','  <dialog id="occasionDialog"'));
const catalogueSection=section(html,'    <section class="view" id="catalogues">','    <section class="view" id="quotes">');
index=index.replace(section(index,'    <section class="view" id="catalogues">','    <section class="view" id="quotes">'),catalogueSection);
index=index.replace(/<script src="app.js[^\"]*"><\/script>/,'<script src="product-catalogue.js?v=production-tags-1"></script><script src="app.js?v=production-tags-1"></script>');
index=index.replace(/styles\.css(?:\?[^"]*)?"/,'styles.css?v=production-tags-1"');
await writeFile(resolve(root,'dist/app.js'),app);await writeFile(resolve(root,'dist/index.html'),index);
for(const file of ['styles.css','product-catalogue.js'])await copyFile(resolve(root,file),resolve(root,'dist',file));
console.log('Updated dist catalogue preview; existing production config and non-catalogue workflows preserved.');
