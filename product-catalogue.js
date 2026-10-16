/* Product catalogue rules shared by screen filters and PDF generation. */
(function (root) {
 const roles = ['main-gift', 'add-on', 'packaging'];
 const tags = value => [...new Set(String(value || '').split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean))].slice(0,20);
 const price = product => Math.round((Number(product.baseCost || 0) + Number(product.buffer || 0)) * 145 / 100);
 const date = value => value ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)) : '';
 function filter(products, options) {
  return products.filter(product => {
   const amount = price(product), added = date(product.createdAt);
   return (options.min === '' || amount >= Number(options.min)) && (options.max === '' || amount <= Number(options.max)) &&
    (!options.role || product.catalogueRole === options.role) && (!options.tag || (product.collectionTags || []).includes(options.tag)) &&
    (!options.occasion || (product.events || []).includes(options.occasion) || (product.events || []).includes('all')) &&
    (!options.from || (added && added >= options.from)) && (!options.to || (added && added <= options.to));
  }).sort((a,b)=>price(a)-price(b) || a.name.localeCompare(b.name));
 }
 async function pdf({jsPDF,products,showPrices,client='',image}) {
  const doc = new jsPDF({unit:'mm',format:'a4',compress:true});
  const safe = value => String(value || '').replace(/[‘’]/g,"'").replace(/[–—]/g,'-');
  function text(value,x,y,width,size=12){doc.setFontSize(size);let lines=doc.splitTextToSize(safe(value),width);while(lines.length>3 && size>9){size--;doc.setFontSize(size);lines=doc.splitTextToSize(safe(value),width);} if(lines.length>3) lines=[...lines.slice(0,2),lines[2].slice(0,-3)+'...'];doc.text(lines,x,y);}
  for(let index=0;index<products.length;index++) {
   if(index && index%2===0) doc.addPage();
   if(index%2===0){doc.setTextColor(24,59,52);doc.setFont('times','bold');text('Meraki & Mirth',14,17,180,22);doc.setFont('helvetica','normal');text(client ? `Gift collection for ${client}`:'A thoughtful gift collection',14,26,180,11);doc.setDrawColor(229,215,199);doc.line(14,32,196,32);text(`Page ${Math.floor(index/2)+1} of ${Math.ceil(products.length/2)}`,164,288,34,9);}
   const product=products[index], top=40+(index%2)*120;
   const data=await image(product);
   if(data) doc.addImage(data,'PNG',16,top,94,94,undefined,'FAST');
   else {doc.setDrawColor(229,215,199);doc.rect(16,top,94,94);text('Image not available',29,top+48,70,12);}
   doc.setFont('times','bold');text(product.name,118,top+14,77,17);doc.setFont('helvetica','normal');
   text(`Product: ${product.sku || product.id}`,118,top+47,77,9);
   if(showPrices) {doc.setFont('helvetica','bold');text(`INR ${price(product).toLocaleString('en-IN')} per item`,118,top+69,77,14);doc.setFont('helvetica','normal');}
  }
  return doc;
 }
 root.ProductCatalogue={roles,tags,price,date,filter,pdf};
})(globalThis);
