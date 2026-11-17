# CÍRCULO IA

Asistente Institucional del Círculo de Legisladores de Tucumán.

## Webhook de Facebook Messenger

URL estable para configurar en Meta:

`https://iacirculo.vercel.app/api/webhook/facebook`

No utilizar una URL de deployment con identificador aleatorio para la configuración permanente del webhook, porque puede cambiar con nuevos deployments.

Variables requeridas en Vercel (Production):

```text
FACEBOOK_VERIFY_TOKEN
FACEBOOK_PAGE_ACCESS_TOKEN
FACEBOOK_APP_SECRET
CIRCULO_SITE_URL
```

`CIRCULO_SITE_URL` puede ser `https://iacirculo.vercel.app/`.

Endpoint de diagnóstico:

`https://iacirculo.vercel.app/api/webhook/facebook/status`

Este endpoint confirma si las variables están configuradas, sin exponer sus valores.

Meta verifica el webhook mediante `GET` con `hub.mode`, `hub.verify_token` y `hub.challenge`. Los mensajes de Messenger llegan mediante `POST` y CÍRCULO IA los procesa a través del Kernel AXIAL antes de responder al usuario.

## Consola operativa de Messenger

Interfaz administrativa: `/mensajeria.html`.

La consola presenta tres procedimientos:

1. **Recepción:** bandeja de mensajes recibidos desde Messenger.
2. **Análisis semántico:** dominio, intención, agente, confianza y conceptos detectados por el Kernel AXIAL.
3. **Enrutamiento:** destino calculado, módulos RAG y módulo prioritario.

Para habilitar el registro persistente y el acceso administrativo, configurar en Vercel:

```text
MESSENGER_ADMIN_TOKEN
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Crear una base Redis compatible con Upstash y copiar la URL REST y su token desde el panel del proveedor. `MESSENGER_ADMIN_TOKEN` debe ser una clave aleatoria robusta. No incluir estos valores en el repositorio ni compartirlos por la interfaz pública.

La API administrativa es `GET /api/webhook/facebook/admin/conversations` y requiere el encabezado `x-messenger-admin-token`. La consola no guarda la clave en almacenamiento persistente del navegador.

Los registros se conservan en Redis bajo `axial:messenger:conversations`, con un máximo de 500 mensajes; la consola consulta los 200 más recientes. Si Redis no está configurado, el webhook conserva el flujo de respuesta existente, pero los mensajes no aparecerán en la bandeja. El panel informa del error de conexión.

Esta consola cubre recepción, análisis y enrutamiento. No habilita todavía respuestas manuales, modos de atención ni supervisión por correo.
