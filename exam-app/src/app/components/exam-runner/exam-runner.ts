import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import examData from '../../data/exam-data.json';
import { ExamConfig, ExamQuestion } from '../../models/exam.model';
import { ExamStateService } from '../../services/exam-state.service';
import {
  PdfDocument,
  PdfNavigationService,
  PdfPageTarget,
  buildPdfPageLink,
  resolvePdfUrl,
} from '../../services/pdf-navigation.service';
import { ExamResults } from '../exam-results/exam-results';
import { PdfViewer } from '../pdf-viewer/pdf-viewer';
import { QuestionPanel } from '../question-panel/question-panel';

/** Columna visible en pantallas pequeñas; en `lg` se muestran las dos a la vez. */
export type SplitPaneView = 'questions' | 'pdf';

/**
 * Pantalla del examen (integración F2 + F3 + F4): cabecera con el temporizador y
 * el layout split-screen 50/50 (preguntas | visor PDF), con pestañas en móvil.
 *
 * Es la ruta raíz (`app.routes.ts`) y la única dueña del estado del examen:
 * respuestas, navegación y temporizador viven en `ExamStateService` (F4.1). El
 * panel izquierdo usa `QuestionPanel` (F2) y, al comprobar, `ExamResults`
 * (F4.2), que corrige con `gradeExam`. El panel derecho monta el visor real de
 * PDF.js (F3) y se registra en `PdfNavigationService` para que los saltos de
 * página se resuelvan dentro de la propia página, sin abrir pestañas nuevas.
 *
 * Cada pregunta apunta a la **guía de estudio** (`studyReference`), que es donde
 * se explica su contenido y la respuesta correcta. El visor puede cambiar entre
 * la guía y el cuadernillo del cuestionario; la página del cuadernillo
 * (`pdfReference`) solo se usa para consultar el enunciado original.
 */
