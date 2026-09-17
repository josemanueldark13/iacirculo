# CÍRCULO IA — Webhook de Facebook Messenger

## Endpoint público

Usar como callback de Meta:

`https://iacirculo.vercel.app/api/webhook/facebook`

El endpoint también responde a:

`GET https://iacirculo.vercel.app/api/webhook/facebook/status`

Este diagnóstico informa únicamente si las variables requeridas están configuradas; nunca expone sus valores.

## Variables de entorno en Vercel

Configurar en **Production**:

- `FACEBOOK_VERIFY_TOKEN`: token que se utilizará en la verificación de Meta.
- `FACEBOOK_PAGE_ACCESS_TOKEN`: Page Access Token de la página de Facebook.
- `FACEBOOK_APP_SECRET`: App Secret de la aplicación de Meta.
- `META_GRAPH_VERSION`: versión de Graph API; valor actual por defecto `v23.0`.
- `CIRCULO_SITE_URL`: `https://iacirculo.vercel.app/`

El código admite también la nomenclatura anterior `META_VERIFY_TOKEN`, `META_PAGE_ACCESS_TOKEN` y `META_APP_SECRET` como compatibilidad.

## Verificación

Después de configurar las variables, consultar `/api/webhook/facebook/status` y comprobar que `verify_token_configurado`, `page_access_token_configurado` y `app_secret_configurado` aparezcan en `true`.

Luego, en Meta Developers, utilizar la misma URL y el mismo `FACEBOOK_VERIFY_TOKEN` para la verificación del webhook.
