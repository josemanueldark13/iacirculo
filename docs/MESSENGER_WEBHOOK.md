# CÍRCULO IA — Webhook de Facebook Messenger

## Arquitectura

`Messenger/WebApp → canal de entrada → Kernel AXIAL → agente → conocimiento/RAG → respuesta → canal`

El canal recibe el pedido. El Kernel interpreta la intención y decide qué agente debe elaborar la respuesta. La cocina interna no se expone al usuario.

## Endpoint

Webhook:

`GET /webhook/messenger` — verificación de Meta.

`POST /webhook/messenger` — recepción de eventos de Messenger.

## Variables de entorno

```text
META_VERIFY_TOKEN=token-elegido-para-la-verificacion
META_APP_SECRET=app-secret-de-Meta
META_PAGE_ACCESS_TOKEN=page-access-token
META_GRAPH_VERSION=v23.0
```

`META_GRAPH_VERSION` queda configurable para poder actualizar la versión de Graph API sin modificar el código.

## Agentes iniciales

- `orientacion` — teléfonos y orientación básica.
- `institucional` — historia, autoridades, documentos e información institucional.
- `operativo` — funcionamiento, horarios, dirección, actividades y trámites.
- `formativo` — aprendizaje, historia parlamentaria, ciudadanía y participación.
- `contacto` — mensajes que deben llegar a atención humana.

## Principio

El usuario pide un producto. El Kernel se ocupa de que el producto correcto sea elaborado y entregado. La implementación interna puede cambiar sin cambiar la experiencia del usuario.
