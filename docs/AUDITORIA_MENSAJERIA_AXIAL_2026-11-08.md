# Auditoría inicial de mensajería y Kernel AXIAL
Fecha: 2026-11-08
Rama: audit/mensajeria-semantic-notifications

## Alcance revisado
Lectura estática de `routes/messenger.js`, `routes/facebookWebhook.js`, `Kernels/kernel.js`, `semanticAnalyzer.js`, `domainRouter.js`, `intentRouter.js`, `ragRouter.js`, `responsePolicy.js`, `server.js`, `.env.example` y scripts de pruebas.

No se modificó `main` ni se publicó a Production. Git Integration generó deployments Preview para la rama de auditoría. La regresión automatizada se ejecutó después de los cambios y terminó correctamente.

## Hallazgos prioritarios

### P0 — Firma de Meta falla abierta si falta el App Secret
En `routes/messenger.js`, `verifySignature()` devuelve `true` cuando no encuentra `FACEBOOK_APP_SECRET` / `META_APP_SECRET`. Eso permite aceptar POST sin autenticar cuando la variable falta. En producción debe rechazarse el evento y generar alerta de configuración; nunca omitir la verificación silenciosamente.

### P0 — El webhook responde automáticamente, sin aprobación humana
El POST ejecuta `kernel.process()`, construye una respuesta y llama directamente a `sendMessage()`. No existe una etapa de revisión humana ni un estado pendiente de aprobación en este flujo. Esto contradice el circuito deseado de supervisión por correo.

### P1 — No existe módulo de notificaciones por correo
`.env.example` contiene únicamente variables de Meta y URL del sitio. No hay proveedor, remitente, destinatario de alertas, persistencia de casos ni enlaces de aprobación/rechazo configurados en el repositorio revisado.

### P1 — Los errores de envío se absorben y el webhook confirma 200
El `catch` de cada `sendMessage()` solo escribe el error en consola. El POST termina respondiendo 200, por lo que Meta puede considerar procesado un evento cuya respuesta falló. Se necesita registro durable, política de reintentos e idempotencia.

### P1 — El Kernel calcula estados que Messenger no respeta
`kernel.process()` puede devolver `requiere_reformulacion` o `fuera_de_dominio`, pero `buildResponse()` en `routes/messenger.js` no maneja esos estados de forma explícita y termina llamando al agente institucional. La decisión del Kernel debe ser la autoridad del flujo.

### P2 — El analizador semántico es léxico y basado en subcadenas
`semanticAnalyzer.js` usa listas de términos, alias y coincidencias `includes()`. No hay análisis de negación, límites de palabra, entidades, contexto conversacional ni calibración validada de confianza. Puede producir coincidencias accidentales y no distingue con suficiente rigor entre intención, dominio y urgencia.

### P2 — Hay dos rutas de webhook
`server.js` monta el mismo router en `/webhook/messenger` y `/api/webhook/facebook`, y además existe `routes/facebookWebhook.js` con otra implementación. Debe quedar una implementación canónica para evitar divergencias y errores de configuración.

## Diseño recomendado antes de activar correo

1. **Recepción segura:** validar firma obligatoriamente, normalizar evento, descartar ecos y asignar identificador idempotente.
2. **Analizador semántico:** producir salida estructurada con dominio, intención, entidades, urgencia, confianza, motivos y versión del analizador. Las decisiones de baja confianza deben ir a revisión, no a respuesta automática.
3. **Enrutador de mensajería:** separar consultas informativas, reclamos, urgencias, contacto humano, spam y fuera de dominio. No enviar respuestas en esta etapa.
4. **Bandeja persistente:** guardar evento, análisis, borrador, estado y auditoría. Vercel Functions no debe depender de memoria local para conservar aprobaciones; hace falta un almacenamiento durable.
5. **Correo de supervisión:** notificar a la dirección institucional configurada, con resumen y enlaces firmados, de un solo uso y con vencimiento. No incluir secretos ni permitir que un clic GET ejecute una acción irreversible.
6. **Acciones:** aprobar envía la respuesta a Messenger; rechazar deja el caso sin enviar; revisar abre el caso; archivar conserva trazabilidad. Toda acción debe registrar actor, fecha y resultado.
7. **Pruebas:** cubrir firmas ausentes/inválidas/válidas, duplicados, fallos de Graph API, baja confianza, urgencias, aprobación/rechazo, expiración y reintentos.

## Variables a definir
- Proveedor de correo transaccional y dominio/remitente verificado.
- Destinatario institucional de notificaciones.
- Almacenamiento durable para casos y auditoría.
- Secreto de firma de acciones y URL pública del panel.

No se deben pedir ni guardar contraseñas de Outlook. La dirección de destino puede ser una cuenta Outlook; el envío debe realizarse mediante un proveedor transaccional autenticado.

## Implementación realizada en la rama

