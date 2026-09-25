// Deterministic, synthetic fixtures for local import verification; no customer data.
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
(async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Auftraege');
  sheet.addRow(['Auftrag','Aktivität','Zeitpunkt','Rolle']);
  sheet.addRow(['X-1','Start',new Date('2026-09-24T08:00:00Z'),'Produktion']);
  sheet.addRow(['X-1','Kontrolle',new Date('2026-09-24T09:00:00Z'),'Qualität']);
  await book.xlsx.writeFile(path.join(__dirname,'auftraege.xlsx'));
  const zip = new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('word/document.xml','<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Freigabe: Auftraege ueber 20000 EUR brauchen eine zweite Pruefung.</w:t></w:r></w:p></w:body></w:document>');
  fs.writeFileSync(path.join(__dirname,'freigabe.docx'),await zip.generateAsync({type:'nodebuffer'}));
  const content='BT /F1 12 Tf 50 760 Td (SOP: Qualitaetskontrolle vor Versand dokumentieren.) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  fs.writeFileSync(path.join(__dirname,'qualitaet.pdf'),pdf);
})();
