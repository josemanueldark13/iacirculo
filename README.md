# CÍRCULO IA

Asistente Institucional del Círculo de Legisladores de Tucumán.

El demo utiliza el emblema institucional real recortado de la pieza gráfica proporcionada.

## Webhook de Facebook Messenger

URL estable para configurar en Meta:

`https://iacirculo.vercel.app/api/webhook/facebook`

No utilizar una URL de deployment con identificador aleatorio para la configuración permanente del webhook, porque puede cambiar con nuevos deployments.

Variables requeridas en Vercel (Production):

```text
FACEBOOK_VERIFY_TOKEN
FACEBOOK_PAGE_ACCESS_TOKEN
CIRCULO_SITE_URL
```

`CIRCULO_SITE_URL` puede ser `https://iacirculo.vercel.app/`.

Endpoint de diagnóstico:

`https://iacirculo.vercel.app/api/webhook/facebook/status`

Este endpoint confirma si las variables están configuradas, sin exponer sus valores.

Meta verifica el webhook mediante `GET` con `hub.mode`, `hub.verify_token` y `hub.challenge`. Los mensajes de Messenger llegan mediante `POST` y CÍRCULO IA los procesa a través del Kernel AXIAL antes de responder al usuario.
