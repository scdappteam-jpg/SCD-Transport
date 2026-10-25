function render(bill,job,customer,{escapeHtml,formatBangkok}) {
    return `<!doctype html>\n<html lang="th">\n<head>\n  <meta charset="utf-8">\n  <title>${escapeHtml(bill.id)}</title>\n  <style>\n    body { font-family: Arial, sans-serif; margin: 40px; color: #17201d; }\n    h1 { color: #0f766e; margin-bottom: 4px; }\n    .meta, table { width: 100%; margin-top: 24px; }\n    .meta td { padding: 4px 0; }\n    table { border-collapse: collapse; }\n    th, td { border: 1px solid #dfe5df; padding: 10px; text-align: left; }\n    th { background: #eef8f6; }\n    .customer-address { white-space: pre-wrap; overflow-wrap: anywhere; }\n    .total { text-align: right; font-size: 20px; font-weight: 700; }\n  </style>\n</head>\n<body>\n  <h1>Invoice</h1>\n  <strong>${escapeHtml(bill.id)}</strong>\n  <table class="meta">\n    <tr><td>Customer</td><td>${escapeHtml(customer?.name || job.customerName)}</td></tr>\n    <tr><td>Address</td><td class="customer-address">${escapeHtml(customer?.address || "-")}</td></tr>\n    <tr><td>Tax ID</td><td>${escapeHtml(customer?.taxId || "-")}</td></tr>\n    <tr><td>Billing Email</td><td>${escapeHtml(bill.billingEmail || "-")}</td></tr>\n    <tr><td>House Number</td><td>${escapeHtml(job.houseNumber)}</td></tr>\n    <tr><td>Flight</td><td>${escapeHtml(job.flightNo)} / ${escapeHtml(formatBangkok(job.flightTime))}</td></tr>\n    <tr><td>Due Date</td><td>${escapeHtml(formatBangkok(bill.dueDate))}</td></tr>\n  </table>\n  <table>\n    <thead><tr><th>Description</th><th>Amount</th></tr></thead>\n    <tbody>\n      <tr><td>Air export logistics service - ${escapeHtml(job.houseNumber)}</td><td>${Number(bill.amount).toLocaleString("th-TH")} THB</td></tr>\n    </tbody>\n  </table>\n  <p class="total">Total: ${Number(bill.amount).toLocaleString("th-TH")} THB</p>\n</body>\n</html>`;
}
function refreshPlan(db,actor,payload) {
 const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
 if(!['Admin','Executive','Billing'].includes(actor?.role))fail('ไม่มีสิทธิ์อัปเดตเอกสาร Invoice',403);
 const bill=(db.billing||[]).find(b=>b.id===payload.invoiceId);if(!bill)fail('Invoice not found',404);
 if(bill.status!=='Draft'||bill.houseNumbers?.length)fail('อัปเดตได้เฉพาะ Draft Invoice ราย House เท่านั้น');
 if(!payload.houseNumber||bill.houseNumber!==payload.houseNumber)fail('House ไม่ตรงกับ Invoice');
 const job=(db.jobs||[]).find(j=>j.houseNumber===bill.houseNumber&&j.invoiceId===bill.id);if(!job)fail('Invoice ไม่ตรงกับงาน');
 const customer=(db.customers||[]).find(c=>c.id===bill.customerId&&c.id===job.customerId);if(!customer?.address?.trim())fail('ยังไม่มีที่อยู่ออกบิล',422);
 if(!/^INV-[A-Za-z0-9-]+$/.test(bill.id)||bill.pdfUrl!==`/storage/invoices/${bill.id}.html`)fail('Unsupported invoice document path');
 return {bill,job,customer};
}
function register(db,bill,job,htmlContent) {
 const fileId=`INVOICE-DOC-${bill.id}`;
 let file=(db.attachments||=[]).find(f=>f.fileId===fileId);
 if(!file){file={fileId,houseNumber:job.houseNumber,fileType:'InvoiceDocument',url:`/storage/invoices/${bill.id}.html`,mimeType:'text/html; charset=utf-8',createdAt:bill.draftedAt};db.attachments.push(file);}
 // Generated HTML stays in the existing shared-state store. Evidence buckets
 // may restrict MIME types to images/PDF; do not mislabel HTML or weaken that policy.
 file.htmlContent=htmlContent;
 return file;
}
function savedHtml(db,pathname){
 const file=(db.attachments||[]).find(f=>f.url===pathname&&f.fileType==='InvoiceDocument');
 if(!file||typeof file.htmlContent!=='string')return null;
 const bill=(db.billing||[]).find(b=>b.pdfUrl===pathname&&file.fileId===`INVOICE-DOC-${b.id}`&&file.houseNumber===b.houseNumber);
 return bill?file.htmlContent:null;
}
module.exports={render,refreshPlan,register,savedHtml};
