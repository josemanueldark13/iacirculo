# CÍRCULO IA — Webhook y bandeja de revisión humana

## Endpoint Meta
`https://iacirculo.vercel.app/api/webhook/facebook`

Diagnóstico de configuración: `/api/webhook/facebook/status`.

El webhook valida `X-Hub-Signature-256` sobre el cuerpo crudo antes de decodificar JSON. Si `FACEBOOK_APP_SECRET` falta, responde 503. Si la firma falta o es inválida, responde 401.

## Variables de entorno
Configurar en Vercel:
- `FACEBOOK_VERIFY_TOKEN`
- `FACEBOOK_PAGE_ACCESS_TOKEN`
- `FACEBOOK_APP_SECRET`
- `META_GRAPH_VERSION` (por defecto `v23.0`)
- `CIRCULO_SITE_URL`
- `KV_REST_API_URL` y `KV_REST_API_TOKEN` (Redis REST compatible con Upstash / Vercel KV)
- `REVIEW_API_TOKEN`
- `DISPATCH_ENABLED=false` en Preview (es el valor predeterminado; solo habilitar `true` tras verificar almacenamiento, credenciales y aprobación humana).

Se aceptan también `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`. Generar `REVIEW_API_TOKEN` con un generador seguro, por ejemplo `openssl rand -hex 32`. No reutilizar contraseñas de Outlook ni guardar secretos en GitHub.

## Flujo
1. Meta entrega el evento firmado.
2. El webhook valida firma, descarta ecos y eventos sin texto.
3. El Kernel AXIAL produce análisis semántico, intención, prioridad y borrador.
4. El evento se guarda en KV con deduplicación por `message.mid`.
5. El webhook confirma 200 solo después de persistir los casos.
6. No se envían respuestas automáticamente. Cada borrador requiere aprobación humana.

Los reclamos van con prioridad alta y las urgencias explícitas con prioridad crítica. Un insulto aislado no eleva prioridad. La bandeja retiene registros 30 días y conserva hasta 500 casos recientes.

## API de revisión
Todas las rutas exigen `Authorization: Bearer REVIEW_API_TOKEN`. El despacho de salida exige además `DISPATCH_ENABLED=true`; si no está definido como `true`, la aprobación de envío queda bloqueada con HTTP 403.
- `GET /api/review`: últimos casos.
- `GET /api/review/:id`: detalle.
- `POST /api/review/:id/approve`: envía a Messenger el borrador aprobado.
- `POST /api/review/:id/reject`: rechaza sin enviar.
- `POST /api/review/:id/archive`: archiva.

Estados: `pending → sending → sent`; los fallos quedan como `send_failed` para inspección. Las transiciones evitan aprobaciones concurrentes duplicadas. La interfaz está en `/revision.html`; el token se introduce manualmente y permanece solo en memoria durante esa sesión del navegador.

## Diagnóstico
En `/api/webhook/facebook/status) comprobar:
- `verify_token_configurado`
- `page_access_token_configurado`
- `app_secret_configurado`
- `bandeja_kv_configurada`
- `token_operador_configurado`

Después consultar `/api/webhook/facebook/diagnose` y comprobar validez del token de Página y suscripción al campo `messages`.

## Alcance pendiente
Esta etapa implementa persistencia y aprobación mediante API protegida. Todavía no envía correos: requiere proveedor transaccional, remitente verificado y destinatario institucional. No se necesitan contraseñas de Outlook.

KV debe estar configurado antes de conectar el webhook a Meta. Sin KV, el endpoint devuelve 503 para no descartar mensajes. Probar en Preview y revisar los resultados antes de cualquier despliegue a Production.
