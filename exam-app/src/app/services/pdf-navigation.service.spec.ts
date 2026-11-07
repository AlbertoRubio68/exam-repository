import { TestBed } from '@angular/core/testing';
import { PdfNavigationService, buildPdfPageLink } from './pdf-navigation.service';

describe('PdfNavigationService', () => {
  let service: PdfNavigationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PdfNavigationService);
  });

  it('emite los saltos solicitados con documento y página', () => {
    const targets: { document: string; page: number }[] = [];
    service.pageRequests.subscribe((target) => targets.push(target));

    service.goToStudyPage(4);
    service.goToQuestionnairePage(12);

    expect(targets).toEqual([
      { document: 'study', page: 4 },
      { document: 'questionnaire', page: 12 },
    ]);
  });

  it('por defecto salta a la guía de estudio', () => {
    const targets: { document: string; page: number }[] = [];
    service.pageRequests.subscribe((target) => targets.push(target));

    service.goToPage(210);

    expect(targets).toEqual([{ document: 'study', page: 210 }]);
  });

  it('ignora páginas no válidas', () => {
    const targets: unknown[] = [];
    service.pageRequests.subscribe((target) => targets.push(target));

    service.goToPage(0);
    service.goToPage(-3);
    service.goToPage(Number.NaN);

    expect(targets).toEqual([]);
  });

  it('delega el salto en el visor PDF registrado', () => {
    const viewer = vi.fn();
    const unregister = service.registerViewer(viewer);

    expect(service.hasViewer).toBe(true);
    service.goToStudyPage(7);

    expect(viewer).toHaveBeenCalledWith({ document: 'study', page: 7 });
    unregister();
    expect(service.hasViewer).toBe(false);
  });

  it('no invoca un visor ya desregistrado', () => {
    const viewer = vi.fn();
    const unregister = service.registerViewer(viewer);
    unregister();

    service.goToPage(2);

    expect(viewer).not.toHaveBeenCalled();
  });
});

describe('buildPdfPageLink', () => {
  it('añade el fragmento #page a la URL del PDF', () => {
    expect(buildPdfPageLink('/documents/exam.pdf', 5)).toBe('/documents/exam.pdf#page=5');
  });

  it('sustituye un fragmento previo y normaliza páginas inválidas', () => {
    expect(buildPdfPageLink('/documents/exam.pdf#page=2', 9)).toBe('/documents/exam.pdf#page=9');
    expect(buildPdfPageLink('/documents/exam.pdf', 0)).toBe('/documents/exam.pdf#page=1');
  });
});
