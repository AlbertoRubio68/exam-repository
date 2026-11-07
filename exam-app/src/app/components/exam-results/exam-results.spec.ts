import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExamQuestion } from '../../models/exam.model';
import { PdfNavigationService } from '../../services/pdf-navigation.service';
import { ExamResults } from './exam-results';

/** Construye una pregunta de prueba con valores por defecto válidos. */
function makeQuestion(overrides: Partial<ExamQuestion> & { id: number }): ExamQuestion {
  return {
    question: `Pregunta ${overrides.id}`,
    options: ['Opció A', 'Opció B', 'Opció C', 'Opció D'],
    correctAnswer: 0,
    pdfReference: { page: overrides.id, label: `Pàgina ${overrides.id}` },
    studyReference: {
      page: 100 + overrides.id,
      label: `Guia · Tema ${overrides.id}`,
      anchor: `fragment ${overrides.id}`,
    },
    explanation: `Justificació ${overrides.id}.`,
    ...overrides,
  };
}

const QUESTIONS: ExamQuestion[] = [
  makeQuestion({ id: 1, correctAnswer: 0 }),
  makeQuestion({ id: 2, correctAnswer: 1 }),
  makeQuestion({ id: 3, correctAnswer: 0 }),
  makeQuestion({ id: 4, correctAnswer: null, annulled: true }),
];

const ANSWERS = new Map<number, number>([
  [1, 0], // acierto
  [2, 2], // fallo
]);

describe('ExamResults', () => {
  let fixture: ComponentFixture<ExamResults>;
  let pdfNavigation: PdfNavigationService;

  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ExamResults] }).compileComponents();
    pdfNavigation = TestBed.inject(PdfNavigationService);
    fixture = TestBed.createComponent(ExamResults);
    fixture.componentRef.setInput('questions', QUESTIONS);
    fixture.componentRef.setInput('answers', ANSWERS);
    fixture.componentRef.setInput('pdfUrl', '/documents/exam.pdf');
    fixture.componentRef.setInput('studyPdfUrl', '/documents/study.pdf');
    await render();
  });

  it('muestra el resumen de la corrección', () => {
    const text = element().textContent ?? '';

    expect(text).toContain('1 de 3 preguntes correctes');
    expect(text).toContain('33,33');
    expect(text).toContain('Correctes');
    expect(text).toContain('Fallades');
    expect(text).toContain('En blanc');
    expect(text).toContain('Anul·lades');
  });

  it('filtra las preguntas por resultado', async () => {
    const tabs = Array.from(element().querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const failedTab = tabs.find((tab) => tab.textContent?.includes('Fallades'));
    expect(failedTab).toBeDefined();

    failedTab?.click();
    await render();

    const rows = element().querySelectorAll('ol > li > button');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Pregunta 2');
  });

  it('muestra la referencia a la guía de estudio (no la del cuadernillo)', () => {
    const failedRow = Array.from(
      element().querySelectorAll<HTMLButtonElement>('ol > li > button'),
    )[1];

    expect(failedRow.textContent).toContain('Guia · Tema 2');
    expect(failedRow.textContent).toContain('Guia pàg. 102');
    expect(failedRow.textContent).not.toContain('Pàgina 2');
  });

  it('salta a la página de la guía de estudio al pulsar una pregunta fallida', () => {
    const goToStudyPage = vi.spyOn(pdfNavigation, 'goToStudyPage');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    const failedRow = Array.from(
      element().querySelectorAll<HTMLButtonElement>('ol > li > button'),
    )[1];
    failedRow?.click();

    expect(goToStudyPage).toHaveBeenCalledWith(102);
    // Sin visor conectado se abre la guía en una pestaña nueva en esa página.
    expect(open).toHaveBeenCalledWith('/documents/study.pdf#page=102', '_blank', 'noopener');
  });

  it('con el visor PDF conectado no abre pestañas y hace el salto interno a la guía', () => {
    const viewer = vi.fn();
    pdfNavigation.registerViewer(viewer);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    const failedRow = Array.from(
      element().querySelectorAll<HTMLButtonElement>('ol > li > button'),
    )[1];
    failedRow?.click();

    expect(viewer).toHaveBeenCalledWith({ document: 'study', page: 102 });
    expect(open).not.toHaveBeenCalled();
  });

  it('emite el destino de la guía al saltar', () => {
    const jumped: { document: string; page: number }[] = [];
    fixture.componentInstance.referenceJumped.subscribe((reference) => jumped.push(reference));
    vi.spyOn(window, 'open').mockReturnValue(null);

    const failedRow = Array.from(
      element().querySelectorAll<HTMLButtonElement>('ol > li > button'),
    )[1];
    failedRow?.click();

    expect(jumped).toEqual([{ document: 'study', page: 102 }]);
  });

  it('mantiene el enlace histórico al cuadernillo del cuestionario', () => {
    const goToQuestionnairePage = vi.spyOn(pdfNavigation, 'goToQuestionnairePage');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    const links = element().querySelectorAll<HTMLAnchorElement>(
      '[data-testid="result-questionnaire-link"]',
    );
    links[1]?.click();

    expect(goToQuestionnairePage).toHaveBeenCalledWith(2);
    expect(open).toHaveBeenCalledWith('/documents/exam.pdf#page=2', '_blank', 'noopener');
  });

  it('marca las referencias aproximadas como needsReview', () => {
    const questions = [
      makeQuestion({ id: 1, correctAnswer: 0 }),
      makeQuestion({
        id: 2,
        correctAnswer: 0,
        studyReference: { page: 398, label: 'Guia · flora', needsReview: true },
      }),
    ];
    fixture.componentRef.setInput('questions', questions);
    fixture.detectChanges();

    expect(element().textContent).toContain('Referència aproximada');
  });

  it('emite retry al pulsar "Torna a intentar"', () => {
    const retry = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);

    const button = Array.from(element().querySelectorAll<HTMLButtonElement>('button')).find(
      (item) => item.textContent?.includes('Torna a intentar'),
    );

    button?.click();

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