@Component({
  selector: 'app-exam-runner',
  imports: [ExamResults, PdfViewer, QuestionPanel],
  templateUrl: './exam-runner.html',
  styleUrl: './exam-runner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamRunner implements AfterViewInit, OnDestroy {
  private readonly pdfNavigation = inject(PdfNavigationService);
  private readonly document = inject(DOCUMENT);

  /** Estado del examen en curso (respuestas, navegación, temporizador). */
  readonly state = inject(ExamStateService);

  /** Configuración del examen cargada desde `exam-data.json`. */
  readonly exam = examData as unknown as ExamConfig;

  /**
   * URLs absolutas de los PDF, resueltas contra el `base href` para que
   * funcionen igual en local y bajo el subdirectorio de GitHub Pages.
   */
  readonly studyPdfUrl = resolvePdfUrl(this.exam.studyPdfUrl);
  readonly questionnairePdfUrl = resolvePdfUrl(this.exam.pdfUrl);

  /** `true` cuando se ha pulsado "Comprovar resultats". */
  readonly checked = signal(false);

  /** Columna visible en móvil / tablet. */
  readonly view = signal<SplitPaneView>('questions');

  /** Documento que muestra el visor: la guía de estudio por defecto. */
  readonly activeDocument = signal<PdfDocument>('study');

  /** Página que el visor debe mostrar (1-based). */
  readonly targetPage = signal(1);

  /** Contador de peticiones de salto, para repetir saltos a la misma página. */
  readonly pageRequest = signal(0);

  /** URL del documento activo del visor. */
  readonly activePdfUrl = computed(() =>
    this.activeDocument() === 'study' ? this.studyPdfUrl : this.questionnairePdfUrl,
  );

  /** Pregunta visible, o `null` si el examen está vacío. */
  readonly current = this.state.currentQuestion;

  /** Número total de preguntas. */
  readonly total = this.state.totalQuestions;

  /** Contador de respuestas en singular o plural. */
  readonly answeredLabel = computed(() => {
    const answered = this.state.answeredCount();
    return answered === 1 ? '1 resposta' : `${answered} respostes`;
  });

  /** El botón de comprobación requiere al menos una respuesta. */
  readonly canCheck = computed(() => this.state.answeredCount() > 0);

  @ViewChild('pdfViewer') private pdfViewer?: PdfViewer;

  private unregisterViewer: (() => void) | null = null;

  constructor() {
    this.state.loadExam(this.exam, { autoStart: true });
  }

  /**
   * Conecta el visor real (F3) con el bus de navegación (F4.2). El registro se
   * libera en `ngOnDestroy` para no dejar referencias al componente destruido.
   */
  ngAfterViewInit(): void {
    this.unregisterViewer = this.pdfNavigation.registerViewer((target) =>
      this.applyNavigation(target),
    );
  }

  ngOnDestroy(): void {
    this.unregisterViewer?.();
    this.unregisterViewer = null;
  }

  protected showQuestions(): void {
    this.view.set('questions');
  }

  protected showPdf(): void {
    this.view.set('pdf');
  }

  /** Cambia el documento del visor manteniendo el contexto de la pregunta visible. */
  protected showDocument(document: PdfDocument): void {
    if (document === this.activeDocument()) {
      return;
    }
    const question = this.current();
    const page =
      document === 'study'
        ? (question?.studyReference.page ?? 1)
        : (question?.pdfReference.page ?? 1);
    this.activeDocument.set(document);
    this.targetPage.set(page);
    this.pageRequest.update((request) => request + 1);
    this.view.set('pdf');
  }

  /** Guarda la opción marcada por el usuario en el estado del examen. */
  protected selectAnswer(event: { questionId: number; optionIndex: number }): void {
    this.state.selectAnswer(event.questionId, event.optionIndex);
  }

  /** Navega a un índice concreto (el servicio acota el rango). */
  protected goToIndex(index: number): void {
    this.state.goToIndex(index);
  }

  /** Pausa o reanuda la cuenta atrás. */
  protected toggleTimer(): void {
    if (this.state.isTimerRunning()) {
      this.state.pauseTimer();
    } else {
      this.state.startTimer();
    }
  }

  /** Entrega el examen y muestra el panel de revisión. */
  protected check(): void {
    if (!this.canCheck() || this.checked()) {
      return;
    }
    this.state.finish();
    this.checked.set(true);
  }

  /** Reinicia el examen conservando el cuestionario. */
  protected retry(): void {
    this.state.reset();
    this.state.startTimer();
    this.checked.set(false);
    this.view.set('questions');
  }

  /**
   * Salta a la página de la guía de estudio de la pregunta visible.
   *
   * Con el visor conectado el salto es interno; sin visor se abre la guía en una
   * pestaña nueva en la página indicada.
   */
  protected openStudyReference(question: ExamQuestion | null = this.current()): void {
    if (!question) {
      return;
    }
    this.pdfNavigation.goToStudyPage(question.studyReference.page);
    if (!this.pdfNavigation.hasViewer) {
      this.document.defaultView?.open(
        buildPdfPageLink(this.studyPdfUrl, question.studyReference.page),
        '_blank',
        'noopener',
      );
    }
  }

  /**
   * Consulta la página del cuadernillo del cuestionario (referencia histórica).
   *
   * No es el botón de la guía: solo permite ver el enunciado original.
   */
  protected openQuestionnaireReference(question: ExamQuestion | null = this.current()): void {
    if (!question) {
      return;
    }
    this.pdfNavigation.goToQuestionnairePage(question.pdfReference.page);
    if (!this.pdfNavigation.hasViewer) {
      this.document.defaultView?.open(
        buildPdfPageLink(this.questionnairePdfUrl, question.pdfReference.page),
        '_blank',
        'noopener',
      );
    }
  }

  /** Salta a una página concreta de la guía de estudio (petición del panel de preguntas). */
  protected openStudyReferencePage(page: number): void {
    this.pdfNavigation.goToStudyPage(page);
    if (!this.pdfNavigation.hasViewer) {
      this.document.defaultView?.open(
        buildPdfPageLink(this.studyPdfUrl, page),
        '_blank',
        'noopener',
      );
    }
  }

  /**
   * Aplica un destino de navegación: cambia de documento si hace falta y salta de página.
   *
   * Si el documento no cambia se llama directamente a `goToPage()` del visor (salto
   * inmediato, sin esperar a la detección de cambios). Si cambia, basta con actualizar
   * los inputs: el visor recarga el PDF y aplica `initialPage` al terminar la carga.
   */
  private applyNavigation(target: PdfPageTarget): void {
    const switching = target.document !== this.activeDocument();
    this.activeDocument.set(target.document);
    this.targetPage.set(target.page);
    this.pageRequest.update((request) => request + 1);
    this.view.set('pdf');
    if (!switching) {
      void this.pdfViewer?.goToPage(target.page);
    }
  }
}
