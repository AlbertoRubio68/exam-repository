import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import examData from '../../data/exam-data.json';
import { ExamConfig, ExamQuestion } from '../../models/exam.model';
import { PdfNavigationService, buildPdfPageLink } from '../../services/pdf-navigation.service';
import { optionLetter } from '../../utils/option-letter';
import { ExamResults } from '../exam-results/exam-results';

/**
 * Pantalla del examen (F4.2): presentación de la pregunta actual, selección de
 * respuestas y botón "Comprovar resultats".
 *
 * Al comprobar se sustituye el cuestionario por el panel de revisión
 * (`ExamResults`). El estado de respuestas vive en este componente; el cálculo
 * de la nota y la revisión son responsabilidad de `gradeExam` y `ExamResults`.
 */
@Component({
  selector: 'app-exam-runner',
  imports: [ExamResults],
  templateUrl: './exam-runner.html',
  styleUrl: './exam-runner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamRunner {
  private readonly pdfNavigation = inject(PdfNavigationService);
  private readonly document = inject(DOCUMENT);

  /** Configuración del examen cargada desde `exam-data.json`. */
  readonly exam = examData as unknown as ExamConfig;

  /** Preguntas del examen en orden. */
  readonly questions: readonly ExamQuestion[] = this.exam.questions;

  /** Título del examen. */
  readonly title = this.exam.title;

  /** URL del PDF de referencia. */
  readonly pdfUrl = this.exam.pdfUrl;

  /** Índice (0-based) de la pregunta visible. */
  readonly index = signal(0);

  /** Respuestas del usuario (id de pregunta → índice de la opción). */
  readonly answers = signal<ReadonlyMap<number, number>>(new Map());

  /** `true` cuando se ha pulsado "Comprovar resultats". */
  readonly checked = signal(false);

  /** Pregunta visible. */
  readonly current = computed<ExamQuestion>(() => this.questions[this.index()]);

  /** Número total de preguntas. */
  readonly total = computed(() => this.questions.length);

  /** Número de preguntas contestadas. */
  readonly answeredCount = computed(() => this.answers().size);

  /** `true` si la pregunta visible es la primera. */
  readonly isFirst = computed(() => this.index() <= 0);

  /** `true` si la pregunta visible es la última. */
  readonly isLast = computed(() => this.index() >= this.total() - 1);

  /** Porcentaje de avance dentro del cuestionario. */
  readonly progress = computed(() => {
    const total = this.total();
    return total > 0 ? ((this.index() + 1) / total) * 100 : 0;
  });

  /** El botón de comprobación requiere al menos una respuesta. */
  readonly canCheck = computed(() => this.answeredCount() > 0);

  /** Etiqueta del contador de respuestas, en singular o plural. */
  readonly answeredLabel = computed(() => {
    const total = this.answeredCount();
    return total === 1 ? '1 resposta' : `${total} respostes`;
  });

  /** Letra de una opción (A, B, C...). */
  readonly optionLetter = optionLetter;

  /** `true` si la opción está marcada para la pregunta visible. */
  isSelected(optionIndex: number): boolean {
    return this.answers().get(this.current().id) === optionIndex;
  }

  /** Guarda la opción marcada por el usuario. */
  select(optionIndex: number): void {
    const questionId = this.current().id;
    this.answers.update((current) => new Map(current).set(questionId, optionIndex));
  }

  /** Navega a un índice concreto, acotado al rango válido. */
  goTo(target: number): void {
    if (this.total() === 0 || !Number.isFinite(target)) {
      return;
    }
    const clamped = Math.min(Math.max(Math.trunc(target), 0), this.total() - 1);
    this.index.set(clamped);
  }

  previous(): void {
    this.goTo(this.index() - 1);
  }

  next(): void {
    this.goTo(this.index() + 1);
  }

  /** Corrige el examen y muestra el panel de revisión. */
  check(): void {
    if (!this.canCheck()) {
      return;
    }
    this.checked.set(true);
  }

  /** Reinicia el examen conservando las preguntas. */
  retry(): void {
    this.answers.set(new Map());
    this.index.set(0);
    this.checked.set(false);
  }

  /**
   * Salta a la página del PDF de la pregunta indicada (la visible por defecto).
   * Sin visor conectado se abre el PDF en una pestaña nueva en esa página.
   */
  openReference(question: ExamQuestion = this.current()): void {
    this.pdfNavigation.goToPage(question.pdfReference.page);
    if (!this.pdfNavigation.hasViewer) {
      this.document.defaultView?.open(
        buildPdfPageLink(this.pdfUrl, question.pdfReference.page),
        '_blank',
        'noopener',
      );
    }
  }
}
