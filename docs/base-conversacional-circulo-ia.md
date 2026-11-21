# Base conversacional de CÍRCULO IA

## Objetivo

Ofrecer una experiencia de conversación institucional por Messenger. La base conversacional complementa el RAG documental de AXIAL; no lo reemplaza ni duplica sus documentos.

## Fuentes y responsabilidades

1. **RAG oficial (fuente de verdad):** leyes, decretos, estatuto, autoridades, sede, historia institucional, publicaciones y documentos oficiales.
2. **Base conversacional (respuestas aprobadas):** saludos, orientación, preguntas frecuentes, servicios, actividades, canales de contacto y aclaraciones.
3. **Operación humana:** solicitudes explícitas de contacto, reclamos, denuncias sensibles, urgencias y casos que requieren criterio institucional.

## Esquema recomendado para cada respuesta

- `id`: identificador estable.
- `intent`: intención normalizada.
- `examples`: expresiones habituales que pueden activar la respuesta.
- `answer`: texto institucional aprobado.
- `answer_variants`: variantes breves opcionales, sin alterar el contenido.
- `source_refs`: documentos o URLs oficiales que respaldan afirmaciones.
- `requires_source`: indica si la respuesta debe recuperar datos del RAG antes de enviarse.
- `requires_human`: deriva a operador.
- `status`: `draft`, `approved` o `retired`.
- `owner` y `reviewed_at`: trazabilidad de aprobación y revisión.
- `version`: versión del contenido.

## Categorías iniciales

- saludo y presentación institucional;
- qué es el Círculo y a quiénes reúne;
- historia, creación y marco legal;
- autoridades y organización;
- sede, horarios y canales de contacto;
- actividades, noticias y publicaciones;
- cómo dejar una consulta o solicitud;
- reclamos y seguimiento;
- preguntas no comprendidas y solicitud de aclaración.

## Reglas de respuesta

- Solo se envían automáticamente registros con estado `approved`.
- Los datos variables (autoridades, horarios, actividades, teléfonos y direcciones) se recuperan de fuentes vigentes; no se fijan en respuestas estáticas sin fecha de revisión.
- Si no hay fuente suficiente, el sistema debe reconocer el límite y ofrecer derivación o aclaración.
- No inventar trámites, beneficios, plazos, autoridades ni compromisos institucionales.
- Una solicitud explícita de contacto con la institución siempre genera un caso para atención humana, incluso en modo `AUTO`.
- Reclamos, urgencias y denuncias sensibles conservan sus reglas de prioridad y escalamiento.
- El modo `SUPERVISION` prepara borradores para aprobación; `MANUAL` no redacta respuestas automáticas; `AUTO` solo despacha respuestas aprobadas y de bajo riesgo.

## Flujo de recuperación

1. Clasificar intención y contexto con Semantic Analyzer y Message Analyzer.
2. Aplicar la política transversal de derivación humana.
3. Buscar primero una respuesta aprobada de la base conversacional.
4. Si la respuesta requiere datos institucionales, consultar el RAG oficial.
5. Comprobar que la evidencia sea suficiente y vigente.
6. Aplicar el modo operativo y registrar la decisión, las fuentes y la versión de respuesta.

## Criterio de implementación

Mantener el contenido separado del código. La base debe poder editarse y revisarse sin modificar el Kernel. La primera carga debe construirse con información institucional confirmada y aprobación del Círculo; los textos de ejemplo no deben publicarse como hechos.
