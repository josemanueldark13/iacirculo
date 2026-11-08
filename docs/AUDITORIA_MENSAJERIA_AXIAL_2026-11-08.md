# Auditoría inicial de mensajería y Kernel AXIAL
Fecha: 2026-11-08
Rama: audit/mensajeria-semantic-notifications

## Alcance revisado
Lectura estática de `routes/messenger.js`, `routes/facebookWebhook.js`, `Kernels/kernel.js`, `semanticAnalyzer.js`, `domainRouter.js`, `intentRouter.js`, `ragRouter.js`, `responsePolicy.js`, `server.js`, `.env.example` y scripts de pruebas.

No se modificó producción ni se publicaron deployments. Esta auditoría no afirma que las pruebas hayan sido ejecutadas.

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

## Próximo cambio de código
Implementar primero el cierre de seguridad del webhook y el contrato estructurado del analizador en esta rama. Después incorporar almacenamiento y revisión humana. La integración de correo debe conectarse a ese flujo persistente, no añadirse como un correo aislado sin estado.

## Estado
Rama de auditoría creada desde `main`. Sin cambios en `main`, sin cambios en producción y sin despliegue.
