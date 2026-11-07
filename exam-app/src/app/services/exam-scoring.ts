import { ExamQuestion, PdfReference, StudyReference } from '../models/exam.model';

/**
 * Respuesta elegida por el usuario para una pregunta.
 *
 * `null`/`undefined` significa que la pregunta se ha dejado en blanco.
 */
export type AnswerValue = number | null | undefined;

/**
 * Mapa de respuestas indexado por `id` de pregunta.
 *
 * Se aceptan tanto `Map` como objeto plano para que el servicio de estado del
 * examen (F4.1) pueda exponer sus respuestas sin conversiones adicionales.
 */
export type AnswerMap = ReadonlyMap<number, AnswerValue> | Readonly<Record<number, AnswerValue>>;

/** Resultado de una pregunta tras la corrección. */
export type QuestionOutcome = 'correct' | 'incorrect' | 'blank' | 'annulled';

/** Corrección de una pregunta concreta. */
export interface QuestionResult {
  /** `id` de la pregunta original. */
  id: number;
  /** Posición (0-based) dentro del cuestionario. */
  index: number;
  /** Enunciado. */
  question: string;
  /** Opciones de respuesta en orden. */
  options: readonly string[];
  /** Opción marcada por el usuario, o `null` si no contestó. */
  selectedAnswer: number | null;
  /** Opción correcta, o `null` si la pregunta está anulada. */
  correctAnswer: number | null;
  /** Resultado de la corrección. */
  outcome: QuestionOutcome;
  /** Referencia al PDF de referencia (cuadernillo, dato histórico). */
  pdfReference: PdfReference;
  /** Referencia a la guía de estudio donde se explica la pregunta. */
  studyReference: StudyReference;
  /** Justificación de la respuesta correcta. */
  explanation: string;
}

/** Resumen completo de la corrección de un examen. */
export interface ExamResult {
  /** Número total de preguntas del examen (anuladas incluidas). */
  total: number;
  /** Preguntas que puntúan (total menos anuladas). */
  computable: number;
  /** Aciertos. */
  correct: number;
  /** Fallos (respuesta marcada y distinta de la correcta). */
  incorrect: number;
  /** Preguntas en blanco (sin respuesta válida). */
  blank: number;
  /** Preguntas anuladas por la plantilla oficial. */
  annulled: number;
  /** Preguntas contestadas (aciertos + fallos). */
  answered: number;
  /** Porcentaje de aciertos sobre las preguntas que puntúan (0–100, 2 decimales). */
  percentage: number;
  /** Nota sobre 10 (0–10, 2 decimales). */
  score: number;
  /** Corrección de cada pregunta, en el orden del cuestionario. */
  questions: QuestionResult[];
  /** Subconjunto de `questions` con las preguntas falladas. */
  failedQuestions: QuestionResult[];
  /** Subconjunto de `questions` con las preguntas dejadas en blanco. */
  blankQuestions: QuestionResult[];
}

/** Redondea a dos decimales evitando los errores binarios habituales. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Indica si la colección de respuestas expone `get` (es decir, es un `Map`). */
function isMap(answers: AnswerMap): answers is ReadonlyMap<number, AnswerValue> {
  return typeof (answers as ReadonlyMap<number, AnswerValue>).get === 'function';
}

/** Lee la respuesta de una pregunta, sea el mapa un `Map` o un objeto plano. */
export function readAnswer(answers: AnswerMap, questionId: number): AnswerValue {
  if (isMap(answers)) {
    return answers.get(questionId);
  }
  return answers[questionId];
}

/** Normaliza y valida la opción marcada: devuelve `null` si no es una opción real. */
function normalizeAnswer(answer: AnswerValue, options: readonly string[]): number | null {
  if (typeof answer !== 'number' || !Number.isInteger(answer)) {
    return null;
  }
  return answer >= 0 && answer < options.length ? answer : null;
}

/** `true` si la plantilla oficial anula la pregunta. */
export function isAnnulled(question: ExamQuestion): boolean {
  return question.annulled === true || question.correctAnswer === null;
}

/**
 * Corrige un examen completo.
 *
 * Reglas de puntuación:
 * - Las preguntas anuladas (`annulled`/`correctAnswer: null`) no puntúan y no
 *   cuentan ni como acierto ni como fallo.
 * - Una respuesta válida y coincidente con `correctAnswer` es un acierto.
 * - Una respuesta válida distinta de la correcta es un fallo.
 * - Sin respuesta (o con un índice fuera de rango) es una pregunta en blanco.
 * - No se aplican penalizaciones: la nota es `aciertos / preguntas que puntúan`.
 */
export function gradeExam(questions: readonly ExamQuestion[], answers: AnswerMap): ExamResult {
  const results: QuestionResult[] = questions.map((question, index) => {
    const selectedAnswer = normalizeAnswer(readAnswer(answers, question.id), question.options);
    let outcome: QuestionOutcome;
    if (isAnnulled(question)) {
      outcome = 'annulled';
    } else if (selectedAnswer === null) {
      outcome = 'blank';
    } else {
      outcome = selectedAnswer === question.correctAnswer ? 'correct' : 'incorrect';
    }

    return {
      id: question.id,
      index,
      question: question.question,
      options: question.options,
      selectedAnswer,
      correctAnswer: isAnnulled(question) ? null : question.correctAnswer,
      outcome,
      pdfReference: question.pdfReference,
      studyReference: question.studyReference,
      explanation: question.explanation,
    };
  });

  const correct = results.filter((result) => result.outcome === 'correct').length;
  const incorrect = results.filter((result) => result.outcome === 'incorrect').length;
  const blank = results.filter((result) => result.outcome === 'blank').length;
  const annulled = results.filter((result) => result.outcome === 'annulled').length;
  const computable = correct + incorrect + blank;
  const ratio = computable > 0 ? correct / computable : 0;

  return {
    total: results.length,
    computable,
    correct,
    incorrect,
    blank,
    annulled,
    answered: correct + incorrect,
    percentage: round2(ratio * 100),
    score: round2(ratio * 10),
    questions: results,
    failedQuestions: results.filter((result) => result.outcome === 'incorrect'),
    blankQuestions: results.filter((result) => result.outcome === 'blank'),
  };
}
