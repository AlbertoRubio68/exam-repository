import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/**
 * Enlace entre el cuestionario/revisión y el visor de PDF (F3).
 *
 * El visor se registra con `registerViewer()` y recibe cada salto de página.
 * Si todavía no hay visor conectado (p. ej. mientras la F3 no está integrada),
 * los consumidores pueden usar `buildPdfPageLink()` para abrir el PDF en una
 * pestaña nueva directamente en la página solicitada.
 */
@Injectable({ providedIn: 'root' })
export class PdfNavigationService {
  private readonly requests = new Subject<number>();
  private viewer: ((page: number) => void) | null = null;

  /** Emite cada página solicitada (1-based). */
  get pageRequests(): Observable<number> {
    return this.requests.asObservable();
  }

  /** `true` cuando hay un visor PDF conectado y capaz de saltar de página. */
  get hasViewer(): boolean {
    return this.viewer !== null;
  }

  /**
   * Conecta el visor PDF (F3). Devuelve una función para desconectarlo; el
   * visor debe llamarla en `ngOnDestroy`.
   */
  registerViewer(handler: (page: number) => void): () => void {
    this.viewer = handler;
    return () => {
      if (this.viewer === handler) {
        this.viewer = null;
      }
    };
  }

  /**
   * Solicita el salto a una página concreta (1-based).
   *
   * Ignora valores no finitos o menores que 1 para no romper el visor.
   */
  goToPage(page: number): void {
    if (!Number.isFinite(page) || page < 1) {
      return;
    }
    const target = Math.trunc(page);
    this.requests.next(target);
    this.viewer?.(target);
  }
}

/**
 * Construye la URL del PDF apuntando a una página concreta mediante el
 * fragmento `#page=N`, que entienden los visores nativos de los navegadores.
 */
export function buildPdfPageLink(pdfUrl: string, page: number): string {
  const target = Math.max(1, Math.trunc(Number.isFinite(page) ? page : 1));
  const withoutFragment = pdfUrl.split('#')[0];
  return `${withoutFragment}#page=${target}`;
}

/**
 * Resuelve la ruta del PDF contra el `base href` del documento.
 *
 * El JSON de datos guarda una ruta relativa (`documents/...`) para que el
 * despliegue en un subdirectorio (GitHub Pages: `/exam-repository/`) siga
 * funcionando. Si la URL ya es absoluta (http/https) se devuelve tal cual.
 */
export function resolvePdfUrl(pdfUrl: string): string {
  if (!pdfUrl || /^[a-z][a-z0-9+.-]*:/i.test(pdfUrl)) {
    return pdfUrl;
  }
  try {
    return new URL(pdfUrl, document.baseURI).toString();
  } catch {
    return pdfUrl;
  }
}