- **Firma Meta:** nuevo helper HMAC SHA-256 con comparación de tiempo constante. El webhook falla cerrado: sin App Secret responde 503; con firma ausente o inválida responde 403.
- **Analizador semántico:** contrato versionado `2.0.0`, coincidencia por frases completas, conceptos/señales, banda de confianza y razones de revisión.
- **Prioridad:** urgencias explícitas = crítica; reclamos/quejas/denuncias = alta; insultos aislados no elevan prioridad automáticamente.
- **Mensajería:** el webhook ya no envía respuestas automáticas. Persiste evento, análisis y borrador en Redis REST (KV/Upstash), con deduplicación por ID de evento, retención de 30 días y límite operativo de 500 casos.
- **Bandeja:** nueva interfaz `/revision.html`; API protegida por `REVIEW_API_TOKEN`; permite editar el borrador, aprobar y enviar, rechazar o archivar.
- **Envío:** se realiza únicamente desde la acción de aprobación humana. El envío tiene timeout y los fallos quedan registrados para inspección.
- **CI:** `npm test` ejecutado en GitHub Actions con Node 24. Resultado: **success** en los cuatro grupos de pruebas: regresión de 30 preguntas, lenguaje natural, truth table y seguridad/prioridad.

## Validación del Preview

Deployment Preview asociado al commit `9c7067588dd55a5dde1da2400610d1389c58986c`:
- `/api/health`: HTTP 200.
- `/revision.html`: HTTP 200.
- `/api/review?limit=1`: HTTP 503, esperado mientras falte `REVIEW_API_TOKEN`.
- El status del Preview informa que las variables de Meta y KV no están configuradas en ese entorno.

La comprobación de Production, en cambio, sigue mostrando configurados `FACEBOOK_VERIFY_TOKEN`, `FACEBOOK_PAGE_ACCESS_TOKEN` y `FACEBOOK_APP_SECRET`. No se publicó el código de esta rama en Production ni se fusionó con `main`.

## Bloqueos antes de activar la bandeja

1. Conectar un almacenamiento Redis REST a Vercel Preview y configurar `KV_REST_API_URL` + `KV_REST_API_TOKEN`.
2. Generar y configurar `REVIEW_API_TOKEN`.
3. Configurar las variables Meta necesarias también en Preview, usando credenciales de prueba cuando corresponda.
4. Probar un mensaje real de prueba desde Meta, verificar persistencia, edición, aprobación, rechazo y que ningún borrador se envíe sin aprobación.
5. Antes de cualquier fusión a `main`, configurar y validar KV y token de operador en Production; de lo contrario, el nuevo webhook responderá 503 y no aceptará mensajes sin persistencia.

## Correo electrónico pendiente

La bandeja y el circuito de aprobación están implementados, pero **todavía no se envían notificaciones por correo**. Falta definir proveedor transaccional, remitente/dominio verificado y destinatario institucional. No se necesitan ni deben compartirse contraseñas de Outlook.

## Estado

Rama `audit/mensajeria-semantic-notifications` actualizada y probada en Preview/CI. `main` y Production permanecen sin cambios.

## Validación complementaria del informe de pruebas

Se actualizó el middleware para cumplir el contrato más estricto:

- Para los POST de `/api/webhook/facebook` y `/webhook/messenger`, Express recibe primero el cuerpo como bytes crudos.
- La firma HMAC se comprueba antes de `JSON.parse`.
- Firma ausente o inválida: HTTP **401 Unauthorized**.
- App Secret ausente: HTTP **503**, configuración de seguridad incompleta.
- Solo después de validar HMAC se decodifica el JSON y se invoca el router.

También se agregó un bloqueo explícito de despacho:

- `DISPATCH_ENABLED` solo habilita salida si su valor es exactamente `true`.
- Valor ausente o `false`: no se envían respuestas a Messenger, aunque exista una aprobación solicitada.
- La ruta de aprobación devuelve HTTP 403 cuando el despacho está deshabilitado.
- El estado del webhook informa `dispatch_enabled`.

### Prueba de integración HMAC

El nuevo test HTTP envía un cuerpo JSON deliberadamente malformado:
- Sin firma: 401.
- Firma inválida: 401.
- Firma válida sobre JSON malformado: 400.
- Firma válida sobre payload válido: supera HMAC y llega a la comprobación de KV (503 cuando KV no está configurado).

La suite de GitHub Actions ejecutó `npm test` con Node 24 y terminó en **success** para el commit `5b676e1d688d337f6b0d129faef41cd1a621cb83`. El workflow ejecuta cuatro scripts: `run30.js`, `run-natural.js`, `axial-truthtable.test.js` y `messenger-security.test.js`.

### Precisión sobre métricas de la tabla suministrada

El repositorio usa JavaScript/CommonJS. El workflow actual no ejecuta `tsc --noEmit`, no contiene un paso de linter y no publica artefactos de test separados. Por tanto, el estado verde de GitHub Actions está verificado, pero los tiempos por módulo (420/310/580/490 ms), el promedio de confianza del 94,2% y la compilación TypeScript limpia no están demostrados por el pipeline actual y no deben presentarse como resultados medidos de esta ejecución.

### Preview más reciente

Preview: `https://iacirculo-jbpju8ryl-axial-os1.vercel.app/` (READY).

- `/api/health`: HTTP 200.
- `/revision.html`: HTTP 200.
- `/api/webhook/facebook/status`: HTTP 200; informa `dispatch_enabled:false`.
- `/api/review?limit=1`: HTTP 503 por falta de `REVIEW_API_TOKEN`, como protección esperada.
- En Preview todavía no están conectadas credenciales Meta ni KV. No se debe enviar tráfico de usuarios reales a esa instancia.

Production y `main` no se modificaron.
