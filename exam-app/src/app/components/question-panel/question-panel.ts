import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ExamQuestion } from '../../models/exam.model';

/** Letras usadas para etiquetar las opciones de respuesta (A, B, C, D...). */
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Selección emitida al marcar una opción. */
export interface AnswerSelection {
  /** `id` de la pregunta respondida. */
  questionId: number;
  /** Índice (0-based) de la opción marcada. */
  optionIndex: number;
}

/**
 * Panel de preguntas del layout split-screen (columna izquierda).
 *
 * Pinta la pregunta actual, sus opciones, el indicador de progreso y la
 * navegación (anterior / siguiente / selector de número). Es un componente
 * controlado: las respuestas marcadas llegan por `answers` y cada clic se
 * notifica con `answerSelected`; el estado real vive en `ExamStateService`
 * (F4.1), que también decide si las respuestas están bloqueadas (`locked`).
 */
@Component({
  selector: 'app-question-panel',
  templateUrl: './question-panel.html',
  styleUrl: './question-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestionPanel {
  /** Preguntas del examen, en orden. */
  readonly questions = input.required<readonly ExamQuestion[]>();

  /** Índice (0-based) de la pregunta visible. */
  readonly index = input.required<number>();

  /** Respuestas guardadas (`id` de pregunta → índice de la opción). */
  readonly answers = input<ReadonlyMap<number, number>>(new Map());

  /** `true` cuando las respuestas ya no se pueden modificar (examen entregado). */
  readonly locked = input(false);

  /** Emite el nuevo índice cuando el usuario navega a otra pregunta. */
  readonly indexChange = output<number>();

  /** Emite la opción marcada por el usuario. */
  readonly answerSelected = output<AnswerSelection>();

  readonly total = computed(() => this.questions().length);

  readonly currentQuestion = computed<ExamQuestion | undefined>(
    () => this.questions()[this.index()],
  );

  readonly isFirst = computed(() => this.index() <= 0);

  readonly isLast = computed(() => this.index() >= this.total() - 1);

  /** Porcentaje de avance dentro del cuestionario (1-based de cara al usuario). */
  readonly progress = computed(() => {
    const total = this.total();
    return total > 0 ? ((this.index() + 1) / total) * 100 : 0;
  });

  /** Letra visible de una opción (A, B, C...). */
  optionLetter(optionIndex: number): string {
    return OPTION_LETTERS[optionIndex] ?? String(optionIndex + 1);
  }

  /** `true` si la opción está marcada para la pregunta indicada. */
  isSelected(question: ExamQuestion, optionIndex: number): boolean {
    return this.answers().get(question.id) === optionIndex;
  }

  /** Notifica la opción marcada por el usuario. */
  select(question: ExamQuestion, optionIndex: number): void {
    if (this.locked()) {
      return;
    }
    this.answerSelected.emit({ questionId: question.id, optionIndex });
  }

  /** Navega a un índice concreto, acotándolo al rango válido de preguntas. */
  goTo(target: number): void {
    if (this.total() === 0 || !Number.isFinite(target)) {
      return;
    }
    const clamped = Math.min(Math.max(Math.trunc(target), 0), this.total() - 1);
    if (clamped !== this.index()) {
      this.indexChange.emit(clamped);
    }
  }

  previous(): void {
    this.goTo(this.index() - 1);
  }

  next(): void {
    this.goTo(this.index() + 1);
  }
}
