# ExamApp — Qüestionari de coneixements (Angular)

SPA en Angular (standalone components) para realizar exámenes tipo test sincronizados con un visor PDF.
Especificación: [`docs/specs/exam_app_architecture_spec.md`](../docs/specs/exam_app_architecture_spec.md).

Esta fase (integración F2 + F3 + F4) reúne el workspace, el modelo de datos con el JSON del
examen real, la maquetación responsive split-screen (panel de preguntas a la izquierda y visor PDF
a la derecha, 50/50 en escritorio y pestañas en móvil) y el visor PDF.js integrado.

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
├── app.ts / app.html        # shell raíz: solo <router-outlet> (ruta raíz perezosa)
├── components/
│   ├── exam-runner/         # ruta raíz: cabecera, temporizador y split-screen (F2) + estado F4
│   ├── exam-results/        # revisión y corrección del examen (F4.2)
│   ├── question-panel/      # columna izquierda: pregunta, opciones y navegación
│   └── pdf-viewer/          # columna derecha: visor del temario con PDF.js
├── services/
│   ├── exam-state.service.ts       # respuestas, navegación y temporizador (F4.1)
│   ├── exam-scoring.ts             # gradeExam(): corrección pura (F4.2)
│   └── pdf-navigation.service.ts   # bus de salto de página al visor (F4.2/F3)
├── models/exam.model.ts     # ExamConfig, ExamQuestion, PdfReference, StudyReference
├── data/exam-data.json      # examen real (80 preguntas, Model A) + referencias a la guía
└── data/exam-data.spec.ts   # validación del JSON contra el modelo
public/documents/
├── questionari-coneixements-model-a.pdf   # cuadernillo del cuestionario (31 pág., dato histórico)
└── guia-estudi-agentrural.pdf             # guía de estudio (608 pág., destino de las preguntas)
scripts/                     # utilidades de extracción/regeneración de datos
└── study-references.json    # cartografía verificada pregunta → página de la guía
```

### Layout split-screen

- Escritorio (`lg`, ≥ 1024 px): dos columnas iguales con `lg:grid lg:grid-cols-2`.
- Móvil / tablet: pestañas «Preguntes» / «Temari PDF» que alternan la columna visible
  (`pane--collapsed`). La maquetación se valida en `exam-runner.spec.ts`.
- El panel derecho monta el visor real (`app-pdf-viewer`) y `ExamRunner` lo registra en
  `PdfNavigationService.registerViewer(...)`: los saltos de página del cuestionario y de la
  revisión se resuelven en el propio visor, sin abrir pestañas nuevas.

## Visor PDF (Fase 3)

`PdfViewer` (`app-pdf-viewer`) es un componente standalone que renderiza el PDF
con `pdfjs-dist` sobre un `<canvas>`:

```html
<app-pdf-viewer
  [pdfUrl]="'documents/guia-estudi-agentrural.pdf'"
  [initialPage]="210"
  [pageRequest]="requestId"
  (pageChange)="onPageChange($event)"
/>
```

- `goToPage(page: number)` es el método público de salto: ajusta el número al
  rango válido (`1..numPages`) y, si el documento aún se está cargando, aplica el
  salto en cuanto termina la carga.
- `initialPage` fija la página al cargar el documento; `pageRequest` es un contador que
  fuerza un nuevo salto a `initialPage` aunque el número no cambie (por ejemplo, al pulsar
  dos veces la referencia de la misma pregunta). Al cambiar `pdfUrl`, el visor recarga el
  documento y aplica `initialPage` vigente.
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
- `GUIA_ESTUDI_AGENTRURAL.pdf` → guía de estudio (608 páginas) con la explicación de cada pregunta.

Detalles relevantes:

- Las opciones se guardan sin la letra (`options[0]` = opción A) y `correctAnswer` es el índice 0-based.
- 5 preguntas están anuladas (`19, 26, 39, 46, 56`): `correctAnswer` es `null` y `annulled` es `true`.
- La pregunta 21 tiene un cambio de respuesta oficial: la correcta es la B, no la D.
- `pdfReference.page` es la página del cuadernillo donde aparece cada pregunta (**dato histórico**).
- `studyReference` es la página de la **guía de estudio** donde se explica la pregunta y su respuesta
  correcta: `{ page, label, anchor, needsReview? }`. Es la que usan los botones «Veure a la guia».
- Las preguntas 81-88 de la plantilla son de reserva y el test aptitudinal (numeración 1-8 al final
  del cuadernillo) queda fuera de este JSON: la plantilla de corrección no los incluye.

### Referencias a la guía de estudio

`scripts/study-references.json` es la fuente de la cartografía: 80 entradas con la página física
(1-based) del PDF de la guía, el tema/apartado, un fragmento literal (`anchor`) verificado sobre el
texto extraído del PDF y el método de asignación. `apply-study-references.mjs` la vuelca en
`exam-data.json`, valida las páginas (1..608) y regenera el informe de trazabilidad
[`docs/estudi-referencies-guia.md`](../docs/estudi-referencies-guia.md):

```bash
node scripts/apply-study-references.mjs
```

- `studyReference.needsReview: true` marca las referencias **aproximadas** (p. ej. catálogos que
  ocupan varias páginas): la UI las señala con la insignia «Referència aproximada».
- El PDF se sirve desde `public/documents/` con la ruta relativa
  `documents/guia-estudi-agentrural.pdf`, igual que el cuadernillo, para que el `base href` de
  GitHub Pages (`/exam-repository/`) se aplique también al visor y a los enlaces `#page=N`.
