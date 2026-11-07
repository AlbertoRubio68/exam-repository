import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ExamStateService } from '../../services/exam-state.service';
import { PdfNavigationService } from '../../services/pdf-navigation.service';
import { PdfViewer } from '../pdf-viewer/pdf-viewer';
import { ExamRunner } from './exam-runner';

/**
 * Sustituto del visor real (F3) para no cargar PDF.js en jsdom. Mantiene la
 * misma API pública que consume la integración: `pdfUrl`, `initialPage`,
 * `pageRequest` y `goToPage(page)`.
 */
@Component({
  selector: 'app-pdf-viewer',
  template: '',
  standalone: true,
})
class PdfViewerStub {
  @Input({ required: true }) pdfUrl!: string;
  @Input() initialPage = 1;
  @Input() pageRequest = 0;

  readonly goToPage = vi.fn(() => Promise.resolve());
}

describe('ExamRunner (integración F2 + F3 + F4)', () => {
  let fixture: ComponentFixture<ExamRunner>;
  let state: ExamStateService;
  let pdfNavigation: PdfNavigationService;
  let viewer: PdfViewerStub;

  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const findButton = (label: string): HTMLButtonElement | undefined =>
    Array.from(element().querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes(label),
    );

  const radios = (): NodeListOf<HTMLInputElement> =>
    element().querySelectorAll<HTMLInputElement>('input[type="radio"]');

  beforeEach(async () => {
    TestBed.overrideComponent(ExamRunner, {
      remove: { imports: [PdfViewer] },
      add: { imports: [PdfViewerStub] },
    });
    await TestBed.configureTestingModule({ imports: [ExamRunner] }).compileComponents();

    fixture = TestBed.createComponent(ExamRunner);
    state = TestBed.inject(ExamStateService);
    pdfNavigation = TestBed.inject(PdfNavigationService);
    await render();
    viewer = fixture.debugElement.query(By.directive(PdfViewerStub)).componentInstance;
  });

  it('carga el examen real en el estado y muestra el split-screen', () => {
    expect(state.totalQuestions()).toBe(80);
    expect(state.currentIndex()).toBe(0);
    expect(
      element().querySelector('[data-testid="pane-questions"] app-question-panel'),
    ).not.toBeNull();
    expect(element().querySelector('[data-testid="pane-pdf"] app-pdf-viewer')).not.toBeNull();
    expect(element().querySelector('main')?.className).toContain('lg:grid-cols-2');
    expect(element().textContent).toContain('80 preguntes');
  });

  it('guarda la respuesta elegida en ExamStateService', async () => {
    expect(findButton('Comprovar resultats')?.disabled).toBe(true);

    radios().item(3).click();
    await render();

    expect(state.answers().get(1)).toBe(3);
    expect(state.answeredCount()).toBe(1);
    expect(element().querySelector('[data-testid="answered-count"]')?.textContent).toContain(
      '1 resposta',
    );
    expect(findButton('Comprovar resultats')?.disabled).toBe(false);
  });

  it('navega entre preguntas a través del estado compartido', async () => {
    const next = (): HTMLButtonElement =>
      element().querySelector('[data-testid="next-question"]') as HTMLButtonElement;
    const previous = (): HTMLButtonElement =>
      element().querySelector('[data-testid="previous-question"]') as HTMLButtonElement;

    next().click();
    await render();
    expect(state.currentIndex()).toBe(1);

    previous().click();
    await render();
    expect(state.currentIndex()).toBe(0);
  });

  it('comprueba el examen: entrega el estado y muestra la revisión', async () => {
    // Pregunta 1 (Model A): la opción correcta es la D (índice 3).
    radios().item(3).click();
    await render();

    findButton('Comprovar resultats')?.click();
    await render();

    expect(state.isFinished()).toBe(true);
    expect(element().querySelector('app-exam-results')).not.toBeNull();
    expect(element().textContent).toContain('1 de 75 preguntes correctes');
    // El visor sigue montado en el panel derecho durante la revisión.
    expect(element().querySelector('[data-testid="pane-pdf"] app-pdf-viewer')).not.toBeNull();
  });

  it('reinicia el examen conservando el cuestionario', async () => {
    radios().item(3).click();
    await render();
    findButton('Comprovar resultats')?.click();
    await render();

    findButton('Torna a intentar')?.click();
    await render();

    expect(element().querySelector('app-exam-results')).toBeNull();
    expect(state.answers().size).toBe(0);
    expect(state.currentIndex()).toBe(0);
    expect(state.isFinished()).toBe(false);
    expect(findButton('Comprovar resultats')?.disabled).toBe(true);
  });

  it('arranca con la guía de estudio como documento del visor', () => {
    expect(fixture.componentInstance.activeDocument()).toBe('study');
    expect(viewer.pdfUrl).toContain('documents/guia-estudi-agentrural.pdf');
  });

  it('salta a la página de la guía de estudio de la pregunta visible', async () => {
    expect(pdfNavigation.hasViewer).toBe(true);
    // Pregunta 1: la guía la explica en la página física 210.
    expect(fixture.componentInstance.current()?.studyReference.page).toBe(210);

    element().querySelector<HTMLButtonElement>('[data-testid="open-study-reference"]')?.click();
    await render();

    expect(viewer.goToPage).toHaveBeenCalledWith(210);
  });

  it('el botón de la guía usa la referencia de la guía, no la del cuadernillo', async () => {
    // Pregunta 1: cuadernillo pág. 3 vs guía pág. 210.
    element().querySelector<HTMLButtonElement>('[data-testid="open-study-reference"]')?.click();
    await render();

    expect(viewer.goToPage).toHaveBeenCalledWith(210);
    expect(viewer.goToPage).not.toHaveBeenCalledWith(3);
  });

  it('el panel de preguntas también puede saltar a la guía', async () => {
    element().querySelector<HTMLButtonElement>('[data-testid="question-study-reference"]')?.click();
    await render();

    expect(viewer.goToPage).toHaveBeenCalledWith(210);
  });

  it('permite consultar el cuadernillo del cuestionario (dato histórico)', async () => {
    element()
      .querySelector<HTMLButtonElement>('[data-testid="open-questionnaire-reference"]')
      ?.click();
    await render();

    expect(fixture.componentInstance.activeDocument()).toBe('questionnaire');
    expect(viewer.pdfUrl).toContain('documents/questionari-coneixements-model-a.pdf');
    expect(viewer.initialPage).toBe(3);
  });

  it('el selector de documento vuelve a la guía en la página de la pregunta', async () => {
    element().querySelector<HTMLButtonElement>('[data-testid="doc-questionnaire"]')?.click();
    await render();
    expect(fixture.componentInstance.activeDocument()).toBe('questionnaire');

    element().querySelector<HTMLButtonElement>('[data-testid="doc-study"]')?.click();
    await render();

    expect(fixture.componentInstance.activeDocument()).toBe('study');
    expect(viewer.pdfUrl).toContain('documents/guia-estudi-agentrural.pdf');
    expect(viewer.initialPage).toBe(210);
  });

  it('desde la revisión salta a la guía al pulsar una pregunta', async () => {
    radios().item(3).click();
    await render();
    findButton('Comprovar resultats')?.click();
    await render();

    viewer.goToPage.mockClear();
    element().querySelector<HTMLButtonElement>('app-exam-results ol > li > button')?.click();
    await render();

    // Pregunta 1 de la revisión: guía pág. 210.
    expect(viewer.goToPage).toHaveBeenCalledWith(210);
  });

  it('expone el temporizador y permite pausarlo y reanudarlo', async () => {
    const timer = element().querySelector('[data-testid="timer"]');
    expect(timer?.textContent).toContain('1:30:00');
    expect(state.isTimerRunning()).toBe(true);

    findButton('Pausar')?.click();
    await render();
    expect(state.timerStatus()).toBe('paused');

    findButton('Reprendre')?.click();
    await render();
    expect(state.isTimerRunning()).toBe(true);
  });
});
