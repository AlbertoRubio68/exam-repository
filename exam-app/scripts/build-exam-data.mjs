// Genera src/app/data/exam-data.json a partir del texto extraído (pdfjs-dist) del:
//  - Annex-1.-Queestionari-de-coneixements-model-A.pdf  (enunciados y opciones)
//  - Annex-1.Plantilles-correccio_modificades.pdf       (plantilla oficial, columna Model A)
//
// Uso: node scripts/build-exam-data.mjs <questions.json> <corrections.json> <salida.json>
import { readFile, writeFile } from 'node:fs/promises';

const [, , questionsPath, correctionsPath, outPath] = process.argv;
if (!questionsPath || !correctionsPath || !outPath) {
  console.error('Uso: node scripts/build-exam-data.mjs <questions.json> <corrections.json> <salida.json>');
  process.exit(1);
}

const LETTERS = ['A', 'B', 'C', 'D'];
const QUESTION_START = /^(\d{1,2})\.\s+(.*)$/;
const OPTION_START = /^([A-D])\.\s+(.*)$/;
const PAGE_HEADER = /^\d{1,2}\/\d{1,2}$/;

/** Convierte el texto de una página en líneas limpias (sin cabecera de página ni líneas vacías). */
function pageLines(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !PAGE_HEADER.test(line));
}

/** Extrae los enunciados del cuestionario: [{ id, page, question, options }]. */
function parseQuestions(pagesDoc) {
  const questions = [];
  let current = null;
  let currentOption = null;

  for (const { page, text } of pagesDoc.pages) {
    for (const line of pageLines(text)) {
      const questionMatch = line.match(QUESTION_START);
      const optionMatch = line.match(OPTION_START);

      if (questionMatch) {
        current = { id: Number(questionMatch[1]), page, question: questionMatch[2].trim(), options: [] };
        currentOption = null;
        questions.push(current);
      } else if (optionMatch && current) {
        currentOption = { letter: optionMatch[1], text: optionMatch[2].trim() };
        current.options.push(currentOption);
      } else if (currentOption) {
        currentOption.text += ' ' + line;
      } else if (current) {
        current.question += ' ' + line;
      }
      // Líneas previas a la primera pregunta (títulos) se ignoran.
    }
  }

  return questions;
}

/**
 * Extrae la columna Model A de la plantilla de corrección a partir de las filas con coordenadas:
 * la tabla tiene dos bloques (Model A: número x≈90 / respuesta x≈294; Model B: x≈592 / x≈799).
 * @returns Map<number, 'A'|'B'|'C'|'D'|'ANUL·LADA'>
 */
function parseCorrections(rowList) {
  const COL_A_NUMBER_MAX = 150;
  const COL_A_ANSWER_MAX = 500;

  const rowsA = rowList.map((row) => {
    const numberFragment = row.fragments.find((fragment) => fragment.x < COL_A_NUMBER_MAX);
    const answerText = row.fragments
      .filter((fragment) => fragment.x >= COL_A_NUMBER_MAX && fragment.x < COL_A_ANSWER_MAX)
      .map((fragment) => fragment.str)
      .join(' ');
    return { page: row.page, y: row.y, number: numberFragment ? Number(numberFragment.str) : null, answerText };
  });

  // Filas con la nota "CANVI DE RESPOSTA CORRECTA...", que ocupa varias líneas y puede quedar
  // partida respecto a la fila donde aparece el número de la pregunta.
  const annotationRows = rowsA.filter((row) =>
    /ÉS LA [A-D]\)/i.test(row.answerText) || /^CANVI DE RESPOSTA CORRECTA/i.test(row.answerText),
  );

  const answers = new Map();
  for (const row of rowsA) {
    if (row.number === null || Number.isNaN(row.number)) continue;
    const annotation = annotationRows.find(
      (candidate) => candidate.page === row.page && Math.abs(candidate.y - row.y) <= 10,
    );

    if (annotation) {
      const match = annotationRows
        .filter((candidate) => candidate.page === row.page && Math.abs(candidate.y - row.y) <= 10)
        .map((candidate) => candidate.answerText.match(/ÉS LA ([A-D])\)/i))
        .find(Boolean);
      if (!match) throw new Error(`Pregunta ${row.number}: nota de canvi de resposta sense lletra`);
      answers.set(row.number, match[1].toUpperCase());
      continue;
    }

    if (/ANUL·LADA/i.test(row.answerText)) answers.set(row.number, 'ANUL·LADA');
    else if (/^[A-D]$/.test(row.answerText)) answers.set(row.number, row.answerText);
  }
  return answers;
}

const questionsDoc = JSON.parse(await readFile(questionsPath, 'utf8'));
const correctionsRows = JSON.parse(await readFile(correctionsPath, 'utf8'));

const parsed = parseQuestions(questionsDoc);

// El cuadernillo incluye, tras el 1r exercici, un test aptitudinal que reinicia la numeración.
// Solo nos interesa el qüestionari de coneixements: 1..80 (el último número antes del reinicio).
const knowledge = [];
for (const question of parsed) {
  const expected = knowledge.length + 1;
  if (question.id !== expected) break;
  knowledge.push(question);
}

const errors = [];
if (knowledge.length !== 80) errors.push(`Se esperaban 80 preguntas de conocimientos, obtenidas ${knowledge.length}`);
for (const question of knowledge) {
  if (question.options.length !== 4) errors.push(`Pregunta ${question.id}: ${question.options.length} opciones`);
  if (question.options.some((option) => option.text.length === 0)) errors.push(`Pregunta ${question.id}: opción vacía`);
  const letters = question.options.map((option) => option.letter).join('');
  if (letters !== 'ABCD') errors.push(`Pregunta ${question.id}: letras de opción '${letters}'`);
}

const answers = parseCorrections(correctionsRows);
for (const question of knowledge) {
  if (!answers.has(question.id)) errors.push(`Pregunta ${question.id}: sin respuesta en la plantilla oficial`);
}

if (errors.length > 0) {
  console.error('ERRORES DE EXTRACCIÓN:\n- ' + errors.join('\n- '));
  process.exit(1);
}

const SPECIAL_NOTES = {
  21: 'La plantilla oficial de correcció indica un canvi de resposta: la resposta correcta és la B, no la D.',
};

const exam = {
  examId: 'agents-rurals-01-23-model-a',
  title: "Accés a l'escala bàsica del Cos d'Agents Rurals (01/23) — Qüestionari de coneixements, Model A",
  pdfUrl: '/documents/questionari-coneixements-model-a.pdf',
  questions: knowledge.map((question) => {
    const answer = answers.get(question.id);
    const annulled = answer === 'ANUL·LADA';
    return {
      id: question.id,
      question: question.question,
      options: question.options.map((option) => option.text),
      correctAnswer: annulled ? null : LETTERS.indexOf(answer),
      pdfReference: {
        page: question.page,
        label: `Qüestionari Model A · pregunta ${question.id} · pàgina ${question.page}`,
      },
      explanation: annulled
        ? 'Pregunta anul·lada per la plantilla oficial de correcció (Model A, convocatòria 01/23): no puntua.'
        : (SPECIAL_NOTES[question.id] ??
          'Resposta correcta segons la plantilla oficial de correcció (Model A, convocatòria 01/23).'),
      ...(annulled ? { annulled: true } : {}),
    };
  }),
};

await writeFile(outPath, JSON.stringify(exam, null, 2) + '\n');
console.log(
  `OK: ${exam.questions.length} preguntas (${exam.questions.filter((q) => q.annulled).length} anuladas) -> ${outPath}`,
);
