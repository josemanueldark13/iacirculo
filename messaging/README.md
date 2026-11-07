# AXIAL Messaging Agent v1

Módulo inicial e independiente para clasificar mensajes entrantes y producir decisiones estructuradas. No sustituye todavía el webhook productivo de Messenger.

## Flujo

Messenger webhook -> semantic-analyzer -> kernel -> acción estructurada -> ejecutor -> registro de auditoría.

El analizador identifica categoría, intención, señales y confianza. El kernel aplica políticas y devuelve una acción; no envía mensajes ni realiza llamadas externas.

## Acciones

- \`respond_with_knowledge\`: solicitar al agente institucional una respuesta basada en el corpus oficial.
- \`acknowledge_and_escalate\`: acusar recibo con plantilla aprobada y derivar el reclamo.
- \`request_clarification\`: pedir precisión cuando no se entiende la solicitud.
- \`archive_no_reply\`: archivar insultos aislados o propaganda promocional inequívoca.
- \`human_review\`: detener la automatización y elevar casos ambiguos, personales o complejos.

## Uso

\`\`\`js
const { decide, createAuditRecord } = require('./messaging/kernel');

const decision = decide('¿Cuál es la historia del Círculo?', {
  messageId: 'meta-message-id',
  source: 'messenger'
});

const audit = createAuditRecord('¿Cuál es la historia del Círculo?', decision);
\`\`\`

## Pruebas

\`\`\`bash
node tests/messaging-kernel.test.js
\`\`\`

## Límites deliberados de v1

- Clasificación heurística inicial, no comprensión semántica general ni modelo entrenado.
- La confianza es una señal de enrutamiento, no una probabilidad calibrada.
- No se envían mensajes, no se archiva en Meta y no se envían correos.
- Los reclamos, solicitudes personales, urgencias y mensajes inciertos se derivan para revisión.
- Las reglas deben evaluarse con conversaciones de prueba anonimizadas antes de habilitar acciones automáticas.
- La integración productiva requiere idempotencia, persistencia, política de reintentos, protección de datos y verificación de permisos de Meta.
