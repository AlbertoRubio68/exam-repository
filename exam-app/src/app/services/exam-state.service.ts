import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { ExamConfig, ExamQuestion } from '../models/exam.model';

/**
 * Estado del temporizador del examen.
 *
 * - `idle`: cargado pero aún no iniciado (o reiniciado).
 * - `running`: cuenta atrás activa.
 * - `paused`: cuenta atrás detenida temporalmente por el usuario.
 * - `expired`: se ha agotado el tiempo; las respuestas quedan bloqueadas.
 * - `stopped`: el examen se ha entregado antes de agotar el tiempo.
 */
export type ExamTimerStatus = 'idle' | 'running' | 'paused' | 'expired' | 'stopped';

/** Opciones de carga de un examen en `ExamStateService`. */
export interface LoadExamOptions {
  /**
   * Duración del examen en segundos. Si no se indica (o no es un número
   * positivo), se usa `DEFAULT_EXAM_DURATION_SECONDS`.
   */
  durationSeconds?: number;
  /** `true` para arrancar el temporizador justo después de cargar el examen. */
  autoStart?: boolean;
}

/**
 * Duración por defecto del examen: 90 minutos.
 *
 * La convocatoria no fija una duración en el JSON de configuración, así que se
 * usa un valor razonable y configurable mediante `LoadExamOptions`.
 */
export const DEFAULT_EXAM_DURATION_SECONDS = 90 * 60;

/** Frecuencia de actualización del temporizador, en milisegundos. */
export const EXAM_TIMER_TICK_MS = 250;

/**
 * Estado activo del examen (F4.1): respuestas seleccionadas, temporizador y
 * navegación entre preguntas.
 *
 * El servicio es la única fuente de verdad del examen en curso y está pensado
 * para que los componentes de la interfaz (split-screen, F2) y la corrección
 * (F4.2) lo consuman mediante señales de solo lectura:
 *
 * ```ts
 * const state = inject(ExamStateService);
 * state.loadExam(exam, { durationSeconds: 90 * 60, autoStart: true });
 * state.selectAnswer(state.currentQuestion()!.id, 2);
 * state.next();
 * ```
 *
 * La corrección no se calcula aquí: `gradeExam()` (F4.2) acepta directamente
 * `state.answers()` como `AnswerMap`.
 */
@Injectable({ providedIn: 'root' })
export class ExamStateService {
  private readonly destroyRef = inject(DestroyRef);

  private readonly examSignal = signal<ExamConfig | null>(null);
  private readonly questionsSignal = signal<readonly ExamQuestion[]>([]);
  private readonly answersSignal = signal<ReadonlyMap<number, number>>(new Map());
  private readonly currentIndexSignal = signal(0);

  private readonly durationSignal = signal(DEFAULT_EXAM_DURATION_SECONDS);
  private readonly remainingSignal = signal(DEFAULT_EXAM_DURATION_SECONDS);
  private readonly timerStatusSignal = signal<ExamTimerStatus>('idle');
  private readonly finishedSignal = signal(false);

  /** Identificador del intervalo activo, o `null` si el temporizador no corre. */
  private intervalId: ReturnType<typeof setInterval> | null = null;

  /** Instante (epoch ms) en el que se agota el tiempo, o `null` si está parado. */
  private deadline: number | null = null;

  /** Configuración del examen cargado, o `null` si aún no se ha cargado ninguno. */
  readonly exam = this.examSignal.asReadonly();

  /** Preguntas del examen en orden. */
  readonly questions = this.questionsSignal.asReadonly();

  /**
   * Respuestas del usuario (`id` de pregunta → índice de la opción elegida).
   *
   * Las preguntas sin responder simplemente no aparecen en el mapa.
   */
  readonly answers = this.answersSignal.asReadonly();

  /** Índice (0-based) de la pregunta visible. */
  readonly currentIndex = this.currentIndexSignal.asReadonly();

  /** Duración total configurada para el examen, en segundos. */
  readonly durationSeconds = this.durationSignal.asReadonly();

  /** Segundos restantes. Nunca es negativo. */
  readonly remainingSeconds = this.remainingSignal.asReadonly();

  /** Estado actual del temporizador. */
  readonly timerStatus = this.timerStatusSignal.asReadonly();

  /** `true` si el examen se ha entregado con `finish()`. */
  readonly isFinished = this.finishedSignal.asReadonly();

  /** Pregunta visible, o `null` si el examen está vacío o no se ha cargado. */
  readonly currentQuestion = computed<ExamQuestion | null>(() => {
    const questions = this.questionsSignal();
    return questions[this.currentIndexSignal()] ?? null;
  });

