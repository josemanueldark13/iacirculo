# Gestor autónomo de mensajería — CÍRCULO IA

## Alcance de esta primera etapa

Este módulo agrega una bandeja institucional propia, separada de cualquier integración externa. Recibe consultas desde el portal, las procesa con el Kernel AXIAL y guarda conversaciones en Redis.

### Modos de respuesta

- **AUTO:** el Kernel genera y devuelve la respuesta al visitante.
- **GUARDAMETA:** el Kernel prepara un borrador; un operador lo aprueba desde la bandeja.
- **MANUAL:** la consulta queda pendiente para que un operador redacte la respuesta.

Los modos se configuran globalmente desde el panel administrativo.

## Endpoints

### Canal web público

- `POST /api/inbox/messages` — recibe una consulta. JSON: `{ "message": "..." }`. Devuelve un `conversationId`.
- `GET /api/inbox/messages/:id` — recupera el estado y los mensajes de una conversación identificada por UUID.

### Administración

Todos los endpoints administrativos requieren `Authorization: Bearer <INBOX_ADMIN_TOKEN>`.

- `GET /api/inbox/admin/overview` — estadísticas y últimas 100 conversaciones.
- `GET /api/inbox/admin/conversations/:id` — detalle y mensajes.
- `PATCH /api/inbox/admin/mode` — cambia el modo. JSON: `{ "mode": "AUTO|GUARDAMETA|MANUAL" }`.
- `POST /api/inbox/admin/conversations/:id/reply` — guarda una respuesta de operador. JSON: `{ "message": "..." }`.
- `POST /api/inbox/admin/conversations/:id/approve` — aprueba un borrador.
- `POST /api/inbox/admin/conversations/:id/close` — cierra una conversación.

## Configuración

Se reutiliza Redis de Upstash ya previsto por el proyecto:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Agregar en Vercel:

- `INBOX_ADMIN_TOKEN`: secreto aleatorio largo, solo del lado servidor.
- Opcional: `CIRCULO_SITE_URL`.

El módulo carga Redis de forma diferida para no impedir que el resto de CÍRCULO IA arranque cuando Redis no esté configurado.

## Interfaz

El panel se sirve en `/inbox-admin.html`. El token se conserva únicamente en `sessionStorage` del navegador y se envía por HTTPS como Bearer token. No se incluye ningún secreto en el HTML.

## Límites conocidos de esta etapa

- La bandeja y la persistencia quedan implementadas para el canal web propio.
- La entrega de mensajes a visitantes se realiza mediante la respuesta HTTP del canal web.
- La bandeja todavía no envía correos ni mensajes a plataformas externas.
- No se debe exponer el panel hasta configurar `INBOX_ADMIN_TOKEN`.
- Redis debe estar configurado para persistencia y administración. Si no está disponible, el endpoint informa indisponibilidad sin afectar el arranque del portal.
- La integración de worker asíncrono, cola de reintentos y DLQ se incorpora como siguiente fase; no se simula una cola que aún no está implementada.
