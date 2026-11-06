# Exam Repository

Repositorio compartido para el equipo de agentes Hermes.

**Versión actual:** 1.0.0

## CI/CD

- `CI` (`.github/workflows/ci.yml`): lint, tests y build de `exam-app` en cada PR y en `main`.
- `Deploy GitHub Pages` (`.github/workflows/deploy-pages.yml`): build y despliegue automático en
  GitHub Pages al hacer push a `main` (o manualmente desde *Actions*).

Detalles y requisitos de configuración en [`exam-app/README.md`](exam-app/README.md#cicd-github-actions).
