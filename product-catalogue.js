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
 const palette={ink:[24,59,52],gold:[157,108,61],muted:[110,104,95],paper:[251,247,240],line:[226,215,199]};
 const safe=value=>String(value||'').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-');
 function text(doc,value,x,y,width,{size=12,font='helvetica',style='normal',color=palette.ink,maxLines=4}={}) {
  doc.setFont(font,style);doc.setTextColor(...color);doc.setFontSize(size);
  let lines=doc.splitTextToSize(safe(value),width);
  while(lines.length>maxLines&&size>10){size-=.5;doc.setFontSize(size);lines=doc.splitTextToSize(safe(value),width);}
  if(lines.length>maxLines)throw Error('A catalogue title is too long. Shorten it before exporting.');
  doc.text(lines,x,y,{lineHeightFactor:1.2});return y+lines.length*size*.3528*1.2;
 }
 function frame(doc,{title,client='',page,pages,logo}) {
  doc.setFillColor(...palette.paper);doc.rect(0,0,210,297,'F');
  if(logo)doc.addImage(logo,'JPEG',16,12,22,22,undefined,'FAST');
  text(doc,'MERAKI & MIRTH',logo?44:16,19,145,{size:8,style:'bold',color:palette.gold});
  text(doc,title,logo?44:16,30,148,{size:24,font:'times',maxLines:1});
  text(doc,client?`Thoughtfully selected for ${client}`:'Thoughtful gifts. Beautiful celebrations.',16,44,178,{size:10,font:'times',style:'italic',color:palette.muted,maxLines:2});
  doc.setDrawColor(...palette.line);doc.setLineWidth(.3);doc.line(16,53,194,53);doc.line(16,277,194,277);
  text(doc,'For the moments worth thanking.',16,285,130,{font:'times',style:'italic',size:10,color:palette.muted});
  text(doc,`${String(page).padStart(2,'0')} / ${String(pages).padStart(2,'0')}`,177,285,20,{size:8,color:palette.gold});
 }
 function reference(product,index) { const sku=String(product.sku||'');return /^[a-z0-9_-]{1,18}$/i.test(sku)?sku.toUpperCase():`GIFT ${String(index+1).padStart(2,'0')}`; }
 async function pdf({jsPDF,products,showPrices,client='',image,logo=null}) {
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true});
  for(let index=0;index<products.length;index++) {
   if(index&&index%2===0)doc.addPage();
   if(index%2===0)frame(doc,{title:'The Gift Edit',client,page:Math.floor(index/2)+1,pages:Math.ceil(products.length/2),logo});
   const product=products[index],top=62+(index%2)*105;
   doc.setFillColor(255,255,255);doc.roundedRect(16,top,178,97,2,2,'F');
   const data=await image(product);
   if(data)doc.addImage(data,'PNG',20,top+4,89,89,undefined,'FAST');
   else text(doc,'Photograph coming soon',28,top+48,75,{size:11,font:'times',style:'italic',color:palette.muted});
   text(doc,reference(product,index),117,top+15,69,{size:8,style:'bold',color:palette.gold});
   const end=text(doc,product.name,117,top+28,69,{size:20,font:'times',maxLines:5});
   if(showPrices){doc.setDrawColor(...palette.line);doc.line(117,end+5,186,end+5);text(doc,`INR ${price(product).toLocaleString('en-IN')}`,117,end+15,69,{size:16,font:'times'});text(doc,'PER PIECE',117,end+22,69,{size:7,style:'bold',color:palette.muted});}
  }
  return doc;
 }
 root.ProductCatalogue={roles,tags,price,date,filter,pdf,frame,text,reference,palette};
})(globalThis);
