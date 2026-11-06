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

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ExamResults] }).compileComponents();
    pdfNavigation = TestBed.inject(PdfNavigationService);
    fixture = TestBed.createComponent(ExamResults);
    fixture.componentRef.setInput('questions', QUESTIONS);
    fixture.componentRef.setInput('answers', ANSWERS);
    fixture.componentRef.setInput('pdfUrl', '/documents/exam.pdf');
    await render();
  });

  it('muestra el resumen de la corrección', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('1 de 3 preguntes correctes');
    expect(text).toContain('33,33');
    expect(text).toContain('Correctes');
    expect(text).toContain('Fallades');
    expect(text).toContain('En blanc');
    expect(text).toContain('Anul·lades');
  });

  it('filtra las preguntas por resultado', async () => {
    const tabs = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    const failedTab = tabs.find((tab) => tab.textContent?.includes('Fallades'));
    expect(failedTab).toBeDefined();

    failedTab?.click();
    await render();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('ol > li > button');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Pregunta 2');
  });

  it('salta a la página del PDF al pulsar una pregunta fallida', async () => {
    const goToPage = vi.spyOn(pdfNavigation, 'goToPage');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    const failedRow = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        'ol > li > button',
      ),
    )[1];
    failedRow?.click();

    expect(goToPage).toHaveBeenCalledWith(2);
    // Sin visor conectado se abre el PDF en una pestaña nueva en esa página.
    expect(open).toHaveBeenCalledWith('/documents/exam.pdf#page=2', '_blank', 'noopener');
  });

  it('con el visor PDF conectado no abre pestañas y hace el salto interno', async () => {
    const viewer = vi.fn();
    pdfNavigation.registerViewer(viewer);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    const failedRow = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        'ol > li > button',
      ),
    )[1];
    failedRow?.click();

    expect(viewer).toHaveBeenCalledWith(2);
    expect(open).not.toHaveBeenCalled();
  });

  it('emite la referencia del PDF al saltar', async () => {
    const jumped: number[] = [];
    fixture.componentInstance.referenceJumped.subscribe((reference) => jumped.push(reference.page));
    vi.spyOn(window, 'open').mockReturnValue(null);

    const failedRow = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        'ol > li > button',
      ),
    )[1];
    failedRow?.click();

    expect(jumped).toEqual([2]);
  });

  it('emite retry al pulsar "Torna a intentar"', async () => {
    const retry = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);

    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).find((item) => item.textContent?.includes('Torna a intentar'));

    button?.click();

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
