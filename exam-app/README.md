# ExamApp — Qüestionari de coneixements (Angular)

SPA en Angular (standalone components) para realizar exámenes tipo test sincronizados con un visor PDF.
Especificación: [`docs/specs/exam_app_architecture_spec.md`](../docs/specs/exam_app_architecture_spec.md).

Esta fase (Fase 2) contiene el workspace, el modelo de datos con el JSON del examen real y la
maquetación responsive split-screen: panel de preguntas a la izquierda y visor PDF a la derecha
(50/50 en escritorio, pestañas en móvil).

## Stack

| Pieza | Versión |
| --- | --- |
| Angular | 22.2 (standalone, TypeScript estricto) |
| Angular Material | 22.2 (tema precompilado `azure-blue`) |
| Tailwind CSS | 4.x (vía `@tailwindcss/postcss`) |
| Visor PDF | `pdfjs-dist` 6.x (se integra en la Fase 3) |
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
├── app.ts / app.html        # shell: cabecera + layout split-screen (Tailwind)
├── components/
│   ├── question-panel/      # columna izquierda: pregunta, opciones y navegación
│   └── pdf-viewer/          # columna derecha: visor del temario (iframe en F2)
├── models/exam.model.ts     # ExamConfig, ExamQuestion, PdfReference
├── data/exam-data.json      # examen real (80 preguntas, Model A)
└── data/exam-data.spec.ts   # validación del JSON contra el modelo
public/documents/
└── questionari-coneixements-model-a.pdf   # cuadernillo servido al visor (31 pág.)
scripts/                     # utilidades de extracción/regeneración de datos
```

### Layout split-screen

- Escritorio (`lg`, ≥ 1024 px): dos columnas iguales con `lg:grid lg:grid-cols-2`.
- Móvil / tablet: pestañas «Preguntes» / «Temari PDF» que alternan la columna visible
  (`pane--collapsed`). La maquetación se valida en `src/app/app.spec.ts`.

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

> **Nota (pendiente Fase 3):** `src/app/data/exam-data.json` define `pdfUrl` como ruta absoluta
> (`/documents/...`). Para que el visor PDF funcione bajo el subpath de Pages habrá que convertirla
> en relativa (`documents/...`) o derivarla del `base href` cuando se integre el visor.
