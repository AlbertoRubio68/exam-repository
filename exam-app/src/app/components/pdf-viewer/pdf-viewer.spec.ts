import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pdfjs = vi.hoisted(() => ({
  getDocument: vi.fn(),
  getPage: vi.fn(),
  render: vi.fn(),
  cancelRender: vi.fn(),
  destroyDocument: vi.fn(),
  destroyLoadingTask: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: pdfjs.getDocument,
}));

import { PdfViewer } from './pdf-viewer';

const PDF_URL = '/documents/questionari-coneixements-model-a.pdf';

function fakePage(): {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: () => { promise: Promise<void>; cancel: () => void };
} {
  return {
    getViewport: ({ scale }) => ({ width: 595.28 * scale, height: 841.89 * scale }),
    render: () => pdfjs.render(),
  };
}

async function flush(fixture: ComponentFixture<PdfViewer>, rounds = 6): Promise<void> {
  for (let round = 0; round < rounds; round++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }
}

async function createViewer(setup?: () => void): Promise<ComponentFixture<PdfViewer>> {
  setup?.();
  const fixture = TestBed.createComponent(PdfViewer);
  fixture.componentRef.setInput('pdfUrl', PDF_URL);
  fixture.detectChanges();
  await flush(fixture);
  return fixture;
}

describe('PdfViewer', () => {
  beforeEach(() => {
    pdfjs.getDocument.mockReset();
    pdfjs.getPage.mockReset();
    pdfjs.render.mockReset();
    pdfjs.cancelRender.mockReset();
    pdfjs.destroyDocument.mockReset();
    pdfjs.destroyLoadingTask.mockReset();

    pdfjs.getPage.mockImplementation(async () => fakePage());
    pdfjs.render.mockImplementation(() => ({
      promise: Promise.resolve(),
      cancel: pdfjs.cancelRender,
    }));
    pdfjs.destroyDocument.mockResolvedValue(undefined);
    pdfjs.destroyLoadingTask.mockResolvedValue(undefined);
    pdfjs.getDocument.mockImplementation(() => ({
      promise: Promise.resolve({
        numPages: 31,
        getPage: pdfjs.getPage,
        destroy: pdfjs.destroyDocument,
      }),
      destroy: pdfjs.destroyLoadingTask,
    }));
  });

  it('carga el documento indicado y renderiza la primera página', async () => {
    const fixture = await createViewer();
    const viewer = fixture.componentInstance;

    expect(pdfjs.getDocument).toHaveBeenCalledWith(expect.objectContaining({ url: PDF_URL }));
    expect(viewer.pageCount()).toBe(31);
    expect(viewer.currentPage()).toBe(1);
    expect(pdfjs.getPage).toHaveBeenCalledWith(1);
    expect(pdfjs.render).toHaveBeenCalledTimes(1);
  });

  it('goToPage(page) renderiza la página solicitada y actualiza el contador', async () => {
    const fixture = await createViewer();
    const viewer = fixture.componentInstance;

    await viewer.goToPage(5);
    fixture.detectChanges();

    expect(viewer.currentPage()).toBe(5);
    expect(pdfjs.getPage).toHaveBeenLastCalledWith(5);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.pdf-viewer__pages')?.textContent,
    ).toContain('Pàgina 5 de 31');
  });

  it('ajusta el número de página al rango válido del documento', async () => {
    const fixture = await createViewer();
    const viewer = fixture.componentInstance;

    await viewer.goToPage(999);
    expect(viewer.currentPage()).toBe(31);

    await viewer.goToPage(0);
    expect(viewer.currentPage()).toBe(1);

    await viewer.goToPage(-4);
    expect(viewer.currentPage()).toBe(1);
  });

  it('los botones de navegación usan goToPage', async () => {
    const fixture = await createViewer();
    const viewer = fixture.componentInstance;
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      '.pdf-viewer__nav',
    );

    expect(buttons[0].disabled).toBe(true);
    buttons[1].click();
    await flush(fixture);

    expect(viewer.currentPage()).toBe(2);
    expect(pdfjs.getPage).toHaveBeenLastCalledWith(2);
    expect(buttons[0].disabled).toBe(false);

    buttons[0].click();
    await flush(fixture);
    expect(viewer.currentPage()).toBe(1);
  });

  it('respeta initialPage al cargar el documento', async () => {
    const fixture = TestBed.createComponent(PdfViewer);
    fixture.componentRef.setInput('pdfUrl', PDF_URL);
    fixture.componentRef.setInput('initialPage', 12);
    fixture.detectChanges();
    await flush(fixture);

    expect(fixture.componentInstance.currentPage()).toBe(12);
    expect(pdfjs.getPage).toHaveBeenLastCalledWith(12);
  });

  it('aplica un goToPage solicitado antes de terminar la carga', async () => {
    const fixture = TestBed.createComponent(PdfViewer);
    fixture.componentRef.setInput('pdfUrl', PDF_URL);
    fixture.detectChanges();

    await fixture.componentInstance.goToPage(7);
    await flush(fixture);

    expect(fixture.componentInstance.currentPage()).toBe(7);
    expect(pdfjs.getPage).toHaveBeenLastCalledWith(7);
  });

  it('un nuevo pageRequest vuelve a saltar a initialPage', async () => {
    const fixture = await createViewer();
    const viewer = fixture.componentInstance;
    const goToPage = vi.spyOn(viewer, 'goToPage');

    fixture.componentRef.setInput('pageRequest', 1);
    fixture.componentRef.setInput('initialPage', 9);
    fixture.detectChanges();

    expect(goToPage).toHaveBeenCalledWith(9);
  });

  it('al cambiar de documento carga el nuevo PDF y aplica initialPage', async () => {
    const fixture = await createViewer();

    fixture.componentRef.setInput('pdfUrl', '/documents/guia-estudi-agentrural.pdf');
    fixture.componentRef.setInput('initialPage', 12);
    fixture.componentRef.setInput('pageRequest', 1);
    fixture.detectChanges();
    await flush(fixture);

    expect(pdfjs.getDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: '/documents/guia-estudi-agentrural.pdf' }),
    );
    expect(fixture.componentInstance.currentPage()).toBe(12);
    expect(pdfjs.getPage).toHaveBeenLastCalledWith(12);
  });

  it('emite pageChange con cada página renderizada', async () => {
    const fixture = await createViewer();
    const emitted: number[] = [];
    fixture.componentInstance.pageChange.subscribe((page: number) => emitted.push(page));

    await fixture.componentInstance.goToPage(4);
    await fixture.componentInstance.goToPage(4);
    await fixture.componentInstance.goToPage(6);

    expect(emitted).toEqual([4, 6]);
  });

  it('muestra un error si una página no se puede renderizar', async () => {
    const fixture = await createViewer();
    pdfjs.getPage.mockRejectedValueOnce(new Error('pàgina corrupta'));

    await fixture.componentInstance.goToPage(3);
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toContain('pàgina corrupta');
    expect(fixture.componentInstance.rendering()).toBe(false);
  });

  it('muestra un error si el documento no se puede cargar', async () => {
    const fixture = await createViewer(() => {
      pdfjs.getDocument.mockImplementation(() => ({
        promise: Promise.reject(new Error('fitxer no trobat')),
        destroy: pdfjs.destroyLoadingTask,
      }));
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance.error()).toContain('fitxer no trobat');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('fitxer no trobat');
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('libera el documento al destruirse', async () => {
    const fixture = await createViewer();
    fixture.destroy();

    await vi.waitFor(() => expect(pdfjs.destroyLoadingTask).toHaveBeenCalled());
  });
});
