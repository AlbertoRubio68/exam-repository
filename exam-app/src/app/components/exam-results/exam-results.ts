import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ExamQuestion, PdfReference } from '../../models/exam.model';
import {
  AnswerMap,
  ExamResult,
  QuestionOutcome,
  QuestionResult,
  gradeExam,
} from '../../services/exam-scoring';
import { PdfNavigationService, buildPdfPageLink } from '../../services/pdf-navigation.service';
import { optionLetter } from '../../utils/option-letter';

/** Filtros disponibles en la lista de revisión. */
type ResultFilter = QuestionOutcome | 'all';

/** Opción del selector de filtros. */
interface FilterOption {
  value: ResultFilter;
  label: string;
  count: number;
}

/** Número formateado en catalán (coma decimal) con dos decimales. */
function formatNumber(value: number): string {
  return new Intl.NumberFormat('ca-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Panel de revisión del examen (F4.2).
 *
 * Muestra el resumen de la corrección (aciertos, fallos, preguntas en blanco y
 * anuladas) y la lista de preguntas con la respuesta marcada, la correcta y su
 * justificación. Al pulsar una pregunta se solicita el salto a la página del
 * PDF de referencia a través de `PdfNavigationService`; si el visor PDF (F3)
 * todavía no está conectado, se abre el documento en una pestaña nueva en la
 * página indicada.
 */
@Component({
  selector: 'app-exam-results',
  templateUrl: './exam-results.html',
  styleUrl: './exam-results.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamResults {
  /** Preguntas del examen, en orden. */
  readonly questions = input.required<readonly ExamQuestion[]>();

  /** Respuestas del usuario indexadas por `id` de pregunta. */
  readonly answers = input.required<AnswerMap>();

  /** URL del PDF de referencia (para el enlace directo de reserva). */
  readonly pdfUrl = input.required<string>();

  /** Emite cuando el usuario quiere repetir el examen. */
  readonly retry = output<void>();

  /** Emite la referencia del PDF cada vez que se pide un salto de página. */
  readonly referenceJumped = output<PdfReference>();

  private readonly pdfNavigation = inject(PdfNavigationService);
  private readonly document = inject(DOCUMENT);

  /** Corrección completa del examen. */
  readonly result = computed<ExamResult>(() => gradeExam(this.questions(), this.answers()));

  /** Filtro activo de la lista. */
  readonly filter = signal<ResultFilter>('all');

  /** Filtros con el número de preguntas de cada tipo. */
  readonly filters = computed<FilterOption[]>(() => {
    const result = this.result();
    return [
      { value: 'all', label: 'Totes', count: result.total },
      { value: 'incorrect', label: 'Fallades', count: result.incorrect },
      { value: 'correct', label: 'Correctes', count: result.correct },
      { value: 'blank', label: 'En blanc', count: result.blank },
      { value: 'annulled', label: 'Anul·lades', count: result.annulled },
    ];
  });

  /** Preguntas visibles según el filtro activo. */
  readonly visibleQuestions = computed<QuestionResult[]>(() => {
    const filter = this.filter();
    const questions = this.result().questions;
    return filter === 'all' ? questions : questions.filter((item) => item.outcome === filter);
  });

  /** Nota sobre 10 formateada. */
  readonly scoreLabel = computed(() => formatNumber(this.result().score));

  /** Porcentaje de aciertos formateado. */
  readonly percentageLabel = computed(() => `${formatNumber(this.result().percentage)} %`);

  /** Letra de una opción (A, B, C...). */
  readonly optionLetter = optionLetter;

  /** Texto legible del resultado de una pregunta. */
  outcomeLabel(outcome: QuestionOutcome): string {
    switch (outcome) {
      case 'correct':
        return 'Correcta';
      case 'incorrect':
        return 'Fallada';
      case 'blank':
        return 'En blanc';
      case 'annulled':
        return 'Anul·lada';
    }
  }

  /** Clases Tailwind de la etiqueta de resultado. */
  outcomeClasses(outcome: QuestionOutcome): string {
    switch (outcome) {
      case 'correct':
        return 'bg-emerald-100 text-emerald-800';
      case 'incorrect':
        return 'bg-rose-100 text-rose-800';
      case 'blank':
        return 'bg-amber-100 text-amber-800';
      case 'annulled':
        return 'bg-slate-200 text-slate-700';
    }
  }

  /** Texto de la opción marcada por el usuario, o `null` si no contestó. */
  selectedText(item: QuestionResult): string | null {
    if (item.selectedAnswer === null) {
      return null;
    }
    return `${optionLetter(item.selectedAnswer)}) ${item.options[item.selectedAnswer]}`;
  }

  /** Texto de la opción correcta, o `null` si la pregunta está anulada. */
  correctText(item: QuestionResult): string | null {
    if (item.correctAnswer === null) {
      return null;
    }
    return `${optionLetter(item.correctAnswer)}) ${item.options[item.correctAnswer]}`;
  }

  /** Enlace directo al PDF en la página de la pregunta. */
  referenceLink(item: QuestionResult): string {
    return buildPdfPageLink(this.pdfUrl(), item.pdfReference.page);
  }

  /**
   * Salta a la página del PDF de la pregunta.
   *
   * Con el visor conectado el salto es interno; sin visor se abre el PDF en una
   * pestaña nueva. En ambos casos se cancela la navegación del enlace cuando
   * procede para no duplicar la acción.
   */
  openReference(item: QuestionResult, event?: Event): void {
    event?.preventDefault();
    this.referenceJumped.emit(item.pdfReference);
    this.pdfNavigation.goToPage(item.pdfReference.page);
    if (!this.pdfNavigation.hasViewer) {
      this.document.defaultView?.open(this.referenceLink(item), '_blank', 'noopener');
    }
  }
}
