import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PdfNavigationService } from '../../services/pdf-navigation.service';
import { ExamRunner } from './exam-runner';

describe('ExamRunner', () => {
  let fixture: ComponentFixture<ExamRunner>;

  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const findButton = (label: string): HTMLButtonElement | undefined =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).find((button) => button.textContent?.includes(label));

  const checkButton = (): HTMLButtonElement | undefined => findButton('Comprovar resultats');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ExamRunner] }).compileComponents();
    fixture = TestBed.createComponent(ExamRunner);
    await render();
  });

  it('muestra la primera pregunta y el total del examen real', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Pregunta 1 de 80');
    expect(text).toContain('Qüestionari de coneixements');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[role="radio"]').length).toBe(
      4,
    );
  });

  it('mantiene desactivado "Comprovar resultats" hasta que hay una respuesta', async () => {
    expect(checkButton()?.disabled).toBe(true);

    (fixture.nativeElement as HTMLElement)
      .querySelectorAll<HTMLButtonElement>('[role="radio"]')
      .item(0)
      .click();
    await render();

    expect(checkButton()?.disabled).toBe(false);
  });

  it('corrige el examen al comprobar y muestra el panel de revisión', async () => {
    // La pregunta 1 (Model A) tiene como respuesta correcta la opción D (índice 3).
    (fixture.nativeElement as HTMLElement)
      .querySelectorAll<HTMLButtonElement>('[role="radio"]')
      .item(3)
      .click();
    await render();
    checkButton()?.click();
    await render();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-exam-results')).not.toBeNull();
    expect(compiled.textContent).toContain('1 de 75 preguntes correctes');
    expect(compiled.textContent).toContain('75');
  });

  it('vuelve al cuestionario al pulsar "Torna a intentar"', async () => {
    (fixture.nativeElement as HTMLElement)
      .querySelectorAll<HTMLButtonElement>('[role="radio"]')
      .item(3)
      .click();
    await render();
    checkButton()?.click();
    await render();

    findButton('Torna a intentar')?.click();
    await render();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-exam-results')).toBeNull();
    expect(compiled.textContent).toContain('Pregunta 1 de 80');
    expect(checkButton()?.disabled).toBe(true);
  });

  it('navega entre preguntas y salta a la página del PDF de la visible', async () => {
    const pdfNavigation = TestBed.inject(PdfNavigationService);
    const goToPage = vi.spyOn(pdfNavigation, 'goToPage');

    findButton('Següent')?.click();
    await render();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Pregunta 2 de 80');

    findButton('Anterior')?.click();
    await render();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Pregunta 1 de 80');

    vi.spyOn(window, 'open').mockReturnValue(null);
    findButton('Veure al temari')?.click();

    expect(goToPage).toHaveBeenCalledWith(3);
  });
});
