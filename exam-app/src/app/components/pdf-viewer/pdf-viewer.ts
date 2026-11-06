import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  computed,
  output,
  signal,
} from '@angular/core';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

/**
 * Rutas de los recursos de PDF.js copiados desde `node_modules` a los assets del
 * build (ver `angular.json`). Siempre se resuelven contra la ruta base del
 * documento para que funcionen también si la aplicación se publica en un
 * subdirectorio (p. ej. GitHub Pages).
 */
const PDFJS_WORKER_PATH = 'pdfjs/pdf.worker.min.mjs';
const PDFJS_CMAPS_PATH = 'pdfjs/cmaps/';
const PDFJS_STANDARD_FONTS_PATH = 'pdfjs/standard_fonts/';
const PDFJS_WASM_PATH = 'pdfjs/wasm/';
const PDFJS_ICCS_PATH = 'pdfjs/iccs/';

const MIN_SCALE = 0.4;
const MAX_SCALE = 4;
/** Anchura A4 en puntos, usada como referencia mientras no hay layout disponible. */
const A4_WIDTH_IN_POINTS = 595.28;
const SURFACE_PADDING = 16;
const RENDER_DPI_LIMIT = 2;
const RESIZE_THRESHOLD = 8;
const RESIZE_DEBOUNCE_MS = 120;

/** El módulo se importa de forma diferida para no cargar PDF.js en el bundle inicial. */
let pdfjsModule: Promise<typeof import('pdfjs-dist')> | null = null;
let workerConfigured = false;

function loadPdfJs(): Promise<typeof import('pdfjs-dist')> {
  pdfjsModule ??= import('pdfjs-dist');
  return pdfjsModule;
}

function assetUrl(path: string): string {
  return new URL(path, document.baseURI).toString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function describeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'error desconegut';
}

function isRenderingCancelled(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'RenderingCancelledException';
}

/**
 * Visor de PDF basado en `pdfjs-dist`.
 *
 * Renderiza una página del documento en un canvas ajustado al ancho disponible y
 * expone `goToPage(page)` para saltar a una página concreta desde otros
 * componentes (por ejemplo, desde las referencias del cuestionario). Cada
 * cambio de página efectivo se notifica con el evento `pageChange`.
 */
@Component({
  selector: 'app-pdf-viewer',
  templateUrl: './pdf-viewer.html',
  styleUrl: './pdf-viewer.scss',
})
export class PdfViewer implements AfterViewInit, OnChanges, OnDestroy {
  /** URL del PDF a mostrar (normalmente servida desde `public/`). */
  @Input({ required: true }) pdfUrl!: string;
  /** Página que se muestra al cargar el documento (1-based). */
  @Input() initialPage = 1;

  /** Emite la página (1-based) cada vez que el visor muestra una nueva. */
  readonly pageChange = output<number>();

  readonly currentPage = signal(1);
  readonly pageCount = signal(0);
  readonly loading = signal(false);
  readonly rendering = signal(false);
  readonly error = signal<string | null>(null);

  readonly hasPrevious = computed(() => this.currentPage() > 1 && this.pageCount() > 0);
  readonly hasNext = computed(() => this.currentPage() < this.pageCount());

  @ViewChild('canvas') private canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('surface') private surfaceRef?: ElementRef<HTMLDivElement>;