  /** Número total de preguntas. */
  readonly totalQuestions = computed(() => this.questionsSignal().length);

  /** Número de preguntas respondidas. */
  readonly answeredCount = computed(() => this.answersSignal().size);

  /** `true` si la pregunta visible es la primera (o no hay preguntas). */
  readonly isFirst = computed(() => this.currentIndexSignal() <= 0);

  /** `true` si la pregunta visible es la última (o no hay preguntas). */
  readonly isLast = computed(() => {
    const total = this.totalQuestions();
    return total === 0 || this.currentIndexSignal() >= total - 1;
  });

  /** `true` si se puede navegar a la pregunta anterior. */
  readonly canGoPrevious = computed(() => this.currentIndexSignal() > 0);

  /** `true` si se puede navegar a la pregunta siguiente. */
  readonly canGoNext = computed(() => this.currentIndexSignal() < this.totalQuestions() - 1);

  /** Segundos transcurridos desde el inicio del examen. */
  readonly elapsedSeconds = computed(() =>
    Math.max(0, this.durationSignal() - this.remainingSignal()),
  );

  /** `true` mientras la cuenta atrás está activa. */
  readonly isTimerRunning = computed(() => this.timerStatusSignal() === 'running');

  /** `true` si se ha agotado el tiempo. */
  readonly isExpired = computed(() => this.timerStatusSignal() === 'expired');

  /**
   * `true` si ya no se pueden modificar las respuestas: examen entregado o
   * tiempo agotado.
   */
  readonly answersLocked = computed(
    () => this.finishedSignal() || this.timerStatusSignal() === 'expired',
  );

  /** Tiempo restante formateado: `MM:SS`, o `H:MM:SS` a partir de una hora. */
  readonly formattedRemaining = computed(() => formatSeconds(this.remainingSignal()));

  constructor() {
    // El servicio es `providedIn: 'root'`; al destruirse el injector hay que
    // liberar el intervalo para no dejar timers huérfanos (tests incluidos).
    this.destroyRef.onDestroy(() => this.clearTimer());
  }

  /**
   * Carga un examen y deja el estado listo para empezar: respuestas vacías,
   * primera pregunta visible y temporizador en `idle` con la duración indicada.
   *
   * Cargar un examen descarta cualquier estado anterior (respuestas, índice y
   * temporizador en curso).
   */
  loadExam(exam: ExamConfig, options: LoadExamOptions = {}): void {
    const duration = normalizeDuration(options.durationSeconds);

    this.clearTimer();
    this.examSignal.set(exam);
    this.questionsSignal.set(exam.questions ?? []);
    this.durationSignal.set(duration);
    this.remainingSignal.set(duration);
    this.timerStatusSignal.set('idle');
    this.answersSignal.set(new Map());
    this.currentIndexSignal.set(0);
    this.finishedSignal.set(false);

    if (options.autoStart) {
      this.startTimer();
    }
  }

  /**
   * Guarda la opción marcada para una pregunta.
   *
   * @returns `true` si la respuesta se ha guardado; `false` si la pregunta no
   * existe, la opción está fuera de rango o las respuestas están bloqueadas.
   */
  selectAnswer(questionId: number, optionIndex: number): boolean {
    if (this.answersLocked()) {
      return false;
    }

    const question = this.questionsSignal().find((item) => item.id === questionId);
    if (
      !question ||
      !Number.isInteger(optionIndex) ||
      optionIndex < 0 ||
      optionIndex >= question.options.length
    ) {
      return false;
    }

    const next = new Map(this.answersSignal());
    next.set(questionId, optionIndex);
    this.answersSignal.set(next);
    return true;
  }

  /**
   * Elimina la respuesta de una pregunta (la deja en blanco).
   *
   * @returns `true` si la operación se ha aplicado; `false` si la pregunta no
   * existe o las respuestas están bloqueadas.
   */
  clearAnswer(questionId: number): boolean {
    if (this.answersLocked()) {
      return false;
    }

    if (!this.questionsSignal().some((item) => item.id === questionId)) {
      return false;
    }

    if (!this.answersSignal().has(questionId)) {
      return true;
    }

    const next = new Map(this.answersSignal());
    next.delete(questionId);
    this.answersSignal.set(next);
    return true;
  }

  /** `true` si la pregunta tiene una respuesta guardada. */
  isAnswered(questionId: number): boolean {
    return this.answersSignal().has(questionId);
  }

  /** Índice de la opción marcada, o `null` si la pregunta está en blanco. */
  selectedOption(questionId: number): number | null {
    return this.answersSignal().get(questionId) ?? null;
  }

