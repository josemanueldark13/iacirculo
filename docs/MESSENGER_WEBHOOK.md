# CÍRCULO IA — Webhook y bandeja de revisión humana

## Endpoint Meta
`https://iacirculo.vercel.app/api/webhook/facebook`

Diagnóstico de configuración: `/api/webhook/facebook/status`.

El webhook valida `X-Hub-Signature-256` sobre el cuerpo crudo antes de decodificar JSON. Si falta `FACEBOOK_APP_SECRET`, responde 503. Si la firma falta o es inválida, responde 401.

## Variables de entorno
Configurar en Vercel:

- `FACEBOOK_VERIFY_TOKEN`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_APP_SECRET`
- `META_GRAPH_VERSION` (por defecto `v23.0`) y `CIRCULO_SITE_URL`
- `KV_REST_API_URL`, `KV_REST_API_TOKEN` y `REVIEW_API_TOKEN`
- `MESSENGER_MODE`: `AUTO`, `SUPERVISION` o `MANUAL`. Por defecto `SUPERVISION`.
- `DISPATCH_ENABLED=false` hasta completar pruebas en Preview y aprobar expresamente el despacho.
- Para correo Outlook: `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `OUTLOOK_NOTIFICATION_FROM` y opcionalmente `OUTLOOK_NOTIFICATION_TO` (por defecto `circulodelegis@outlook.com`).

Outlook se conecta mediante Microsoft Graph con credenciales de aplicación. La aplicación de Microsoft Entra debe tener permiso de aplicación `Mail.Send` y consentimiento de administrador. No se utiliza ni se almacena la contraseña de la cuenta Outlook. No guardar secretos en Git ni enviarlos por chat.

Se aceptan también `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`. Generar `REVIEW_API_TOKEN` con un generador seguro, por ejemplo `openssl rand -hex 32`.

## Modos de mensajería

- **AUTO:** responde automáticamente solo a intenciones reconocidas de bajo riesgo. Urgencias, reclamos, denuncias sensibles y solicitudes de atención humana van a la bandeja.
- **SUPERVISION:** genera un borrador y espera aprobación humana. Es el modo predeterminado.
- **MANUAL:** registra el mensaje sin redactar una respuesta; el operador decide el contenido.

El envío requiere además `DISPATCH_ENABLED=true`. Sin esa habilitación, las respuestas automáticas quedan pendientes para revisión. Las acciones humanas siguen protegidas por `REVIEW_API_TOKEN`.

## Flujo
1. Meta entrega el evento firmado.
2. El webhook valida HMAC y descarta ecos/eventos sin texto.
3. El Kernel ejecuta tres capas coordinadas: análisis institucional, Semantic Frame 0.3.1 contextual y análisis conversacional. El contexto se conserva por remitente en Redis, con un máximo de 12 turnos y retención de 7 días.
4. El router aplica el modo configurado y determina si responde, aclara o deriva.
5. Los casos que requieren revisión se guardan en Redis/KV con deduplicación por `message.mid`.
6. Si Outlook está configurado, se envía un aviso de caso pendiente. Un fallo de correo no descarta el mensaje ya persistido.
7. La aprobación humana es necesaria para los borradores del modo SUPERVISION y para los casos escalados.

Los reclamos explícitos o implícitos reciben prioridad alta; las urgencias críticas prevalecen sobre reclamos concurrentes. Las preguntas informativas sobre el significado de «reclamo», las negaciones y los insultos aislados no se clasifican automáticamente como reclamos. Un insulto no eleva por sí solo la prioridad.

## API de revisión
Todas las rutas exigen `Authorization: Bearer REVIEW_API_TOKEN`.

- `GET /api/review`: últimos casos.
- `GET /api/review/:id`: detalle.
- `POST /api/review/:id/approve`: envía el borrador aprobado.
- `POST /api/review/:id/reject`: rechaza sin enviar.
- `POST /api/review/:id/archive`: archiva.

El despacho desde la bandeja exige `DISPATCH_ENABLED=true`. Estados: `pending → sending → sent`; los fallos quedan como `send_failed`. Las transiciones usan bloqueo temporal para evitar aprobaciones concurrentes.

## Validación y límites
Las pruebas de CI simulan Redis, Meta y las llamadas externas. No equivalen a una prueba real contra Upstash, Microsoft Graph o Facebook. Antes de habilitar producción, probar en Preview con credenciales de prueba, verificar permisos de Graph, confirmar notificaciones y revisar los casos de la bandeja.

La bandeja conserva registros durante 30 días y limita el índice a 500 casos recientes. El contexto conversacional conserva hasta 12 turnos durante 7 días; los identificadores de remitente se convierten en hashes para construir las claves de Redis.
