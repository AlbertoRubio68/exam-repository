// Extrae el texto por página de un PDF usando pdfjs-dist.
// Uso: node scripts/extract-pdf-pages.mjs <ruta-pdf> <ruta-salida.json>
import { readFile, writeFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('Uso: node scripts/extract-pdf-pages.mjs <pdf> <salida.json>');
  process.exit(1);
}

const data = new Uint8Array(await readFile(input));
const doc = await getDocument({ data, useSystemFonts: false }).promise;
const pages = [];

for (let n = 1; n <= doc.numPages; n++) {
  const page = await doc.getPage(n);
  const content = await page.getTextContent();
  let text = '';
  let lastY = null;
  for (const item of content.items) {
    if (typeof item.str !== 'string') continue;
    const y = item.transform ? item.transform[5] : null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) text += '\n';
    text += item.str;
    if (item.hasEOL) text += '\n';
    lastY = y;
  }
  pages.push({ page: n, text });
}

await writeFile(output, JSON.stringify({ numPages: doc.numPages, pages }, null, 2));
console.log(`OK: ${doc.numPages} páginas -> ${output}`);
