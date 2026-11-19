# Blueprint oficial de arquitectura — CÍRCULO IA / AXIAL

## Principio
Un solo núcleo central: Kernel Axial. Pipelines y demás búnkeres son módulos conectados a él, no kernels independientes.

## Flujo de mensajes
Messenger → Webhook CÍRCULO IA → validación HMAC SHA-256 → Redis (cola) → ACK a Meta → worker → Módulo Guerrilla Axial Pipelines → chepibes/agentes → Kernel Axial → Semantic Analyzer → Intent Router → RAG/contexto institucional y política de respuesta → salida Messenger o supervisión por correo.

## Responsabilidades
- Messenger: interfaz de entrada/salida.
- Webhook: recibe eventos, valida firma y deposita en cola.
- Redis: transporte de eventos, listas pending/processing/dead, reintentos y DLQ.
- Guerrilla Axial Pipelines: módulo de transporte y gestión de recorridos de eventos y agentes.
- Chepibes: agentes/mensajeros que recorren pipelines y ejecutan tareas asignadas.
- Kernel Axial: núcleo único de coordinación y procesamiento inteligente.
- Semantic Analyzer: analiza significado/conceptos.
- Intent Router: clasifica intención y enruta.
- Output: Messenger, supervisión por correo y derivación humana.

## Estado actual auditado en GitHub
- server.js monta rutas /webhook/messenger y /api/webhook/facebook, el worker /api/internal/messenger-worker, y Kernel.
- routes/messenger.js valida X-Hub-Signature-256 con HMAC SHA-256 y encola eventos en Redis cuando Redis está configurado; conserva fallback síncrono.
- services/redisEventQueue.js implementa pending/processing/dead con LPUSH, RPOPLPUSH, LREM, reintentos y dead-letter.
- services/messengerWorker.js reclama hasta 10 eventos por ejecución, procesa mediante kernel.process() y responde por Messenger; requiere secret del worker.
- Kernels/kernel.js coordina Semantic Analyzer, domainRouter, reformulator, ragRouter, responsePolicy, intentRouter y actionRouter.

## Trabajo pendiente
- Implementar módulo explícito Guerrilla Axial Pipelines (controller/orchestrator), enlazado a Kernel existente sin crear un segundo kernel.
- Formalizar agentes chepibes (identidad, tareas, delegación, límites, registro).
- Conectar salida/supervisión por email según blueprint.
- Verificar despliegue, variables y flujo end-to-end en ambiente de pruebas.

## No afirmar que los enlaces están implementados hasta probarlos.
