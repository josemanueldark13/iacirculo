# AXIAL RAG — arquitectura de cuatro núcleos

Versión: 1.1.0
Estado de código: implementado en rama de trabajo; ver pruebas CI al final.

## Principio de diseño

AXIAL separa la procedencia y autoridad del conocimiento. Los cuatro núcleos forman una jerarquía de recuperación. Cada evidencia conserva su nivel, fuente, URL y estado de verificación.

## Los cuatro núcleos

| Nivel | Núcleo | Corpus / mecanismo | Uso |
|---|---|---|---|
| N1 | Oficial | Documentación institucional propia, indexada localmente | Leyes, decretos, estatuto, autoridades, actas, historia y decisiones del Círculo |
| N2 | Bibliográfico | Catálogo académico, historiográfico, archivístico y editorial | Contextualizar, investigar, contrastar enfoques y ofrecer referencias |
| N3 | Web seleccionada | Allowlist de páginas HTTPS exactas; descarga y extracción HTML | Consultar universidades, revistas, bibliotecas, archivos y organismos seleccionados |
| N4 | Web abierta | Brave Search LLM Context API | Ampliar la búsqueda cuando N3 es insuficiente o cuando se solicita expresamente búsqueda libre |

## Cascada

1. El Kernel identifica intención, dominio y sensibilidad.
2. N1 recupera documentación institucional para hechos y normativa propios.
3. N2 complementa consultas históricas e historiográficas. En una consulta institucional histórica pueden activarse N1 y N2, manteniendo N1 como fuente primaria.
4. N3 busca páginas solo dentro de `knowledge/fuentesWebSeleccionadas.json`, descarga HTML, limpia el contenido, lo segmenta y recupera fragmentos con BM25.
5. Si N3 no obtiene texto suficiente, el compositor puede activar N4 cuando el plan permite fuentes externas. Si la persona solicita expresamente web abierta, N4 se ejecuta directamente.
6. El compositor común entrega evidencia, referencias y estado de cada núcleo a chat web y Messenger.

## Separación de autoridad

- N1 es la fuente primaria para hechos, decisiones y documentos propios de la institución.
- N2 aporta bibliografía y análisis secundario. No puede corregir por sí solo una ley, decreto, acta o autoridad vigente.
- N3 aporta contenido de sitios seleccionados. Su inclusión en la lista no los convierte en fuentes oficiales del Círculo.
- N4 aporta contexto externo descubierto en la web. Cada resultado conserva URL y extractos, pero se etiqueta como externo y pendiente de validación; nunca se presenta como documentación oficial.

## Corpus N1

La fuente institucional se mantiene en `knowledge/documentos.json`. `knowledge/documentRetriever.js` indexa título, categoría y contenido mediante el recuperador híbrido local. El Kernel expone los resultados como `recuperacion_oficial`.

## Corpus N2

El catálogo se mantiene en `knowledge/bibliografia.json`; búsqueda y formato en `knowledge/bibliografia.js`.

Estado del catálogo:
- 22 registros en total.
- 20 activos en recuperación automática.
- 18 con metadatos verificados en ficha editorial, repositorio académico, documento universitario o fuente institucional.
- 2 citas secundarias activas, identificadas explícitamente como referencias localizadas en bibliografía académica.
- 2 candidatos excluidos de recuperación automática hasta completar verificación.

Los registros conservan identificador, tipo, título, autoría, año (si está confirmado), publicación/editorial, ISBN/DOI, materias, palabras clave, síntesis, URL y fuente de verificación. Los candidatos no se recuperan automáticamente.

### Recuperación

`knowledge/hybridRetriever.js` implementa BM25 por campos, ponderación diferenciada de título/autoría/materias/resumen, normalización morfológica básica y segmentación de textos largos con solapamiento. N2 utiliza ese motor en `knowledge/bibliografia.js`.

## Corpus N3

Catálogo cerrado: `knowledge/fuentesWebSeleccionadas.json` (12 páginas activas).

Adaptador: `knowledge/webRetriever.js`.
- Solo admite URL HTTPS exacta presente en la allowlist.
- Bloquea redirecciones, protocolos no HTTPS y tipos de contenido no admitidos.
- Limita tamaño de respuesta y tiempo de espera.
- Descarta scripts, estilos, navegación y otros bloques no documentales.
- Recupera fragmentos con BM25 y conserva URL, organización y fecha de consulta.
- Mantiene caché en memoria por 30 minutos cuando la función permanece caliente.

Los PDF identificados en la lista se marcan como `pdf_ingestion_required`; no se finge haber leído su contenido.

## Núcleo N4

Adaptador: `knowledge/openWebRetriever.js`. Usa el endpoint oficial Brave `/res/v1/llm/context`, que entrega fragmentos de contenido preextraído y metadatos de fuentes para pipelines RAG.

Configuración de servidor:
- `BRAVE_SEARCH_API_KEY` — obligatoria.
- `BRAVE_SEARCH_COUNTRY` — por defecto `AR`.
- `BRAVE_SEARCH_LANG` — por defecto `es`.

La clave no se incluye en el repositorio ni se expone al cliente. El endpoint devuelve `grounding.generic` y `sources`; el adaptador conserva título, URL, host y extractos. Los resultados se etiquetan como `externa_no_verificada`.

## Compositor común

`knowledge/ragComposer.js` ensambla la respuesta de N1, N2, N3 y N4 y conserva la evidencia por núcleo. Está integrado tanto en `routes/chat.js` como en `routes/messenger.js`. La derivación humana y las respuestas conversacionales aprobadas siguen precediendo al RAG.

## Límites pendientes

- El buscador local es BM25 por campos, no embeddings/vector search. La normalización morfológica es deliberadamente ligera.
- El N1 actual sigue siendo un conjunto reducido de entradas de `documentos.json`; hace falta incorporar el archivo documental institucional completo.
- N2 cataloga y recupera resúmenes y metadatos; la descarga y extracción masiva de libros/PDF todavía no está implementada.
- N3 admite actualmente HTML y texto plano; los PDF quedan identificados y requieren un extractor documental.
- N4 está implementado, pero no ejecuta búsquedas reales mientras no esté configurada `BRAVE_SEARCH_API_KEY` en Vercel.
- No existe aún una interfaz de administración para subir, revisar y reindexar documentos; el catálogo se mantiene versionado en JSON.
- El cache N3 es de proceso, no persistente ni compartido entre instancias.

## Pruebas automatizadas

`npm run test:rag` y `npm test` validan:
- cuatro núcleos, prioridad N1 y recuperación N2;
- BM25, normalización castellana y segmentación;
- N3 con URLs exactas, extracción HTML y bloqueo de contenido no permitido;
- N4 con respuesta LLM Context simulada, URL y procedencia;
- compositor común N3/N4;
- regresión de 30 preguntas, lenguaje natural, seguridad, concurrencia y mensajería.

Las pruebas usan proveedores simulados: no gastan cuota de Brave ni requieren una clave. La conectividad real de N4 se valida después de configurar la clave en Vercel.
