import { ExamConfig } from '../models/exam.model';
import examData from './exam-data.json';

const exam = examData as unknown as ExamConfig;

describe('exam-data.json', () => {
  it('declara los metadatos del examen y apunta a un PDF servido desde public/', () => {
    expect(exam.examId).toBe('agents-rurals-01-23-model-a');
    expect(exam.title.length).toBeGreaterThan(0);
    expect(exam.pdfUrl).toBe('/documents/questionari-coneixements-model-a.pdf');
  });

  it('contiene las 80 preguntas del qüestionari de coneixements (Model A)', () => {
    expect(exam.questions.length).toBe(80);
    expect(exam.questions.map((question) => question.id)).toEqual(
      Array.from({ length: 80 }, (_, index) => index + 1),
    );
  });

  it('no repite enunciados', () => {
    const statements = new Set(exam.questions.map((question) => question.question));
    expect(statements.size).toBe(exam.questions.length);
  });

  it('cada pregunta tiene cuatro opciones no vacías', () => {
    for (const question of exam.questions) {
      expect(question.options.length, `pregunta ${question.id}`).toBe(4);
      for (const option of question.options) {
        expect(option.trim().length, `pregunta ${question.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('marca como anuladas exactamente las preguntas anuladas por la plantilla oficial', () => {
    const annulled = exam.questions.filter((question) => question.annulled).map((question) => question.id);
    expect(annulled).toEqual([19, 26, 39, 46, 56]);
  });

  it('la respuesta correcta es un índice válido o null si la pregunta está anulada', () => {
    for (const question of exam.questions) {
      if (question.annulled) {
        expect(question.correctAnswer, `pregunta ${question.id}`).toBeNull();
      } else {
        expect(Number.isInteger(question.correctAnswer), `pregunta ${question.id}`).toBe(true);
        expect(question.correctAnswer as number, `pregunta ${question.id}`).toBeGreaterThanOrEqual(0);
        expect(question.correctAnswer as number, `pregunta ${question.id}`).toBeLessThan(question.options.length);
      }
    }
  });

  it('referencia una página válida del cuadernillo (31 páginas)', () => {
    for (const question of exam.questions) {
      expect(question.pdfReference.page, `pregunta ${question.id}`).toBeGreaterThanOrEqual(1);
      expect(question.pdfReference.page, `pregunta ${question.id}`).toBeLessThanOrEqual(31);
      expect(question.pdfReference.label.length, `pregunta ${question.id}`).toBeGreaterThan(0);
      expect(question.explanation.trim().length, `pregunta ${question.id}`).toBeGreaterThan(0);
    }
  });
});
