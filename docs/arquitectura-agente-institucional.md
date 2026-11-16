# Agente institucional conversacional y operativo

## Objetivo

Evolucionar CÍRCULO IA desde un contestador hacia un agente institucional capaz de conversar, orientar, enseñar cómo interactuar con la institución, mejorar mediante retroalimentación controlada y preparar acciones autorizadas.

## Capacidades

1. **Conversación:** saludos, orientación y respuestas institucionales aprobadas.
2. **Conocimiento:** consulta del RAG documental para leyes, decretos, autoridades, historia, publicaciones y documentos. La base conversacional no duplica documentos.
3. **Interacción guiada:** ayuda a formular consultas y explica qué datos hacen falta para continuar.
4. **Aprendizaje supervisado:** registra preguntas sin respuesta, correcciones y patrones de confusión. Produce candidatos de mejora, no cambios automáticos a respuestas institucionales.
5. **Acciones:** prepara borradores de correo y otras solicitudes. Cada acción debe pasar por validación de permisos y confirmación explícita.

## Circuito de aprendizaje

`conversación → señal de mejora → registro de caso → agrupación de preguntas similares → propuesta de respuesta → verificación de fuentes → aprobación institucional → publicación versionada`

Reglas:
- Las conversaciones no se convierten automáticamente en conocimiento oficial.
- No se incorporan datos personales innecesarios a los ejemplos de entrenamiento o evaluación.
- Cada respuesta aprobada conserva identificador, versión, responsable y fecha de revisión.
- Los registros `draft` y `retired` nunca se envían automáticamente.
- Debe poder retirarse una respuesta incorrecta sin modificar el código del Kernel.

## Circuito de correo

Estados propuestos:

`collecting → draft_ready → awaiting_user_confirmation → approved_to_send → sent`

Estados alternativos:

`needs_human_review`, `cancelled`, `send_failed`.

Antes de enviar:
- validar destinatario y dominio permitido;
- mostrar destinatario, asunto y cuerpo completos;
- pedir confirmación explícita sobre ese contenido;
- impedir envíos duplicados mediante un identificador idempotente;
- registrar resultado, fecha, identificador del mensaje y actor que autorizó;
- no incluir datos sensibles salvo que sean necesarios y el usuario los haya proporcionado conscientemente.

Una solicitud de contacto con una persona de la institución siempre se deriva a atención humana, incluso en modo AUTO. La preparación de un correo por parte del ciudadano es una acción distinta y no debe confundirse con esa derivación.

## Modos operativos

- **AUTO:** solo respuestas conversacionales aprobadas, de bajo riesgo. Las acciones externas requieren confirmación específica.
- **SUPERVISION:** prepara borradores para aprobación humana; no despacha respuestas automáticamente.
- **MANUAL:** registra la interacción y deja la decisión en manos humanas.

Las reglas de urgencias, reclamos y denuncias sensibles prevalecen sobre cualquier modo.

## Estado de implementación

- Implementado en la rama de trabajo: base conversacional inicial versionada y aprobada para saludos, ayuda de interacción, preparación de correo y retroalimentación.
- Implementado: integración de coincidencias conversacionales en el Kernel, respetando AUTO, SUPERVISION y MANUAL.
- Pendiente: persistencia de conversaciones y memoria de sesión; pipeline de aprendizaje y revisión; ActionRouter; servicio de correo institucional; confirmación transaccional; auditoría y pruebas end-to-end.
- El módulo actual de preparación de correo solo orienta y redacta el flujo. No envía correos ni tiene credenciales de envío.
- La selección de módulos RAG no equivale todavía a recuperación documental completa ni a generación de respuesta basada en documentos.

## Criterio de publicación

Todo cambio debe probarse en la rama de trabajo, revisarse y aprobarse antes de fusionar a `main`, conectar Messenger o desplegar en producción.
