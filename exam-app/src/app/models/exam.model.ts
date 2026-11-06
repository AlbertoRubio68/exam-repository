/**
 * Modelo de datos de un examen interactivo.
 *
 * Esquema acordado en `docs/specs/exam_app_architecture_spec.md` (§3.2). El fichero JSON de
 * configuración (`src/app/data/exam-data.json`) debe cumplir la interfaz `ExamConfig`.
 */

/** Referencia a la página del PDF de referencia asociada a una pregunta. */
export interface PdfReference {
  /** Número de página del PDF (1-based). */
  page: number;
  /** Etiqueta legible de la referencia, para mostrar en la interfaz. */
  label: string;
}

/** Pregunta de tipo test con una única respuesta correcta. */
export interface ExamQuestion {
  /** Identificador de la pregunta. Único dentro del examen. */
  id: number;
  /** Enunciado de la pregunta. */
  question: string;
  /** Opciones de respuesta en orden (A, B, C, D...). */
  options: string[];
  /**
   * Índice (0-based) de la opción correcta dentro de `options`.
   * Es `null` cuando la pregunta fue anulada por la plantilla oficial y, por tanto, no puntúa.
   */
  correctAnswer: number | null;
  /** Página del PDF donde se encuentra la pregunta. */
  pdfReference: PdfReference;
  /** Justificación o nota asociada a la respuesta correcta. */
  explanation: string;
  /** `true` si la plantilla oficial de corrección anula la pregunta (no puntúa). */
  annulled?: boolean;
}

/** Configuración completa de un examen. */
export interface ExamConfig {
  /** Identificador del examen. */
  examId: string;
  /** Título mostrado al usuario. */
  title: string;
  /** URL del PDF de referencia (servido desde `public/`). */
  pdfUrl: string;
  /** Preguntas del examen en orden. */
  questions: ExamQuestion[];
}
