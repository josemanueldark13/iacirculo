# CÍRCULO IA

Asistente Institucional del Círculo de Legisladores de Tucumán.

El demo utiliza el emblema institucional real recortado de la pieza gráfica proporcionada.

## IDENTIDAD GRÁFICA — LOGO OFICIAL: USAR SIEMPRE

**MANDAMIENTO OBLIGATORIO:** ninguna historia gráfica, flyer, placa, banner, efeméride ni publicación visual institucional del Círculo se considera terminada ni se entrega sin incorporar el logo oficial aprobado.

- Usar siempre el archivo original del logo oficial aprobado por el usuario.
- No redibujarlo, recrearlo, reinterpretarlo, alterar sus colores, proporciones o tipografía, ni sustituirlo por versiones anteriores o aproximaciones.
- No pedir nuevamente al usuario que adjunte el logo.
- Comprobar antes de exportar o publicar que el logo esté efectivamente incorporado y sea legible.
- Si el archivo original no está disponible en el entorno de producción, detener la entrega y recuperar el original desde la fuente institucional aprobada. No publicar una pieza incompleta.
- Esta regla prevalece sobre cualquier plantilla, automatización o instrucción genérica de diseño.

La referencia visual aprobada por el usuario es el emblema circular con aro celeste, arco superior dorado, laureles dorados y texto celeste «CÍRCULO DE LEGISLADORES DE TUCUMÁN» sobre fondo oscuro. La imagen original adjuntada el 18/11/2026 es la referencia que debe incorporarse al repositorio como recurso institucional canónico; no debe sustituirse por una recreación.

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
