import { TestBed } from '@angular/core/testing';
import { ExamConfig } from '../models/exam.model';
import {
  DEFAULT_EXAM_DURATION_SECONDS,
  ExamStateService,
} from './exam-state.service';

/** Examen de prueba con tres preguntas de cuatro opciones. */
function buildExam(): ExamConfig {
  return {
    examId: 'test-exam',
    title: 'Examen de prueba',
    pdfUrl: '/documents/test.pdf',
    questions: [
      {
        id: 1,
        question: 'Pregunta 1',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 0,
        pdfReference: { page: 1, label: 'Página 1' },
        explanation: 'Explicación 1',
      },
      {
        id: 2,
        question: 'Pregunta 2',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 1,
        pdfReference: { page: 2, label: 'Página 2' },
        explanation: 'Explicación 2',
      },
      {
        id: 3,
        question: 'Pregunta 3',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 2,
        pdfReference: { page: 3, label: 'Página 3' },
        explanation: 'Explicación 3',
      },
    ],
  };
}

describe('ExamStateService', () => {
  let service: ExamStateService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ExamStateService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  describe('estado inicial', () => {
    it('arranca sin examen, sin respuestas y con el temporizador inactivo', () => {
      expect(service.exam()).toBeNull();
      expect(service.questions()).toEqual([]);
      expect(service.totalQuestions()).toBe(0);
      expect(service.currentQuestion()).toBeNull();
      expect(service.answers().size).toBe(0);
      expect(service.answeredCount()).toBe(0);
      expect(service.durationSeconds()).toBe(DEFAULT_EXAM_DURATION_SECONDS);
      expect(service.remainingSeconds()).toBe(DEFAULT_EXAM_DURATION_SECONDS);
      expect(service.timerStatus()).toBe('idle');
      expect(service.isTimerRunning()).toBe(false);
      expect(service.isExpired()).toBe(false);
      expect(service.isFinished()).toBe(false);
      expect(service.answersLocked()).toBe(false);
    });

    it('ignora la navegación y la selección cuando no hay examen cargado', () => {
      service.next();
      service.previous();
      service.goToIndex(2);
      expect(service.currentIndex()).toBe(0);
      expect(service.selectAnswer(1, 0)).toBe(false);
      expect(service.clearAnswer(1)).toBe(false);
    });
  });

  describe('carga del examen', () => {
    it('carga la configuración y deja la primera pregunta visible', () => {
      const exam = buildExam();
      service.loadExam(exam);

      expect(service.exam()).toBe(exam);
      expect(service.questions()).toEqual(exam.questions);
      expect(service.totalQuestions()).toBe(3);
      expect(service.currentIndex()).toBe(0);
      expect(service.currentQuestion()?.id).toBe(1);
      expect(service.answers().size).toBe(0);
      expect(service.timerStatus()).toBe('idle');
      expect(service.isFirst()).toBe(true);
      expect(service.isLast()).toBe(false);
      expect(service.canGoPrevious()).toBe(false);
      expect(service.canGoNext()).toBe(true);
    });

    it('usa la duración por defecto si no se indica o no es válida', () => {
      service.loadExam(buildExam(), { durationSeconds: 0 });
      expect(service.durationSeconds()).toBe(DEFAULT_EXAM_DURATION_SECONDS);
      expect(service.remainingSeconds()).toBe(DEFAULT_EXAM_DURATION_SECONDS);
      expect(service.formattedRemaining()).toBe('1:30:00');

      service.loadExam(buildExam(), { durationSeconds: -10 });
      expect(service.durationSeconds()).toBe(DEFAULT_EXAM_DURATION_SECONDS);

      service.loadExam(buildExam(), { durationSeconds: Number.NaN });
      expect(service.durationSeconds()).toBe(DEFAULT_EXAM_DURATION_SECONDS);
    });

    it('acepta una duración personalizada y trunca los decimales', () => {
      service.loadExam(buildExam(), { durationSeconds: 90.9 });
      expect(service.durationSeconds()).toBe(90);
      expect(service.remainingSeconds()).toBe(90);
      expect(service.formattedRemaining()).toBe('01:30');
    });

    it('arranca el temporizador automáticamente con autoStart', () => {
      service.loadExam(buildExam(), { durationSeconds: 60, autoStart: true });
      expect(service.timerStatus()).toBe('running');
      expect(service.isTimerRunning()).toBe(true);
    });

    it('descarta las respuestas y el temporizador al cargar otro examen', () => {
      service.loadExam(buildExam(), { durationSeconds: 60, autoStart: true });
      service.selectAnswer(1, 2);
      service.goToIndex(2);
      vi.advanceTimersByTime(5000);

      const other: ExamConfig = {
        ...buildExam(),
        examId: 'other-exam',
        questions: [buildExam().questions[0]],
      };
      service.loadExam(other, { durationSeconds: 30 });

      expect(service.exam()?.examId).toBe('other-exam');
      expect(service.totalQuestions()).toBe(1);
      expect(service.answers().size).toBe(0);
      expect(service.currentIndex()).toBe(0);
      expect(service.remainingSeconds()).toBe(30);
      expect(service.timerStatus()).toBe('idle');
    });
  });

  describe('selección de respuestas', () => {
    beforeEach(() => {
      service.loadExam(buildExam(), { durationSeconds: 600 });
    });

    it('guarda la opción marcada y actualiza el contador de respuestas', () => {
      expect(service.selectAnswer(1, 2)).toBe(true);
      expect(service.answers().get(1)).toBe(2);
      expect(service.isAnswered(1)).toBe(true);
      expect(service.isAnswered(2)).toBe(false);
      expect(service.selectedOption(1)).toBe(2);
      expect(service.selectedOption(2)).toBeNull();
      expect(service.answeredCount()).toBe(1);
    });

    it('permite cambiar la respuesta de una pregunta ya contestada', () => {
      service.selectAnswer(1, 2);
      const firstSnapshot = service.answers();

      expect(service.selectAnswer(1, 3)).toBe(true);
      expect(service.selectedOption(1)).toBe(3);
      expect(service.answeredCount()).toBe(1);

      // Las instantáneas anteriores no se mutan.
      expect(firstSnapshot.get(1)).toBe(2);
      expect(service.answers()).not.toBe(firstSnapshot);
    });

    it('rechaza preguntas inexistentes y opciones fuera de rango', () => {
      expect(service.selectAnswer(999, 0)).toBe(false);
      expect(service.selectAnswer(1, -1)).toBe(false);
      expect(service.selectAnswer(1, 4)).toBe(false);
      expect(service.selectAnswer(1, 1.5)).toBe(false);
      expect(service.answers().size).toBe(0);
    });

    it('permite dejar una pregunta en blanco', () => {
      service.selectAnswer(1, 0);

      expect(service.clearAnswer(1)).toBe(true);
      expect(service.isAnswered(1)).toBe(false);
      expect(service.answeredCount()).toBe(0);
      expect(service.clearAnswer(1)).toBe(true);
      expect(service.clearAnswer(999)).toBe(false);
    });
  });

  describe('navegación entre preguntas', () => {
    beforeEach(() => {
      service.loadExam(buildExam());
    });

    it('avanza y retrocede entre preguntas', () => {
      service.next();
      expect(service.currentIndex()).toBe(1);
      expect(service.currentQuestion()?.id).toBe(2);
      expect(service.canGoPrevious()).toBe(true);
      expect(service.canGoNext()).toBe(true);

      service.next();
      expect(service.currentIndex()).toBe(2);
      expect(service.isLast()).toBe(true);
      expect(service.canGoNext()).toBe(false);

      service.next();
      expect(service.currentIndex()).toBe(2);

      service.previous();
      expect(service.currentIndex()).toBe(1);
    });

    it('no retrocede por debajo de la primera pregunta', () => {
      service.previous();
      expect(service.currentIndex()).toBe(0);
      expect(service.isFirst()).toBe(true);
    });

    it('acota los índices al rango válido', () => {
      service.goToIndex(-5);
      expect(service.currentIndex()).toBe(0);

      service.goToIndex(99);
      expect(service.currentIndex()).toBe(2);

      service.goToIndex(1.9);
      expect(service.currentIndex()).toBe(1);

      service.goToIndex(Number.NaN);
      expect(service.currentIndex()).toBe(1);

      service.goToIndex(Number.POSITIVE_INFINITY);
      expect(service.currentIndex()).toBe(1);
    });

    it('navega por identificador de pregunta', () => {
      expect(service.goToQuestionId(3)).toBe(true);
      expect(service.currentIndex()).toBe(2);
      expect(service.currentQuestion()?.id).toBe(3);

      expect(service.goToQuestionId(999)).toBe(false);
      expect(service.currentIndex()).toBe(2);
    });
  });

  describe('temporizador', () => {
    it('no arranca al cargar el examen si no se pide', () => {
      service.loadExam(buildExam(), { durationSeconds: 60 });
      expect(service.timerStatus()).toBe('idle');
      vi.advanceTimersByTime(5000);
      expect(service.remainingSeconds()).toBe(60);
    });

    it('descuenta un segundo por segundo', () => {
      service.loadExam(buildExam(), { durationSeconds: 60 });
      service.startTimer();

      vi.advanceTimersByTime(1000);
      expect(service.remainingSeconds()).toBe(59);
      expect(service.formattedRemaining()).toBe('00:59');
      expect(service.elapsedSeconds()).toBe(1);

      vi.advanceTimersByTime(9000);
      expect(service.remainingSeconds()).toBe(50);
      expect(service.elapsedSeconds()).toBe(10);
    });

    it('expira al llegar a cero y bloquea las respuestas', () => {
      service.loadExam(buildExam(), { durationSeconds: 3, autoStart: true });
      service.selectAnswer(1, 0);

      vi.advanceTimersByTime(2999);
      expect(service.remainingSeconds()).toBe(1);
      expect(service.isExpired()).toBe(false);

      vi.advanceTimersByTime(1);
      expect(service.remainingSeconds()).toBe(0);
      expect(service.isExpired()).toBe(true);
      expect(service.timerStatus()).toBe('expired');
      expect(service.isTimerRunning()).toBe(false);
      expect(service.answersLocked()).toBe(true);

      // No baja de cero ni admite más respuestas.
      vi.advanceTimersByTime(10000);
      expect(service.remainingSeconds()).toBe(0);
      expect(service.selectAnswer(2, 1)).toBe(false);
      expect(service.clearAnswer(1)).toBe(false);
      expect(service.answers().get(1)).toBe(0);
    });

    it('pausa y reanuda conservando el tiempo restante', () => {
      service.loadExam(buildExam(), { durationSeconds: 10, autoStart: true });
      vi.advanceTimersByTime(3000);
      expect(service.remainingSeconds()).toBe(7);

      service.pauseTimer();
      expect(service.timerStatus()).toBe('paused');
      vi.advanceTimersByTime(5000);
      expect(service.remainingSeconds()).toBe(7);

      service.resumeTimer();
      expect(service.timerStatus()).toBe('running');
      vi.advanceTimersByTime(1000);
      expect(service.remainingSeconds()).toBe(6);
    });

    it('ignora pausas y reanudaciones en estados no aplicables', () => {
      service.loadExam(buildExam(), { durationSeconds: 60 });
      service.pauseTimer();
      expect(service.timerStatus()).toBe('idle');

      service.resumeTimer();
      expect(service.timerStatus()).toBe('idle');

      service.startTimer();
      service.startTimer();
      expect(service.timerStatus()).toBe('running');
      vi.advanceTimersByTime(1000);
      expect(service.remainingSeconds()).toBe(59);
    });

    it('formatea duraciones de una hora o más', () => {
      service.loadExam(buildExam(), { durationSeconds: 3661 });
      expect(service.formattedRemaining()).toBe('1:01:01');
    });

    it('detiene el temporizador al entregar el examen', () => {
      service.loadExam(buildExam(), { durationSeconds: 3600, autoStart: true });
      service.selectAnswer(1, 1);
      vi.advanceTimersByTime(5000);
      expect(service.remainingSeconds()).toBe(3595);

      service.finish();
      expect(service.isFinished()).toBe(true);
      expect(service.answersLocked()).toBe(true);
      expect(service.isTimerRunning()).toBe(false);
      expect(service.timerStatus()).toBe('stopped');

      vi.advanceTimersByTime(5000);
      expect(service.remainingSeconds()).toBe(3595);

      expect(service.selectAnswer(2, 0)).toBe(false);
      expect(service.clearAnswer(1)).toBe(false);
      expect(service.answers().get(1)).toBe(1);
    });

    it('finish() es idempotente', () => {
      service.loadExam(buildExam(), { durationSeconds: 60, autoStart: true });
      service.finish();
      const remaining = service.remainingSeconds();

      service.finish();
      expect(service.timerStatus()).toBe('stopped');
      expect(service.remainingSeconds()).toBe(remaining);
    });
  });

  describe('reinicio', () => {
    it('borra respuestas, vuelve a la primera pregunta y restablece el tiempo', () => {
      service.loadExam(buildExam(), { durationSeconds: 120, autoStart: true });
      service.selectAnswer(1, 1);
      service.selectAnswer(2, 2);
      service.goToIndex(2);
      vi.advanceTimersByTime(5000);

      service.reset();

      expect(service.exam()).not.toBeNull();
      expect(service.questions().length).toBe(3);
      expect(service.answers().size).toBe(0);
      expect(service.currentIndex()).toBe(0);
      expect(service.remainingSeconds()).toBe(120);
      expect(service.elapsedSeconds()).toBe(0);
      expect(service.timerStatus()).toBe('idle');
      expect(service.isFinished()).toBe(false);
      expect(service.answersLocked()).toBe(false);
    });

    it('permite volver a empezar tras expirar el tiempo', () => {
      service.loadExam(buildExam(), { durationSeconds: 1, autoStart: true });
      vi.advanceTimersByTime(1000);
      expect(service.isExpired()).toBe(true);

      service.reset();
      expect(service.isExpired()).toBe(false);
      expect(service.remainingSeconds()).toBe(1);
      expect(service.selectAnswer(1, 0)).toBe(true);
    });
  });
});
