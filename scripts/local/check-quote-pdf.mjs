// Exercise the actual native PDF drawing functions in Node; the image decoder and
// device share bridge are replaced for this layout-only test, not app runtime.
import vm from 'node:vm';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { jsPDF } from 'jspdf';
import sharp from 'sharp';
import { root } from './common.mjs';
await import('../../product-catalogue.js');
const app = await readFile(`${root}/app.js`, 'utf8');
const manifest = JSON.parse(await readFile(`${root}/.local/image-variants/manifest.json`));
const names = await readdir(`${root}/assets/catalogue`);
const products = manifest.slice(0, 12).map(p => ({ ...p, name: names.find(n => n.endsWith(`--${p.id}.png`)).split('--')[0] }));
const tiles = {};
for (const p of products) tiles[p.id] = 'data:image/png;base64,' + (await sharp(p.variants.export.file).resize(720, 720, { fit: 'cover', background: '#ffffff' }).png().toBuffer()).toString('base64');
const logo = 'data:image/jpeg;base64,' + (await sharp(`${root}/assets/meraki-mirth-logo-original.png`).flatten({ background: '#ffffff' }).jpeg().toBuffer()).toString('base64');
const combos = [{name:'Single Product Test Set',items:products.slice(0,1)}, {name:'Local Celebration Set',items:products.slice(0,3)}, {name:'Six Product Test Set',items:products.slice(0,6)}, {name:'Twelve Product Test Set',items:products}];
const context = vm.createContext({ window: { jspdf: { jsPDF } }, ProductCatalogue:globalThis.ProductCatalogue, $:()=>({value:''}), isNativeApp:()=>true, COMBO_COLLAGE_PRODUCTS:6,
  dataEpoch:1,accessGranted:true,quoteSetItems:q=>q.combo.items,quoteThankYou:()=> 'Thank you for considering Meraki & Mirth for your celebration.', quoteDeliveryDetails:()=>['Delivery date: 2 November 2026','Delivery area: Sholinganallur'],formattedDate:()=> '4 November 2026',quoteDiscountLabel:()=> '5% Family discount',pdfExportFilename:()=> 'quote.pdf', comboProducts: c=>c.items, comboNeedsProductPage:c=>c.items.length>6,
  catalogueWelcome:()=> 'Thank you for considering Meraki & Mirth. These sample sets exercise the optimized image export.',
  liveComboRate:()=>585, normalizeTag:()=> 'all', tagLabel:()=> 'All occasions', tiles, logo,
  savePdf: async doc=>writeFile(`${root}/.local/quote-layout-check.pdf`, Buffer.from(doc.output('arraybuffer')))
});
vm.runInContext(app.slice(app.indexOf('const pdfPalette ='), app.indexOf('\nfunction catalogueSheetPage')), context);
vm.runInContext(`pdfTileData = async product => tiles[product.id]; imageDataForPdf = async () => logo; shareNativePdf = async doc => savePdf(doc);`,context);
vm.runInContext(app.slice(app.indexOf('async function exportQuoteNativeEnhanced('),app.indexOf('function orderDateKey')),context);
await context.exportQuoteNativeEnhanced({combo:combos[2],title:'Diwali Celebration',clientName:'Sample Client',price:85,quantity:50,total:4250,eventDate:'2026-11-04',complimentary:'Thank-you card included',specialRequest:'Use a warm gold colour palette.'});
console.log('Saved .local/quote-layout-check.pdf (native drawing functions; simulated decode/share bridge).');
