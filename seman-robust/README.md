# SemAn Robust

Módulo independiente de análisis semántico y validación de regresiones, alojado dentro del repositorio CÍRCULO IA para mantener una única base de trabajo sin mezclarlo con el runtime institucional.

## Estado

- Especificación de regresión: SEM-001 a SEM-006.
- Validador estructural con errores acumulados y protección ante campos ausentes.
- Runner desacoplado del motor: requiere un módulo analizador externo.
- No modifica el contrato Semantic Frame 0.3.1. `literalMeaning` e `intendedMeaning` quedan documentados como propuesta de evolución, no como campos obligatorios actuales.

## Ejecutar

Desde esta carpeta:

```bash
node run-regression.mjs ./ruta/al/analizador.mjs
```

El módulo indicado debe exportar `analyze` o `analyzeText`. La función puede ser síncrona o asíncrona y debe aceptar un objeto de entrada con `text` y, cuando corresponda, `conversationContext`.

El runner no incluye un simulador que se certifique a sí mismo. Sin un motor real, termina con error explícito.

## Casos

- SEM-001: afecto coloquial argentino.
- SEM-002: consulta tecnológica.
- SEM-003: autocrítica coloquial.
- SEM-004: instrucción ambigua que requiere guía.
- SEM-005: ironía contextual con contexto explícito.
- SEM-006: sarcasmo económico ante un aumento de precios.

## Contrato 0.3.1

Campos raíz requeridos: `originalText`, `normalizedText`, `language`, `languageConfidence`, `intent`, `intentConfidence`, `domain`, `domainConfidence`, `paraphrase`, `paraphraseNote`, `paraphraseConfidence`, `entities`, `topics`, `sentiment`, `tone`, `register`, `ambiguity`, `context`, `responseMode`, `modeReason`, `risk`, `routing`, `signals` y `analyzerVersion`.

La estructura interna de objetos como `ambiguity`, `context`, `routing` y `signals` debe alinearse con el motor real antes de endurecer sus subesquemas.
