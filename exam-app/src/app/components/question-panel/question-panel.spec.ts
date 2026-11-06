import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExamQuestion } from '../../models/exam.model';
import { AnswerSelection, QuestionPanel } from './question-panel';

const questions: ExamQuestion[] = [
  {
    id: 1,
    question: '¿Cuál es la respuesta correcta de la pregunta uno?',
    options: ['Opción A', 'Opción B', 'Opción C', 'Opción D'],
    correctAnswer: 0,
    pdfReference: { page: 3, label: 'página 3' },
    explanation: 'explicación 1',
  },
  {
    id: 2,
    question: '¿Cuál es la respuesta correcta de la pregunta dos?',
    options: ['Opción A', 'Opción B', 'Opción C', 'Opción D'],
    correctAnswer: 1,
    pdfReference: { page: 4, label: 'página 4' },
    explanation: 'explicación 2',
  },
  {
    id: 19,
    question: 'Pregunta anulada por la plantilla oficial',
    options: ['Opción A', 'Opción B', 'Opción C', 'Opción D'],
    correctAnswer: null,
    pdfReference: { page: 8, label: 'página 8' },
    explanation: 'anulada',
    annulled: true,
  },
];

function createPanel(
  index = 0,
  source: readonly ExamQuestion[] = questions,
  answers: ReadonlyMap<number, number> = new Map(),
  locked = false,
): ComponentFixture<QuestionPanel> {
  const fixture = TestBed.createComponent(QuestionPanel);
  fixture.componentRef.setInput('questions', source);
  fixture.componentRef.setInput('index', index);
  fixture.componentRef.setInput('answers', answers);
  fixture.componentRef.setInput('locked', locked);
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<QuestionPanel>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('QuestionPanel', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [QuestionPanel] }).compileComponents();
  });

  it('muestra el enunciado, las opciones etiquetadas y el progreso', () => {
    const fixture = createPanel();
    const element = fixture.nativeElement as HTMLElement;
    const progress = element.querySelector('[role="progressbar"]');

    expect(element.querySelector('h2')?.textContent).toContain('pregunta uno');
    expect(element.querySelectorAll('input[type="radio"]').length).toBe(4);
    expect(element.querySelectorAll('label').length).toBe(4);
    expect(text(fixture)).toContain('Opción D');
    expect(progress?.getAttribute('aria-valuemax')).toBe('3');
    expect(progress?.getAttribute('aria-valuenow')).toBe('1');
  });

  it('emite indexChange al usar Següent, Anterior y el selector de número', () => {
    const fixture = createPanel(1);
    const element = fixture.nativeElement as HTMLElement;
    const emitted: number[] = [];
    fixture.componentInstance.indexChange.subscribe((value) => emitted.push(value));

    (element.querySelector('[data-testid="next-question"]') as HTMLButtonElement).click();
    (element.querySelector('[data-testid="previous-question"]') as HTMLButtonElement).click();
    (element.querySelector('[aria-label="Anar a la pregunta 3"]') as HTMLButtonElement).click();

    expect(emitted).toEqual([2, 0, 2]);
  });

  it('deshabilita Anterior en la primera pregunta y Següent en la última', () => {
    const first = createPanel(0);
    const firstElement = first.nativeElement as HTMLElement;
    expect(
      (firstElement.querySelector('[data-testid="previous-question"]') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (firstElement.querySelector('[data-testid="next-question"]') as HTMLButtonElement).disabled,
    ).toBe(false);

    const last = createPanel(questions.length - 1);
    const lastElement = last.nativeElement as HTMLElement;
    expect(
      (lastElement.querySelector('[data-testid="previous-question"]') as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (lastElement.querySelector('[data-testid="next-question"]') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('emite la opción marcada sin guardar estado propio', () => {
    const fixture = createPanel();
    const element = fixture.nativeElement as HTMLElement;
    const emitted: AnswerSelection[] = [];
    fixture.componentInstance.answerSelected.subscribe((value) => emitted.push(value));

    element.querySelectorAll<HTMLInputElement>('input[type="radio"]')[2].click();

    expect(emitted).toEqual([{ questionId: 1, optionIndex: 2 }]);
  });

  it('refleja las respuestas recibidas y conserva la selección al cambiar de pregunta', () => {
    const answers = new Map<number, number>([[1, 2]]);
    const fixture = createPanel(0, questions, answers);
    const element = fixture.nativeElement as HTMLElement;
    const radios = () => element.querySelectorAll<HTMLInputElement>('input[type="radio"]');

    expect(radios()[2].checked).toBe(true);
    expect(fixture.componentInstance.isSelected(questions[0], 2)).toBe(true);
    expect(fixture.componentInstance.isSelected(questions[0], 0)).toBe(false);

    fixture.componentRef.setInput('index', 1);
    fixture.detectChanges();
    expect(radios()[0].checked).toBe(false);

    fixture.componentRef.setInput('index', 0);
    fixture.detectChanges();
    expect(radios()[2].checked).toBe(true);
  });

  it('bloquea las respuestas cuando el examen está entregado', () => {
    const fixture = createPanel(0, questions, new Map([[1, 1]]), true);
    const element = fixture.nativeElement as HTMLElement;
    const emitted: AnswerSelection[] = [];
    fixture.componentInstance.answerSelected.subscribe((value) => emitted.push(value));

    element.querySelectorAll<HTMLInputElement>('input[type="radio"]')[2].click();

    expect(emitted).toEqual([]);
    expect(
      element.querySelectorAll<HTMLInputElement>('input[type="radio"]')[2].disabled,
    ).toBe(true);
  });

  it('avisa cuando la pregunta está anulada', () => {
    const fixture = createPanel(2);
    expect(text(fixture)).toContain('Anul·lada');
  });

  it('muestra un aviso si el examen no tiene preguntas', () => {
    const fixture = createPanel(0, []);
    expect(text(fixture)).toContain('No hay preguntas disponibles');
  });
});
