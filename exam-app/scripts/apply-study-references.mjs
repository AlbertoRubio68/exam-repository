// Aplica las referencias verificadas de la guía de estudio (GUIA_ESTUDI_AGENTRURAL.pdf)
// a `src/app/data/exam-data.json` y genera el informe de trazabilidad.
//
// Uso: node scripts/apply-study-references.mjs
//
// La fuente de verdad de la cartografía es `scripts/study-references.json`, generado a
// partir del texto extraído del PDF real (608 páginas): cada entrada guarda la página
// física, la etiqueta de tema/sección y un fragmento literal (`anchor`) de esa página.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(HERE, '..', 'src', 'app', 'data', 'exam-data.json');
const REFERENCES_PATH = join(HERE, 'study-references.json');
const REPORT_PATH = join(HERE, '..', '..', 'docs', 'estudi-referencies-guia.md');

const GUIDE_PAGES = 608;
const STUDY_PDF_URL = 'documents/guia-estudi-agentrural.pdf';

const exam = JSON.parse(await readFile(DATA_PATH, 'utf8'));
const references = JSON.parse(await readFile(REFERENCES_PATH, 'utf8'));

if (references.length !== exam.questions.length) {
  throw new Error(
    `El mapeig té ${references.length} entrades i el qüestionari ${exam.questions.length} preguntes`,
  );
}

const byId = new Map(references.map((entry) => [entry.id, entry]));
const errors = [];

for (const question of exam.questions) {
  const reference = byId.get(question.id);
  if (!reference) {
    errors.push(`Falta la referència de la pregunta ${question.id}`);
    continue;
  }
  if (!Number.isInteger(reference.page) || reference.page < 1 || reference.page > GUIDE_PAGES) {
    errors.push(`Pàgina fora de rang a la pregunta ${question.id}: ${reference.page}`);
  }
  if (!reference.label || reference.label.trim().length === 0) {
    errors.push(`Etiqueta buida a la pregunta ${question.id}`);
  }
  if (!reference.anchor || reference.anchor.trim().length === 0) {
    errors.push(`Anchor buit a la pregunta ${question.id}`);
  }
  question.studyReference = {
    page: reference.page,
    label: reference.label,
    anchor: reference.anchor,
    ...(reference.needsReview ? { needsReview: true } : {}),
  };
}

const orphans = references.filter((entry) => !exam.questions.some((q) => q.id === entry.id));
for (const orphan of orphans) {
  errors.push(`Referència sense pregunta: ${orphan.id}`);
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

exam.studyPdfUrl = STUDY_PDF_URL;

await writeFile(DATA_PATH, `${JSON.stringify(exam, null, 2)}\n`, 'utf8');

const rows = exam.questions.map((question) => {
  const reference = question.studyReference;
  const review = reference.needsReview ? 'sí' : 'no';
  const anchor = reference.anchor.replace(/\|/g, '\\|');
  const evidence = byId.get(question.id).evidence.replace(/\|/g, '\\|');
  return `| ${question.id} | ${reference.page} | ${reference.label.replace(/\|/g, '\\|')} | ${anchor} | ${byId.get(question.id).method} | ${evidence} | ${review} |`;
});

const reviewCount = exam.questions.filter((q) => q.studyReference.needsReview).length;

const report = `# Referències de les preguntes a la guia d’estudi

Informe de traçabilitat de la cartografia entre les ${exam.questions.length} preguntes del
qüestionari (Model A, convocatòria 01/23) i el PDF **GUIA_ESTUDI_AGENTRURAL.pdf** (608 pàgines).

- **Document**: \`exam-app/public/${STUDY_PDF_URL}\` (còpia exacta del PDF oficial proporcionat).
- **Pàgines**: número físic 1-based del PDF (la guia té 608 pàgines; la coberta és la 1).
- **Etiqueta**: tema i apartat extrets de l’índex de la guia (pàg. 5-8 de l’índex imprès).
- **Anchor**: fragment literal de la pàgina indicada, verificat sobre el text extret del PDF.
- **Mètode**: \`law+article\` (norma i article citats), \`law+term\`, \`term\`, \`concept\`,
  \`section\`, \`list\` (llistats i taules) i \`exclusion\` (resposta per descart).
- **needsReview**: ${reviewCount} referències marcades com a aproximades; la resta són exactes
  respecte del text de la guia.

## Resum

| Concepte | Valor |
| --- | --- |
| Preguntes | ${exam.questions.length} |
| Referències presents | ${exam.questions.filter((q) => q.studyReference).length} |
| Pàgines dins de 1..${GUIDE_PAGES} | ${exam.questions.filter((q) => q.studyReference.page >= 1 && q.studyReference.page <= GUIDE_PAGES).length} |
| Referències aproximades (needsReview) | ${reviewCount} |
| Preguntes anul·lades | ${exam.questions.filter((q) => q.annulled).length} |

## Detall per pregunta

| # | Pàgina guia | Tema / apartat | Anchor verificat | Mètode | Evidència | needsReview |
| --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

## Notes

- \`pdfReference\` (pàgina del quadern del qüestionari) es conserva com a dada històrica i
  **no** s’utilitza per al botó «Veure a la guia».
- Les preguntes anul·lades per la plantilla oficial (19, 26, 39, 46 i 56) també tenen
  referència de guia, però no puntuen.
- Les referències \`needsReview\` corresponen a preguntes en què la guia no reproduïx
  literalment el llistat o la dada de la resposta (per exemple, el catàleg de flora o el
  catàleg d’espècies exòtiques, que ocupen diverses pàgines).
`;

await writeFile(REPORT_PATH, report, 'utf8');
console.log(
  `OK: ${exam.questions.length} referències aplicades (${reviewCount} needsReview) -> ${DATA_PATH}`,
);
console.log(`Informe: ${REPORT_PATH}`);
