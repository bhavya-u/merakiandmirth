import test from 'node:test';import assert from 'node:assert/strict';import ExcelJS from 'exceljs';import '../expense-export.js';
const row=(id,name,amount,status='pending',extra=0)=>({id,submitted_by_id:name,submitted_by_name:name,description:'=HYPERLINK("bad")',expense_type:'purchase',amount,extra_amount:extra,approval_status:status,created_at:'2026-10-11T10:00:00Z'});
test('Excel summary reconciles amounts and keeps rejected/settled separate',async()=>{
 const claims=[row('1','A',12.34,'pending',2.34),row('2','A',20,'approved'),{...row('3','B',30,'approved'),settled_at:'2026-10-11'},row('4','B',40,'rejected')];
 const wb=ExpenseExport.buildWorkbook(ExcelJS,claims);const bytes=await wb.xlsx.writeBuffer();const copy=new ExcelJS.Workbook();await copy.xlsx.load(bytes);
 const s=copy.getWorksheet('Settlement summary'),d=copy.getWorksheet('Claims');assert.equal(d.rowCount,5);assert.equal(d.getCell('G2').value,10);assert.equal(d.getCell('H2').value,2.34);assert.equal(d.getCell('D2').value,claims[0].description);assert.equal(d.getCell('D2').type,ExcelJS.ValueType.String);
 assert.deepEqual([2,3,4,5].map(c=>s.getRow(7).getCell(c).value.result),[12.34,20,30,40]);
});
test('Excel supports empty and paginated-size snapshots without dropping claims',async()=>{
 for(const count of [0,61,501]){const rows=Array.from({length:count},(_,i)=>row(String(i),'Same',.01));const wb=ExpenseExport.buildWorkbook(ExcelJS,rows);assert.equal(wb.getWorksheet('Claims').rowCount,count+1);const s=wb.getWorksheet('Settlement summary');assert.equal(count?s.getRow(s.rowCount).getCell(2).value.result:s.getRow(s.rowCount).getCell(2).value,count/100);await wb.xlsx.writeBuffer();}
});
