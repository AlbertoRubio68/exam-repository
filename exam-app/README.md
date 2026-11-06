# ExamApp — Qüestionari de coneixements (Angular)

SPA en Angular (standalone components) para realizar exámenes tipo test sincronizados con un visor PDF.
Especificación: [`docs/specs/exam_app_architecture_spec.md`](../docs/specs/exam_app_architecture_spec.md).

Esta fase contiene el workspace, el modelo de datos, el JSON con el examen real y el visor PDF integrado (Fase 3).

## Stack

| Pieza | Versión |
| --- | --- |
| Angular | 22.2 (standalone, TypeScript estricto) |
| Angular Material | 22.2 (tema precompilado `azure-blue`) |
| Tailwind CSS | 4.x (vía `@tailwindcss/postcss`) |
| Visor PDF | `pdfjs-dist` 6.x (visor PDF.js en canvas, Fase 3) |
| Tests | Vitest + jsdom (`ng test`) |

## Puesta en marcha

```bash
npm install
npm start        # http://localhost:4200
npm run build    # build de producción en dist/
npx ng test --watch=false
```

## Estructura

```
src/app/
├── models/exam.model.ts     # ExamConfig, ExamQuestion, PdfReference
├── data/exam-data.json      # examen real (80 preguntas, Model A)
├── data/exam-data.spec.ts   # validación del JSON contra el modelo
└── components/pdf-viewer/   # visor PDF.js (PdfViewer)
public/documents/
└── questionari-coneixements-model-a.pdf   # cuadernillo servido al visor (31 pág.)
scripts/                     # utilidades de extracción/regeneración de datos
```

## Visor PDF (Fase 3)

`PdfViewer` (`app-pdf-viewer`) es un componente standalone que renderiza el PDF
con `pdfjs-dist` sobre un `<canvas>`:

```html
<app-pdf-viewer
  [pdfUrl]="'documents/questionari-coneixements-model-a.pdf'"
  [initialPage]="1"
  (pageChange)="onPageChange($event)"
/>
```

- `goToPage(page: number)` es el método público de salto: ajusta el número al
  rango válido (`1..numPages`) y, si el documento aún se está cargando, aplica el
  salto en cuanto termina la carga.
- `pageChange` emite la página (1-based) cada vez que el visor muestra una nueva.
- `goToPage` está pensado para conectarse desde otros componentes (referencias
  del cuestionario o revisión) mediante `@ViewChild`, o registrando el visor en
  el servicio de navegación de la Fase 4 con
  `registerViewer((page) => viewer.goToPage(page))`.
- El ancho de página se adapta al contenedor y se re-renderiza al redimensionar.

Los recursos auxiliares de PDF.js (worker, `cmaps`, `standard_fonts`, `wasm` e
`iccs`) se copian desde `node_modules/pdfjs-dist` a `/pdfjs/**` en el build
(ver `assets` en `angular.json`), resolviéndose con rutas relativas a la base del
documento para funcionar también bajo un subdirectorio (GitHub Pages). El módulo
`pdfjs-dist` se importa de forma diferida, por lo que queda en un chunk aparte.

## Datos del examen

`src/app/data/exam-data.json` se ha generado a partir de los documentos oficiales
(convocatoria 01/23, accés a l'escala bàsica del Cos d'Agents Rurals):

- `Annex-1.-Queestionari-de-coneixements-model-A.pdf` → enunciados y opciones (80 preguntas, págs. 3-27).
- `Annex-1.Plantilles-correccio_modificades.pdf` → columna **Model A** de la plantilla de corrección.

Detalles relevantes:

- Las opciones se guardan sin la letra (`options[0]` = opción A) y `correctAnswer` es el índice 0-based.
- 5 preguntas están anuladas (`19, 26, 39, 46, 56`): `correctAnswer` es `null` y `annulled` es `true`.
- La pregunta 21 tiene un cambio de respuesta oficial: la correcta es la B, no la D.
- `pdfReference.page` es la página del PDF donde aparece cada pregunta.
- Las preguntas 81-88 de la plantilla son de reserva y el test aptitudinal (numeración 1-8 al final
  del cuadernillo) queda fuera de este JSON: la plantilla de corrección no los incluye.

### Regenerar el JSON

Los scripts usan `pdfjs-dist` para extraer texto y coordenadas de los PDF originales:

```bash
node scripts/extract-pdf-pages.mjs <cuadernillo.pdf> /tmp/questions.json
node scripts/extract-pdf-rows.mjs  <plantilla.pdf>   /tmp/corrections.json
node scripts/build-exam-data.mjs /tmp/questions.json /tmp/corrections.json src/app/data/exam-data.json
```

`build-exam-data.mjs` falla si el número de preguntas, las opciones o las respuestas de la plantilla no cuadran,
de modo que el JSON no se puede generar a medias.
