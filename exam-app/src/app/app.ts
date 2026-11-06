import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { PdfViewer } from './components/pdf-viewer/pdf-viewer';
import { QuestionPanel } from './components/question-panel/question-panel';
import examData from './data/exam-data.json';
import { ExamConfig } from './models/exam.model';

/** Columna visible en pantallas pequeñas; en `lg` se muestran las dos a la vez. */
export type SplitPaneView = 'questions' | 'pdf';

const exam = examData as unknown as ExamConfig;

/**
 * Shell de la aplicación: cabecera + layout split-screen 50/50 (preguntas | visor PDF).
 *
 * En móvil (< 1024px) las dos columnas no caben, así que se alternan mediante pestañas
 * (ver `docs/specs/exam_app_architecture_spec.md` §5.4).
 */
@Component({
  selector: 'app-root',
  imports: [QuestionPanel, PdfViewer],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly exam = exam;
  protected readonly totalQuestions = exam.questions.length;
  protected readonly currentIndex = signal(0);
  protected readonly view = signal<SplitPaneView>('questions');

  protected showQuestions(): void {
    this.view.set('questions');
  }

  protected showPdf(): void {
    this.view.set('pdf');
  }

  /** Recibe la navegación emitida por el panel de preguntas. */
  protected selectQuestion(index: number): void {
    this.currentIndex.set(index);
  }
}
