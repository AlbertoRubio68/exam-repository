import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

/**
 * Visor del temario PDF (columna derecha del layout split-screen).
 *
 * En esta fase (F2) se embebe el PDF con el visor nativo del navegador y se expone
 * `goToPage(page)`, que actualiza el fragmento `#page=N` del documento. La Fase 3 sustituirá
 * el `iframe` por `pdfjs-dist` manteniendo esta misma API pública (`pdfUrl` + `goToPage`).
 */
@Component({
  selector: 'app-pdf-viewer',
  templateUrl: './pdf-viewer.html',
  styleUrl: './pdf-viewer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfViewer {
  private readonly sanitizer = inject(DomSanitizer);

  /** URL del PDF servido desde `public/`. */
  readonly pdfUrl = input.required<string>();

  /** Página visible del documento (1-based). */
  private readonly page = linkedSignal(() => 1);

  readonly currentPage = this.page.asReadonly();

  /**
   * URL del visor embebido, apuntando a la página actual.
   *
   * Angular trata el `src` de un `iframe` como *resource URL* y bloquea valores no confiables
   * (error NG0904). La URL procede de la configuración local del examen, no de entrada del
   * usuario, por lo que se marca explícitamente como segura.
   */
  readonly embedUrl = computed<SafeResourceUrl>(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(`${this.pdfUrl()}#page=${this.page()}&view=FitH`),
  );

  /** Nombre del fichero PDF, para mostrarlo en la barra del visor. */
  readonly fileName = computed(() => this.pdfUrl().split('/').pop() ?? 'temari.pdf');

  /** Salta a la página indicada. Valores no finitos se ignoran y los menores que 1 se acotan. */
  goToPage(page: number): void {
    if (!Number.isFinite(page)) {
      return;
    }
    this.page.set(Math.max(1, Math.trunc(page)));
  }
}
