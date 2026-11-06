# SemAn Robust

Suite de regresión e implementación inicial del analizador semántico contextual de CÍRCULO IA.

## Estado de implementación

- Motor real: `Kernels/semanticAnalyzer.js`.
- API heredada `analyze(question)` conservada para compatibilidad con AXIAL Kernel.
- Nueva API `analyzeFrame(input)` que produce Semantic Frame 0.3.1.
- Runner conectado por defecto al motor real; no utiliza simuladores.
- Validador estructural con acumulación de errores.
- Casos de regresión SEM-001 a SEM-006.
- GitHub Actions ejecuta pruebas unitarias y la suite contra el motor real.

## Ejecutar

Desde esta carpeta:

```bash
node --test tests/*.test.mjs
node run-regression.mjs
```

También se puede indicar otro módulo compatible:

```bash
node run-regression.mjs ./ruta/al/analizador.js
```

El módulo debe exportar `analyzeFrame(input)`, `analyze(input)` o `analyzeText(input)`.

## Casos

- SEM-001: afecto coloquial argentino.
- SEM-002: consulta tecnológica.
- SEM-003: autocrítica coloquial.
- SEM-004: instrucción ambigua que requiere guía.
- SEM-005: ironía contextual con contexto explícito.
- SEM-006: sarcasmo económico ante un aumento de precios.

## Contrato 0.3.1

Campos raíz requeridos: `originalText`, `normalizedText`, `language`, `languageConfidence`, `intent`, `intentConfidence`, `domain`, `domainConfidence`, `paraphrase`, `paraphraseNote`, `paraphraseConfidence`, `entities`, `topics`, `sentiment`, `tone`, `register`, `ambiguity`, `context`, `responseMode`, `modeReason`, `risk`, `routing`, `signals` y `analyzerVersion`.

La implementación actual es una primera capa determinista basada en reglas y contexto explícito. No debe confundirse con comprensión lingüística general ni con un modelo entrenado. Los subesquemas internos se mantienen deliberadamente acotados hasta contrastarlos con los consumidores del Semantic Frame.
