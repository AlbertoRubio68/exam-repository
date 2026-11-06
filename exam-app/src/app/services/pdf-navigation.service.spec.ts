import { TestBed } from '@angular/core/testing';
import { PdfNavigationService, buildPdfPageLink } from './pdf-navigation.service';

describe('PdfNavigationService', () => {
  let service: PdfNavigationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PdfNavigationService);
  });

  it('emite las páginas solicitadas a los suscriptores', () => {
    const pages: number[] = [];
    service.pageRequests.subscribe((page) => pages.push(page));

    service.goToPage(4);
    service.goToPage(12);

    expect(pages).toEqual([4, 12]);
  });

  it('ignora páginas no válidas', () => {
    const pages: number[] = [];
    service.pageRequests.subscribe((page) => pages.push(page));

    service.goToPage(0);
    service.goToPage(-3);
    service.goToPage(Number.NaN);

    expect(pages).toEqual([]);
  });

  it('delega el salto en el visor PDF registrado', () => {
    const viewer = vi.fn();
    const unregister = service.registerViewer(viewer);

    expect(service.hasViewer).toBe(true);
    service.goToPage(7);

    expect(viewer).toHaveBeenCalledWith(7);
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
