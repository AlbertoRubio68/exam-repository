import examData from '../data/exam-data.json';
import { ExamConfig, ExamQuestion } from '../models/exam.model';
import { gradeExam, isAnnulled, readAnswer } from './exam-scoring';

/** Construye una pregunta de prueba con valores por defecto válidos. */
function makeQuestion(overrides: Partial<ExamQuestion> & { id: number }): ExamQuestion {
  return {
    question: `Pregunta ${overrides.id}`,
    options: ['Opció A', 'Opció B', 'Opció C', 'Opció D'],
    correctAnswer: 0,
    pdfReference: { page: 1, label: `Pàgina 1 · pregunta ${overrides.id}` },
    explanation: 'Justificació de prova.',
    ...overrides,
  };
}

const exam = examData as unknown as ExamConfig;

describe('gradeExam', () => {
  it('clasifica aciertos, fallos, preguntas en blanco y anuladas', () => {
    const questions = [
      makeQuestion({ id: 1, correctAnswer: 2 }),
      makeQuestion({ id: 2, correctAnswer: 1 }),
      makeQuestion({ id: 3, correctAnswer: 0 }),
      makeQuestion({ id: 4, correctAnswer: null, annulled: true }),
    ];
    const answers = new Map<number, number | null>([
      [1, 2], // correcta
      [2, 3], // incorrecta
      [3, null], // en blanco
    ]);

    const result = gradeExam(questions, answers);

    expect(result.total).toBe(4);
    expect(result.computable).toBe(3);
    expect(result.correct).toBe(1);
    expect(result.incorrect).toBe(1);
    expect(result.blank).toBe(1);
    expect(result.annulled).toBe(1);
    expect(result.answered).toBe(2);
    expect(result.questions.map((item) => item.outcome)).toEqual([
      'correct',
      'incorrect',
      'blank',
      'annulled',
    ]);
    expect(result.failedQuestions.map((item) => item.id)).toEqual([2]);
    expect(result.blankQuestions.map((item) => item.id)).toEqual([3]);
  });

  it('calcula la nota sobre las preguntas que puntúan y sin penalizar los fallos', () => {
    const questions = [
      makeQuestion({ id: 1, correctAnswer: 0 }),
      makeQuestion({ id: 2, correctAnswer: 0 }),
      makeQuestion({ id: 3, correctAnswer: 0 }),
      makeQuestion({ id: 4, correctAnswer: null, annulled: true }),
    ];

    const result = gradeExam(
      questions,
      new Map([
        [1, 0],
        [2, 1],
        [3, 1],
      ]),
    );

    expect(result.computable).toBe(3);
    expect(result.correct).toBe(1);
    expect(result.incorrect).toBe(2);
    expect(result.score).toBeCloseTo(3.33, 2);
    expect(result.percentage).toBeCloseTo(33.33, 2);
  });

  it('acepta tanto un Map como un objeto plano de respuestas', () => {
    const questions = [
      makeQuestion({ id: 1, correctAnswer: 1 }),
      makeQuestion({ id: 2, correctAnswer: 3 }),
    ];

    const fromMap = gradeExam(questions, new Map([[1, 1]]));
    const fromRecord = gradeExam(questions, { 1: 1 });

    expect(fromMap.correct).toBe(1);
    expect(fromRecord.correct).toBe(1);
    expect(readAnswer({ 7: 3 }, 7)).toBe(3);
  });

  it('trata como respuesta en blanco los índices inexistentes o no enteros', () => {
    const questions = [makeQuestion({ id: 1 }), makeQuestion({ id: 2 }), makeQuestion({ id: 3 })];

    const result = gradeExam(
      questions,
      new Map<number, number | null>([
        [1, 99],
        [2, -1],
        [3, 1.5],
      ]),
    );

    expect(result.blank).toBe(3);
    expect(result.correct).toBe(0);
    expect(result.questions.every((item) => item.selectedAnswer === null)).toBe(true);
  });

  it('detecta las preguntas anuladas por plantilla', () => {
    expect(isAnnulled(makeQuestion({ id: 1, correctAnswer: null }))).toBe(true);
    expect(isAnnulled(makeQuestion({ id: 2, correctAnswer: 0, annulled: true }))).toBe(true);
    expect(isAnnulled(makeQuestion({ id: 3, correctAnswer: 0 }))).toBe(false);
  });

  it('corrige el examen real: 80 preguntas, 5 anuladas y 75 computables', () => {
    const allCorrect = new Map<number, number>(
      exam.questions
        .filter((question) => question.correctAnswer !== null)
        .map((question) => [question.id, question.correctAnswer as number]),
    );

    const result = gradeExam(exam.questions, allCorrect);

    expect(result.total).toBe(80);
    expect(result.annulled).toBe(5);
    expect(result.computable).toBe(75);
    expect(result.correct).toBe(75);
    expect(result.incorrect).toBe(0);
    expect(result.blank).toBe(0);
    expect(result.score).toBe(10);
    expect(result.percentage).toBe(100);
  });

  it('con el examen en blanco no hay aciertos y las 75 preguntas computables quedan sin contestar', () => {
    const result = gradeExam(exam.questions, new Map());

    expect(result.correct).toBe(0);
    expect(result.blank).toBe(75);
    expect(result.annulled).toBe(5);
    expect(result.score).toBe(0);
    expect(result.percentage).toBe(0);
  });
});