- El visor arranca mostrando la guía y permite alternar con el cuadernillo desde el selector
  «Guia d'estudi / Qüestionari»; el botón «Qüestionari» de la cabecera (y el enlace secundario de
  la revisión) salta a la página histórica del cuadernillo.

### Regenerar el JSON

Los scripts usan `pdfjs-dist` para extraer texto y coordenadas de los PDF originales:

```bash
node scripts/extract-pdf-pages.mjs <cuadernillo.pdf> /tmp/questions.json
node scripts/extract-pdf-rows.mjs  <plantilla.pdf>   /tmp/corrections.json
node scripts/build-exam-data.mjs /tmp/questions.json /tmp/corrections.json src/app/data/exam-data.json
```

`build-exam-data.mjs` falla si el número de preguntas, las opciones o las respuestas de la plantilla no cuadran,
de modo que el JSON no se puede generar a medias. Como `build-exam-data.mjs` no conoce la guía, después de
regenerar el JSON hay que volver a aplicar la cartografía:

```bash
node scripts/apply-study-references.mjs
```

## CI/CD (GitHub Actions)

El repositorio define dos workflows en `.github/workflows/`:

| Workflow | Fichero | Disparadores | Qué hace |
| --- | --- | --- | --- |
| CI | `ci.yml` | `push` a `main`, PRs contra `main`, manual | `npm ci` → `lint` → `test:ci` → `build` y publica el artefacto `exam-app-dist` |
| Deploy GitHub Pages | `deploy-pages.yml` | `push` a `main`, manual | `npm ci` → `lint` → `test:ci` → `build` con `--base-href` del sitio → despliegue en Pages |

Comandos locales equivalentes:

```bash
npm ci
npm run lint          # ESLint (angular-eslint + typescript-eslint, flat config)
npm run test:ci       # ng test --watch=false
npm run build
```

### Requisitos para el despliegue

El workflow `deploy-pages.yml` usa la fuente de publicación **GitHub Actions**:

1. En el repositorio: *Settings → Pages → Build and deployment → Source: **GitHub Actions***.
2. El entorno `github-pages` debe permitir el despliegue desde `main` (por defecto, sí).
3. GitHub Pages en repositorios **privados** requiere un plan de pago (Pro/Team/Enterprise).
4. El `base-href` se toma de `actions/configure-pages` (`base_path`), de modo que el sitio funciona
   tanto en `https://<usuario>.github.io/<repo>/` como con un dominio propio. Se genera además un
   `404.html` copia de `index.html` para el fallback de rutas SPA.

El despliegue solo se ejecuta cuando el build, el lint y los tests pasan.

> **Rutas del PDF:** `src/app/data/exam-data.json` guarda `pdfUrl` como ruta **relativa**
> (`documents/...`) y `resolvePdfUrl()` (en `pdf-navigation.service.ts`) la resuelve contra el
> `base href`. Así el visor y los enlaces `#page=N` funcionan tanto en local como bajo el
> subdirectorio de GitHub Pages (`/exam-repository/`).

## Corrección y revisión (F4.2)

La pantalla del examen (`src/app/components/exam-runner/`) permite responder, navegar entre
preguntas y pulsar **Comprovar resultats**. La corrección se muestra en
`src/app/components/exam-results/`: nota, aciertos, fallos, preguntas en blanco y anuladas, más
la revisión de cada pregunta con la respuesta marcada, la correcta y su justificación.

### Cálculo de resultados

`src/app/services/exam-scoring.ts` expone `gradeExam(questions, answers)`, una función pura sin
dependencias de Angular:

- Las preguntas anuladas (`annulled: true` / `correctAnswer: null`) no puntúan.
- Acierto: la opción marcada coincide con `correctAnswer`.
- Fallo: la opción marcada es válida pero distinta de la correcta.
- En blanco: sin respuesta o con un índice inexistente/fuera de rango.
- No hay penalización: `nota = aciertos / preguntas que puntúan × 10`.

`answers` acepta un `Map<number, number>` o un objeto plano `Record<number, number>` indexado por
`id` de pregunta, que es el contrato previsto con el estado del examen (F4.1).

### Salto a la página del PDF

Cada pregunta (panel de preguntas, revisión) es clicable y salta a su **guía de estudio**
(`studyReference.page`). El salto se delega en `src/app/services/pdf-navigation.service.ts`, que
emite un destino compuesto `{ document: 'study' | 'questionnaire', page }`:

- Con el visor PDF (F3) montado, este se registra una sola vez:

  ```ts
  private readonly unregister = this.pdfNavigation.registerViewer((target) =>
    this.applyNavigation(target),
  );
  // ngOnDestroy(): this.unregister();
  ```

  `applyNavigation` cambia el documento del visor (`activePdfUrl`) y la página destino; si el
  documento ya era el activo, llama directamente a `viewer.goToPage(page)`.

- `goToStudyPage(page)` es el salto a la guía; `goToQuestionnairePage(page)` conserva el acceso
  histórico al cuadernillo (botón «Qüestionari»), sin usarse para el botón de la guía.

- Sin visor conectado, el componente abre `<pdfUrl>#page=N` en una pestaña nueva (guía o
  cuadernillo según el destino). El componente también emite `referenceJumped` con el destino
  para que el contenedor pueda reaccionar sin usar el servicio.

