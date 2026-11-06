# ExamApp — Qüestionari de coneixements (Angular)

SPA en Angular (standalone components) para realizar exámenes tipo test sincronizados con un visor PDF.
Especificación: [`docs/specs/exam_app_architecture_spec.md`](../docs/specs/exam_app_architecture_spec.md).

Esta fase (Fase 1) contiene únicamente el workspace, el modelo de datos y el JSON con el examen real.

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
├── models/exam.model.ts     # ExamConfig, ExamQuestion, PdfReference
├── data/exam-data.json      # examen real (80 preguntas, Model A)
└── data/exam-data.spec.ts   # validación del JSON contra el modelo
public/documents/
└── questionari-coneixements-model-a.pdf   # cuadernillo servido al visor (31 pág.)
scripts/                     # utilidades de extracción/regeneración de datos
```

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
