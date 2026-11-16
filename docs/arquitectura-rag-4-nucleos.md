# AXIAL RAG — arquitectura de cuatro núcleos

Versión: 1.0.0

## Principio de diseño

AXIAL separa la procedencia y autoridad del conocimiento. Los cuatro núcleos no son cuatro listas equivalentes: forman una jerarquía de recuperación y verificación. Una respuesta debe conservar el núcleo consultado, la fuente concreta y el estado de verificación.

## Los cuatro núcleos

| Nivel | Núcleo | Corpus / mecanismo | Uso |
|---|---|---|---|
| N1 | Oficial | Documentos institucionales propios y documentos oficiales | Leyes, decretos, estatuto, autoridades, actas, historia y decisiones del Círculo |
| N2 | Bibliográfico | Catálogo de libros, artículos académicos, tesis, colecciones, fuentes históricas y fondos bibliotecarios | Contextualizar, investigar, contrastar enfoques historiográficos y ofrecer referencias |
| N3 | Web seleccionada | Lista cerrada de páginas autorizadas por tema y URL exacta | Consultar universidades, revistas académicas, bibliotecas, museos y organismos previamente seleccionados |
| N4 | Web abierta | Búsqueda externa sin lista cerrada | Último recurso cuando N3 no responde suficientemente, o cuando la persona solicita expresamente búsqueda libre |

## Cascada

1. El Kernel identifica intención, dominio y sensibilidad.
2. N1 se consulta para hechos institucionales y normativos.
3. N2 complementa consultas históricas, historiográficas y de investigación. En una consulta institucional histórica pueden activarse N1 y N2, conservando N1 como fuente primaria.
4. N3 se habilita para búsqueda externa controlada y selecciona páginas exclusivamente desde `knowledge/fuentesWebSeleccionadas.json`.
5. N4 no se activa automáticamente por la mera mención de actualidad o internet. Se habilita cuando el adaptador N3 informa insuficiencia (`n3Insufficient: true`) o cuando la persona pide expresamente búsqueda libre.

## Separación de autoridad

- N1 es la fuente primaria para la posición y los hechos propios de la institución.
- N2 aporta bibliografía y análisis secundario. No puede corregir por sí solo el contenido de una ley, decreto, acta o autoridad vigente.
- N3 aporta páginas seleccionadas. El hecho de pertenecer a la lista no convierte a una página en fuente oficial del Círculo.
- N4 requiere evaluación de la fuente, fecha, autoría, corroboración y citas visibles. Los resultados abiertos no se presentan como documentación oficial.

## Corpus N2

El catálogo se mantiene en `knowledge/bibliografia.json`; el motor de búsqueda y formato en `knowledge/bibliografia.js`.

Cada registro conserva, cuando está disponible:
- identificador estable, tipo de documento y título;
- autores o responsables;
- año, publicación, editorial, páginas, DOI e ISBN;
- materias, palabras clave y síntesis;
- URL de consulta y URL/fuente de verificación;
- condición de acceso;
- estado de metadatos y notas de verificación.

Estados:
- `verificado_en_ficha_editorial`: metadatos contrastados con la ficha editorial o de revista.
- `verificado_en_fuente_institucional` / `verificado_en_catalogo_institucional`: datos informados por la biblioteca, universidad, museo u organismo indicado.
- `referencia_citada_en_bibliografia_academica`: referencia localizada en una bibliografía secundaria; no implica que se haya verificado el ejemplar.
- `cita_secundaria_pendiente_de_verificacion`: candidato no utilizable automáticamente.
- `record_status: candidate`: excluido de la recuperación automática hasta completar su verificación.

## Corpus N3

El catálogo cerrado se mantiene en `knowledge/fuentesWebSeleccionadas.json`. Cada registro identifica organización, URL exacta, tipo de fuente, nivel de confianza, temas y motivo de selección. Agregar un dominio o una página requiere revisión editorial y técnica.

## Contrato de recuperación

`ragRouter.route()` devuelve:
- `architecture` y versión;
- núcleos disponibles y módulos seleccionados;
- prioridad y fallbacks;
- páginas N3 seleccionadas;
- estado de elegibilidad/activación de N4;
- política de autoridad y procedencia.

`knowledge/bibliografia.search()` devuelve registros N2 puntuados, citas y metadatos de procedencia. El Kernel expone esos resultados como `recuperacion_bibliografica`.

## Límites actuales

- La recuperación local N2 está implementada mediante coincidencia y puntuación léxica ponderada; todavía no es búsqueda semántica vectorial.
- N3 actualmente selecciona y expone páginas de una allowlist. Falta el adaptador que descargue, limpie, fragmente y recupere el contenido real de esas páginas.
- N4 tiene reglas de habilitación y trazabilidad previstas; falta conectar un proveedor de búsqueda abierta y su evaluador de fuentes.
- No se debe afirmar que N3 o N4 consultaron contenido mientras esos adaptadores no estén conectados.
- La generación de respuestas sintetizadas con varias citas requiere una etapa posterior de composición y control de evidencia.

## Pruebas

`npm run test:rag` valida:
- identificación de los cuatro núcleos;
- prioridad oficial N1;
- recuperación de registros N2 y metadatos;
- selección de URL N3 de la lista controlada;
- bloqueo de N4 hasta insuficiencia N3 o solicitud explícita;
- exposición de bibliografía N2 desde el Kernel.
