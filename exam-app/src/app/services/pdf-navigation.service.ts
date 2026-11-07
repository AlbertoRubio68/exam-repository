import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/**
 * Documentos que puede mostrar el visor PDF (F3).
 *
 * - `study`: guía de estudio (`GUIA_ESTUDI_AGENTRURAL.pdf`), donde se explica el contenido
 *   de cada pregunta y su respuesta correcta. Es el destino de «Veure a la guia».
 * - `questionnaire`: cuadernillo del cuestionario (Modelo A). Se conserva como documento
 *   histórico; las preguntas ya no se referencian a sus páginas.
 */
export type PdfDocument = 'study' | 'questionnaire';

/** Petición de salto: documento de destino y página (1-based). */
export interface PdfPageTarget {
  /** Documento que debe mostrar el visor. */
  document: PdfDocument;
  /** Página destino (1-based) del documento. */
  page: number;
}

/**
 * Enlace entre el cuestionario/revisión y el visor de PDF (F3).
 *
 * El visor se registra con `registerViewer()` y recibe cada salto de página indicando
 * el documento y la página. Si todavía no hay visor conectado, los consumidores pueden
 * usar `buildPdfPageLink()` para abrir el PDF correspondiente en una pestaña nueva.
 */
@Injectable({ providedIn: 'root' })
export class PdfNavigationService {
  private readonly requests = new Subject<PdfPageTarget>();
  private viewer: ((target: PdfPageTarget) => void) | null = null;

  /** Emite cada salto solicitado (documento + página 1-based). */
  get pageRequests(): Observable<PdfPageTarget> {
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
  registerViewer(handler: (target: PdfPageTarget) => void): () => void {
    this.viewer = handler;
    return () => {
      if (this.viewer === handler) {
        this.viewer = null;
      }
    };
  }

  /**
   * Solicita el salto a una página concreta (1-based) de un documento.
   *
   * Ignora valores no finitos o menores que 1 para no romper el visor. Por defecto
   * salta a la guía de estudio, que es el documento de consulta de las preguntas.
   */
  goToPage(page: number, document: PdfDocument = 'study'): void {
    if (!Number.isFinite(page) || page < 1) {
      return;
    }
    const target: PdfPageTarget = { document, page: Math.trunc(page) };
    this.requests.next(target);
    this.viewer?.(target);
  }

  /** Salto a una página de la guía de estudio. */
  goToStudyPage(page: number): void {
    this.goToPage(page, 'study');
  }

  /** Salto a una página del cuadernillo del cuestionario (dato histórico). */
  goToQuestionnairePage(page: number): void {
    this.goToPage(page, 'questionnaire');
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
