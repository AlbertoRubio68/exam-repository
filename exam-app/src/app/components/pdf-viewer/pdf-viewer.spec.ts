import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PdfViewer } from './pdf-viewer';

const PDF_URL = '/documents/questionari-coneixements-model-a.pdf';

function createViewer(): ComponentFixture<PdfViewer> {
  const fixture = TestBed.createComponent(PdfViewer);
  fixture.componentRef.setInput('pdfUrl', PDF_URL);
  fixture.detectChanges();
  return fixture;
}

function iframeSource(fixture: ComponentFixture<PdfViewer>): string {
  const iframe = (fixture.nativeElement as HTMLElement).querySelector('iframe');
  return iframe?.getAttribute('src') ?? '';
}

describe('PdfViewer', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PdfViewer] }).compileComponents();
  });

  it('embebe el PDF en la primera página y muestra el nombre del fichero', () => {
    const fixture = createViewer();
    const element = fixture.nativeElement as HTMLElement;

    expect(iframeSource(fixture)).toContain(PDF_URL);
    expect(iframeSource(fixture)).toContain('#page=1');
    expect(element.querySelector('iframe')?.getAttribute('title')).toContain(
      'questionari-coneixements-model-a.pdf',
    );
    expect(element.textContent).toContain('questionari-coneixements-model-a.pdf');
    expect(element.textContent).toContain('Pàgina 1');
    expect(element.querySelector('a')?.getAttribute('href')).toBe(PDF_URL);
  });

  it('goToPage() actualiza la página del visor', () => {
    const fixture = createViewer();

    fixture.componentInstance.goToPage(7);
    fixture.detectChanges();

    expect(fixture.componentInstance.currentPage()).toBe(7);
    expect(iframeSource(fixture)).toContain('#page=7');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Pàgina 7');
  });

  it('acota páginas menores que 1 e ignora valores no finitos', () => {
    const fixture = createViewer();

    fixture.componentInstance.goToPage(0);
    expect(fixture.componentInstance.currentPage()).toBe(1);

    fixture.componentInstance.goToPage(4);
    fixture.componentInstance.goToPage(Number.NaN);
    expect(fixture.componentInstance.currentPage()).toBe(4);
  });
});
