// Extrae la plantilla de corrección como filas de tabla usando coordenadas (x,y) de cada texto.
// Uso: node scripts/extract-pdf-rows.mjs <pdf> <salida.json>
import { readFile, writeFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const [, , input, output] = process.argv;
const data = new Uint8Array(await readFile(input));
const doc = await getDocument({ data, useSystemFonts: false }).promise;
const rows = [];

for (let n = 1; n <= doc.numPages; n++) {
  const page = await doc.getPage(n);
  const { items } = await page.getTextContent();
  const fragments = items
    .filter((item) => typeof item.str === 'string' && item.str.trim().length > 0)
    .map((item) => ({
      str: item.str.trim(),
      x: Math.round(item.transform[4] * 10) / 10,
      y: Math.round(item.transform[5] * 10) / 10,
    }));

  // Agrupa fragmentos con la misma línea base (tolerancia 2pt), de arriba a abajo.
  const lines = [];
  for (const fragment of fragments.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((candidate) => Math.abs(candidate.y - fragment.y) <= 2);
    if (line) line.fragments.push(fragment);
    else lines.push({ page: n, y: fragment.y, fragments: [fragment] });
  }
  for (const line of lines) {
    line.fragments.sort((a, b) => a.x - b.x);
    rows.push({ page: line.page, y: line.y, fragments: line.fragments });
  }
}

await writeFile(output, JSON.stringify(rows, null, 2));
console.log(`OK: ${rows.length} líneas con coordenadas -> ${output}`);