  /** Avanza a la pregunta siguiente, si existe. */
  next(): void {
    this.goToIndex(this.currentIndexSignal() + 1);
  }

  /** Retrocede a la pregunta anterior, si existe. */
  previous(): void {
    this.goToIndex(this.currentIndexSignal() - 1);
  }

  /**
   * Navega a un índice concreto. El valor se trunca y se acota al rango
   * `[0, total - 1]`; los valores no finitos se ignoran.
   */
  goToIndex(index: number): void {
    const total = this.totalQuestions();
    if (total === 0 || !Number.isFinite(index)) {
      return;
    }

    const clamped = Math.min(Math.max(Math.trunc(index), 0), total - 1);
    this.currentIndexSignal.set(clamped);
  }

  /**
   * Navega a la pregunta con el `id` indicado.
   *
   * @returns `true` si la pregunta existe y se ha seleccionado.
   */
  goToQuestionId(questionId: number): boolean {
    const index = this.questionsSignal().findIndex((item) => item.id === questionId);
    if (index === -1) {
      return false;
    }

    this.currentIndexSignal.set(index);
    return true;
  }

  /** Inicia o reanuda la cuenta atrás. */
  startTimer(): void {
    const status = this.timerStatusSignal();
    if (
      this.finishedSignal() ||
      status === 'running' ||
      status === 'expired' ||
      this.remainingSignal() <= 0
    ) {
      return;
    }

    this.deadline = Date.now() + this.remainingSignal() * 1000;
    this.timerStatusSignal.set('running');
    this.scheduleTick();
  }

  /** Pausa la cuenta atrás conservando el tiempo restante. */
  pauseTimer(): void {
    if (this.timerStatusSignal() !== 'running') {
      return;
    }

    this.syncRemaining();
    this.clearInterval();
    if (this.timerStatusSignal() === 'running') {
      this.timerStatusSignal.set('paused');
    }
  }

  /** Reanuda la cuenta atrás tras una pausa. */
  resumeTimer(): void {
    if (this.timerStatusSignal() === 'paused') {
      this.startTimer();
    }
  }

  /**
   * Entrega el examen: detiene el temporizador y bloquea las respuestas.
   * La corrección es responsabilidad de `gradeExam()` (F4.2).
   */
  finish(): void {
    if (this.finishedSignal()) {
      return;
    }

    this.syncRemaining();
    this.clearTimer();
    this.finishedSignal.set(true);
    if (this.timerStatusSignal() !== 'expired') {
      this.timerStatusSignal.set('stopped');
    }
  }

  /**
   * Reinicia el examen conservando la configuración cargada: borra respuestas,
   * vuelve a la primera pregunta y restablece el temporizador a su duración
   * inicial en `idle`.
   */
  reset(): void {
    this.clearTimer();
    this.answersSignal.set(new Map());
    this.currentIndexSignal.set(0);
    this.remainingSignal.set(this.durationSignal());
    this.timerStatusSignal.set('idle');
    this.finishedSignal.set(false);
  }

  /** Programa la actualización periódica del tiempo restante. */
  private scheduleTick(): void {
    this.clearInterval();
    this.intervalId = setInterval(() => this.syncRemaining(), EXAM_TIMER_TICK_MS);
  }

  /**
   * Recalcula el tiempo restante a partir del instante límite (no acumula
   * deriva si el navegador retrasa los ticks) y expira el examen al llegar a 0.
   */
  private syncRemaining(): void {
    if (this.deadline === null) {
      return;
    }

    const remaining = Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000));
    this.remainingSignal.set(remaining);

    if (remaining === 0) {
      this.deadline = null;
      this.clearInterval();
      this.timerStatusSignal.set('expired');
    }
  }

  /** Detiene el intervalo y descarta el instante límite, sin tocar el estado. */
  private clearTimer(): void {
    this.clearInterval();
    this.deadline = null;
  }

  /** Libera el intervalo activo, si lo hay. */
  private clearInterval(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

/** Normaliza la duración recibida: entero positivo o valor por defecto. */
function normalizeDuration(seconds: number | undefined): number {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return DEFAULT_EXAM_DURATION_SECONDS;
  }

  return Math.max(1, Math.floor(seconds));
}

/** Formatea una cantidad de segundos como `MM:SS` o `H:MM:SS`. */
function formatSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const paddedMinutes = String(minutes).padStart(2, '0');
  const paddedSeconds = String(seconds).padStart(2, '0');

  return hours > 0 ? `${hours}:${paddedMinutes}:${paddedSeconds}` : `${paddedMinutes}:${paddedSeconds}`;
}
