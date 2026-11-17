# Ingesta documental administrada — N1

## Flujo
1. El operador abre /admin-documentos.html y se autentica con REVIEW_API_TOKEN.
2. El PDF se envía como cuerpo binario a POST /api/documents (máximo 8 MB).
3. El servidor valida MIME, cabecera PDF y capa de texto, calcula SHA-256 y guarda el original en Vercel Blob privado.
4. Los metadatos se registran en KV con estado pending_review. No se indexa automáticamente.
5. Un operador revisa y aprueba o rechaza. La aprobación vuelve a leer el PDF privado, revalida y promueve el documento al índice N1.
6. Las instancias nuevas reconstruyen su índice N1 desde los PDF aprobados persistidos.

## Configuración requerida
- REVIEW_API_TOKEN: token de operador, compartido con la bandeja de revisión.
- KV_REST_API_URL y KV_REST_API_TOKEN (o equivalentes Upstash): metadatos e índice de documentos.
- BLOB_READ_WRITE_TOKEN: Vercel Blob privado.
- Dependencia @vercel/blob.

Los secretos se configuran en Vercel. No se incluyen en el repositorio. No habilitar almacenamiento público para documentación institucional.

## Límites y controles
- PDF hasta 8 MB; se requiere capa de texto. OCR no está incluido.
- La subida queda pendiente; solo un operador autenticado puede aprobar.
- El índice BM25 se reconstruye en memoria por instancia desde documentos aprobados.
- La aprobación registra un identificador genérico de operador; debe ampliarse al incorporar identidades individuales.
- La ruta no expone URLs privadas ni el pathname interno del Blob en el listado.
- Rechazar un documento no elimina el original del almacenamiento; conserva el registro para auditoría y evita incorporarlo a N1.
