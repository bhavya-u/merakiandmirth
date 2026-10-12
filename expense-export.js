// Device-side workbook generation; never sends claim data to another service.
(function(root) {
 function buildWorkbook(ExcelJS, claims, {from='',to='',generatedAt=new Date().toISOString()}={}) {
  const workbook=new ExcelJS.Workbook();workbook.creator='Meraki & Mirth';
  const summary=workbook.addWorksheet('Settlement summary'), detail=workbook.addWorksheet('Claims');
  const scope=`Claim dates (India): ${from||'Beginning'} to ${to||'All dates'}`;
  summary.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
  summary.addRow(['Expense settlement · INR']);summary.addRow([scope]);summary.addRow([`Generated: ${generatedAt}`]);
  summary.addRow(['Claimant','Pending approval','Ready to settle','Settled','Rejected']);
  const people=new Map();
  for(const c of claims) {const key=c.submitted_by_id;const p=people.get(key)||{name:c.submitted_by_name,sums:[0,0,0,0]};const bucket=c.approval_status==='rejected'?3:c.settled_at?2:c.approval_status==='approved'?1:0;p.sums[bucket]+=Math.round(Number(c.amount)*100);people.set(key,p);}
  for(const p of people.values())summary.addRow([p.name,...p.sums.map(v=>v/100)]);
  const end=summary.rowCount;
  summary.addRow(['TOTAL',...[2,3,4,5].map((col,index)=>end<5?0:({formula:`SUM(${String.fromCharCode(64+col)}5:${String.fromCharCode(64+col)}${end})`,result:[...people.values()].reduce((n,p)=>n+p.sums[index],0)/100}))]);
  detail.addRow(['Claim ID','Claim date (India)','Claimant','Description','Type','Vendor / provider','Original amount (INR)','Extra amount (INR)','Total (INR)','Status','Adjustment reason','Note','Reviewed by','Reviewed at','Settled by','Settled at']);
  const date=value=>value?new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'';
  for(const c of claims)detail.addRow([c.id,date(c.created_at),c.submitted_by_name,c.description,c.expense_type,c.vendor||c.delivery_provider||c.delivery_mode||'',(Math.round(Number(c.amount)*100)-Math.round(Number(c.extra_amount||0)*100))/100,Number(c.extra_amount||0),Number(c.amount),c.approval_status==='rejected'?'Rejected':c.settled_at?'Settled':c.approval_status==='approved'?'Ready to settle':'Pending approval',c.adjustment_reason||'',c.note||'',c.approved_by_name||'',date(c.approved_at),c.settled_by_name||'',date(c.settled_at)]);
  for(const [sheet,header,widths] of [[summary,4,[28,22,22,22,22]],[detail,1,[38,24,22,48,16,26,22,22,22,22,42,42,22,24,22,24]]]){
   widths.forEach((width,i)=>sheet.getColumn(i+1).width=width);sheet.views=[{state:'frozen',ySplit:header}];sheet.autoFilter={from:{row:header,column:1},to:{row:sheet===summary?end:sheet.rowCount,column:widths.length}};
   sheet.eachRow((row,num)=>{row.alignment={vertical:'top',wrapText:true};row.font={name:'Calibri',size:11};row.height=Math.max(32,Math.min(180,18*Math.max(...widths.map((width,i)=>Math.ceil(String(row.getCell(i+1).value??'').length/Math.max(1,width-2))))));if(num===header){row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF183B34'}};row.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}};}});
  }
  for(let c=2;c<=5;c++)summary.getColumn(c).numFmt='#,##0.00;[Red](#,##0.00);"—"';
  for(let c=7;c<=9;c++)detail.getColumn(c).numFmt='#,##0.00;[Red](#,##0.00);"—"';
  summary.getRow(1).font={name:'Calibri',size:17,bold:true,color:{argb:'FF183B34'}};summary.mergeCells('A1:E1');summary.mergeCells('A2:E2');summary.mergeCells('A3:E3');summary.getRow(summary.rowCount).font={bold:true,name:'Calibri',size:11};
  return workbook;
 }
 root.ExpenseExport={buildWorkbook};
})(globalThis);
