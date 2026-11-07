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

/**
 * Referencia a la página de la guía de estudio (`GUIA_ESTUDI_AGENTRURAL.pdf`) donde se
 * explica el contenido de la pregunta y su respuesta correcta.
 *
 * Es independiente de `ExamQuestion.pdfReference`, que se conserva como dato histórico
 * del cuadernillo del cuestionario y no se usa para el botón «Veure a la guia».
 */
export interface StudyReference {
  /** Página física (1-based) del PDF de la guía de estudio. */
  page: number;
  /** Tema / sección / título legible de la guía. */
  label: string;
  /** Texto de anclaje verificado en la guía, para trazabilidad. */
  anchor?: string;
  /** `true` cuando la asignación de página es aproximada y requiere revisión humana. */
  needsReview?: boolean;
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
  /** Página del PDF donde se encuentra la pregunta (dato histórico del cuadernillo). */
  pdfReference: PdfReference;
  /** Página de la guía de estudio donde se explica la pregunta y su respuesta correcta. */
  studyReference: StudyReference;
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
  /** URL del PDF de la guía de estudio (servido desde `public/`). */
  studyPdfUrl: string;
  /** Preguntas del examen en orden. */
  questions: ExamQuestion[];
}
