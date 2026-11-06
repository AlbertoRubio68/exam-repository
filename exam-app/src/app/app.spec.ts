import { ComponentFixture, TestBed } from '@angular/core/testing';
import { App } from './app';
import examData from './data/exam-data.json';
import { ExamConfig } from './models/exam.model';

const exam = examData as unknown as ExamConfig;

describe('App (maquetación split-screen)', () => {
  let fixture: ComponentFixture<App>;
  let element: HTMLElement;

  function pane(testId: 'pane-questions' | 'pane-pdf'): HTMLElement {
    return element.querySelector(`[data-testid="${testId}"]`) as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  it('muestra el título del examen y el número de preguntas', () => {
    expect(element.querySelector('h1')?.textContent).toContain('Agents Rurals');
    expect(element.textContent).toContain(`${exam.questions.length} preguntes`);
  });

  it('maqueta dos columnas: panel de preguntas a la izquierda y visor PDF a la derecha', () => {
    const panes = element.querySelectorAll('[data-testid^="pane-"]');
    expect(panes.length).toBe(2);
    expect(panes[0].querySelector('app-question-panel')).toBeTruthy();
    expect(panes[1].querySelector('app-pdf-viewer')).toBeTruthy();

    // 50/50 en escritorio: dos columnas iguales declaradas con Tailwind.
    expect(element.querySelector('main')?.className).toContain('lg:grid-cols-2');
  });

  it('en móvil arranca en preguntas y las pestañas alternan la columna visible', () => {
    expect(pane('pane-questions').classList.contains('pane--collapsed')).toBe(false);
    expect(pane('pane-pdf').classList.contains('pane--collapsed')).toBe(true);

    (element.querySelector('[data-testid="tab-pdf"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(pane('pane-questions').classList.contains('pane--collapsed')).toBe(true);
    expect(pane('pane-pdf').classList.contains('pane--collapsed')).toBe(false);

    (element.querySelector('[data-testid="tab-questions"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(pane('pane-questions').classList.contains('pane--collapsed')).toBe(false);
    expect(pane('pane-pdf').classList.contains('pane--collapsed')).toBe(true);
  });

  it('la navegación del panel actualiza la pregunta mostrada', () => {
    const statement = () => element.querySelector('app-question-panel h2')?.textContent?.trim();

    expect(statement()).toBe(exam.questions[0].question);

    (element.querySelector('[data-testid="next-question"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(statement()).toBe(exam.questions[1].question);
  });
});