  private document: PDFDocumentProxy | null = null;
  private loadingTask: PDFDocumentLoadingTask | null = null;
  private renderTask: RenderTask | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRenderWidth = 0;
  private renderedPage: number | null = null;
  private pendingPage: number | null = null;
  private loadSequence = 0;
  private renderSequence = 0;
  private viewReady = false;
  private destroyed = false;

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (typeof ResizeObserver !== 'undefined' && this.surfaceRef) {
      this.resizeObserver = new ResizeObserver(() => this.onSurfaceResize());
      this.resizeObserver.observe(this.surfaceRef.nativeElement);
    }
    void this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.viewReady) {
      return;
    }
    if (changes['pdfUrl'] && !changes['pdfUrl'].firstChange) {
      void this.load();
      return;
    }
    if (changes['initialPage'] && !changes['initialPage'].firstChange) {
      void this.goToPage(this.initialPage);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.loadSequence++;
    this.renderSequence++;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.resizeTimer !== null) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
    this.cancelRender();
    const loadingTask = this.loadingTask;
    this.loadingTask = null;
    this.document = null;
    void loadingTask?.destroy().catch(() => undefined);
  }

  /**
   * Salta a la página indicada (1-based). El número se ajusta al rango válido del
   * documento, de modo que `goToPage(0)` muestra la primera página y
   * `goToPage(999)` la última. Si el documento aún se está cargando, el salto se
   * aplica en cuanto termina la carga.
   */
  async goToPage(page: number): Promise<void> {
    const requested = Number.isFinite(page) ? Math.trunc(page) : 1;
    const total = this.pageCount();
    if (total === 0) {
      this.pendingPage = Math.max(requested, 1);
      return;
    }
    const target = clamp(requested, 1, total);
    this.currentPage.set(target);
    if (this.renderedPage === target) {
      return;
    }
    await this.renderPage(target);
    if (this.renderedPage === target) {
      this.pageChange.emit(target);
    }
  }

  async previousPage(): Promise<void> {
    await this.goToPage(this.currentPage() - 1);
  }

  async nextPage(): Promise<void> {
    await this.goToPage(this.currentPage() + 1);
  }

  private async load(): Promise<void> {
    const sequence = ++this.loadSequence;
    this.cancelRender();
    await this.releaseDocument();
    if (sequence !== this.loadSequence) {
      return;
    }
    this.resetView();
    if (!this.pdfUrl) {
      return;
    }

    this.loading.set(true);
    try {
      const pdfjs = await loadPdfJs();
      if (sequence !== this.loadSequence || this.destroyed) {
        return;
      }
      this.configureWorker(pdfjs);
      const loadingTask = pdfjs.getDocument({
        url: this.pdfUrl,
        cMapUrl: assetUrl(PDFJS_CMAPS_PATH),
        cMapPacked: true,
        standardFontDataUrl: assetUrl(PDFJS_STANDARD_FONTS_PATH),
        wasmUrl: assetUrl(PDFJS_WASM_PATH),
        iccUrl: assetUrl(PDFJS_ICCS_PATH),
      });
      this.loadingTask = loadingTask;
      const document = await loadingTask.promise;
      if (sequence !== this.loadSequence || this.destroyed) {
        void loadingTask.destroy().catch(() => undefined);
        return;
      }
      this.document = document;
      this.pageCount.set(document.numPages);
      this.loading.set(false);
      const initial = this.pendingPage ?? this.initialPage;
      this.pendingPage = null;
      await this.goToPage(initial);
    } catch (error) {
      if (sequence !== this.loadSequence || this.destroyed) {
        return;
      }
      this.loading.set(false);
      this.error.set(`No s'ha pogut carregar el document PDF: ${describeError(error)}`);
    }
  }

  private async renderPage(pageNumber: number): Promise<void> {
    const document = this.document;
    const canvas = this.canvasRef?.nativeElement;
    if (!document || !canvas) {
      return;
    }

    const sequence = ++this.renderSequence;
    this.cancelRender();
    this.rendering.set(true);
    try {
      const page = await document.getPage(pageNumber);
      if (sequence !== this.renderSequence || this.document !== document) {
        return;
      }
      const width = this.availableWidth();
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = clamp(width / baseViewport.width, MIN_SCALE, MAX_SCALE);
      const viewport = page.getViewport({ scale });
      const ratio = Math.min(window.devicePixelRatio || 1, RENDER_DPI_LIMIT);
      const targetWidth = Math.floor(viewport.width * ratio);
      const targetHeight = Math.floor(viewport.height * ratio);
      if (canvas.width !== targetWidth) {
        canvas.width = targetWidth;
      }
      if (canvas.height !== targetHeight) {
        canvas.height = targetHeight;
      }
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const task = page.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      this.renderTask = task;
      await task.promise;
      if (sequence !== this.renderSequence) {
        return;
      }
      this.renderTask = null;
      this.renderedPage = pageNumber;
      this.lastRenderWidth = width;
      this.error.set(null);
    } catch (error) {
      if (isRenderingCancelled(error) || sequence !== this.renderSequence) {
        return;
      }
      this.renderedPage = null;
      this.error.set(`No s'ha pogut renderitzar la pàgina ${pageNumber}: ${describeError(error)}`);
    } finally {
      if (sequence === this.renderSequence) {
        this.rendering.set(false);
      }
    }
  }

  private configureWorker(pdfjs: typeof import('pdfjs-dist')): void {
    if (workerConfigured) {
      return;
    }
    pdfjs.GlobalWorkerOptions.workerSrc = assetUrl(PDFJS_WORKER_PATH);
    workerConfigured = true;
  }

  private async releaseDocument(): Promise<void> {
    const loadingTask = this.loadingTask;
    this.loadingTask = null;
    this.document = null;
    if (!loadingTask) {
      return;
    }
    try {
      await loadingTask.destroy();
    } catch {
      // El documento ya estaba liberado: no hay nada que hacer.
    }
  }

  private resetView(): void {
    this.currentPage.set(1);
    this.pageCount.set(0);
    this.loading.set(false);
    this.rendering.set(false);
    this.error.set(null);
    this.renderedPage = null;
    this.lastRenderWidth = 0;
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
      canvas.style.removeProperty('width');
      canvas.style.removeProperty('height');
    }
  }

  private availableWidth(): number {
    // Se redondea a píxel entero para que el canvas quepa exactamente en el
    // contenedor y no aparezca una barra de scroll horizontal por subpíxeles.
    const measured = Math.floor(
      (this.surfaceRef?.nativeElement.clientWidth ?? 0) - SURFACE_PADDING * 2,
    );
    return measured > 0 ? measured : A4_WIDTH_IN_POINTS - SURFACE_PADDING * 2;
  }

  private onSurfaceResize(): void {
    if (!this.document) {
      return;
    }
    if (this.resizeTimer !== null) {
      clearTimeout(this.resizeTimer);
    }
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      if (!this.document) {
        return;
      }
      if (Math.abs(this.availableWidth() - this.lastRenderWidth) < RESIZE_THRESHOLD) {
        return;
      }
      void this.renderPage(this.currentPage());
    }, RESIZE_DEBOUNCE_MS);
  }

  private cancelRender(): void {
    const task = this.renderTask;
    this.renderTask = null;
    task?.cancel();
  }
}
