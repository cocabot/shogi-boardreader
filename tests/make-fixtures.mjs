import {writeFile} from 'node:fs/promises';
// Original synthetic fixture: Japanese CID text (unembedded HeiseiMin-W3), Latin
// standard font text, and board lines. No publisher content is redistributed.
const text = [...'将棋歩飛角王銀金'].map(c=>c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
const stream = `BT /F1 24 Tf 24 410 Td <${text}> Tj ET\nBT /F2 16 Tf 24 370 Td (Shogi BoardReader) Tj ET\n0.5 w 24 24 288 288 re S\n`;
const objects = [
'<< /Type /Catalog /Pages 2 0 R >>',
'<< /Type /Pages /Kids [3 0 R 9 0 R] /Count 2 >>',
'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 480] /Resources << /Font << /F1 4 0 R /F2 7 0 R >> >> /Contents 8 0 R >>',
'<< /Type /Font /Subtype /Type0 /BaseFont /HeiseiMin-W3 /Encoding /UniJIS-UCS2-H /DescendantFonts [5 0 R] >>',
'<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HeiseiMin-W3 /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 5 >> /FontDescriptor 6 0 R /DW 1000 >>',
'<< /Type /FontDescriptor /FontName /HeiseiMin-W3 /Flags 6 /FontBBox [-123 -257 1001 910] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 880 /StemV 80 >>',
'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
`<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 480] /Resources << /Font << /F1 4 0 R /F2 7 0 R >> >> /Contents 8 0 R >>',
];
let pdf='%PDF-1.7\n';const offsets=[0];
objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
const start=pdf.length;
pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
await writeFile(new URL('fixtures/japanese-cid.pdf',import.meta.url),pdf);
// Short real Shift-JIS record, encoded explicitly to keep generation dependency-free.
const sjis = Buffer.from([0x8e,0xe8,0x8d,0x87,0x8a,0x84,0x81,0x46,0x95,0xbd,0x8e,0xe8,0x0a,
 0x31,0x20,0x82,0x56,0x98,0x5a,0x95,0xe0,0x28,0x37,0x37,0x29,0x0a]);
await writeFile(new URL('fixtures/shift-jis.kif',import.meta.url),sjis);
