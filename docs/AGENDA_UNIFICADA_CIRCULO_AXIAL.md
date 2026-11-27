# Agenda unificada de proyecto — CÍRCULO IA / AXIAL

**Estado:** agenda de trabajo consolidada para revisión  
**Base auditada:** `main` en `160e31efae12c667b9c660e6ab03aa4f61ca4ab5`  
**Regla de alcance:** esta agenda no autoriza cambios en producción ni en la portada institucional.

## Invariantes que deben preservarse

1. La portada de CÍRCULO IA y sus gadgets existentes no se eliminan ni se reubican como efecto colateral de trabajos del backend.
2. Se conservan Mini Pizarra, Historiografía de Tucumán y AXIAL · TruthTable, además de los recursos de identidad institucional.
3. Los desarrollos se trabajan en ramas y previews identificables. No se fusiona ni se publica en producción sin revisión y aprobación explícita.
4. El Kernel Axial es el núcleo único. Guerrilla Axial Pipelines transporta y orquesta eventos, pero no crea un segundo Kernel.
5. Los resultados de pruebas simuladas no se presentan como pruebas de integración real.

## Agenda priorizada

### A. Estabilización de Messenger y Kernel — prioridad inmediata

- [x] ActionRouter con resolución previa de postbacks y quick replies deterministas.
- [x] Menú principal y ayuda como respuestas estáticas; consulta patrimonial como pregunta canónica hacia el agente documental.
- [x] Pruebas unitarias del enrutamiento determinista incorporadas a `npm test`.
- [ ] Verificar el recorrido de extremo a extremo: payload Meta → normalización → ActionRouter → Kernel → composición de respuesta → Graph API.
- [ ] Probar botones conocidos, botones desconocidos, texto libre y quick replies de texto sin romper el flujo semántico.
- [ ] Formalizar el contrato de decisión y de respuesta final entre Kernel, Messenger y el agente documental.

**Criterio de cierre:** pruebas reproducibles que demuestren qué camino sigue cada tipo de evento y qué mensaje recibe el usuario.

### B. Guerrilla Axial Pipelines y transporte de eventos — prioridad inmediata

- [x] Transporte Redis Lists implementado en `main` como implementación previa.
- [x] Rama de revisión AXIAL v0.3 con Redis Streams, Consumer Groups, deduplicación, Event Ledger, reintentos, DLQ y replay.
- [x] CI de regresión general aprobado en el último run revisado del PR #17.
- [ ] Configurar credenciales de una base Upstash **no productiva** como secretos de GitHub Actions.
- [ ] Ejecutar la suite de resiliencia contra Redis real; el último intento se detuvo antes de ejecutar pruebas por falta de esos secretos.
- [ ] Verificar recuperación de eventos pendientes, leases vencidas, ACK idempotente, reintentos y DLQ.
- [ ] Aclarar el modelo de ejecución del worker: `waitUntil` prolonga el trabajo de la invocación actual, pero no sustituye un scheduler durable.
- [ ] Reconciliar documentación y código para describir con exactitud el flujo real, el ACK a Meta y la recuperación de reintentos.
- [ ] Revisar y cerrar PR #17 antes de cualquier integración.

**Criterio de cierre:** regresión aprobada y evidencia de integración real en un entorno aislado. No usar Redis de producción para pruebas de estrés.

### C. RAG institucional y atención humana

- [ ] Revisar PR #15 (filtrado bibliográfico) y comprobar compatibilidad con el Kernel actual.
- [ ] Revisar PR #12 (mensajería unificada, contexto conversacional y notificaciones Outlook) por separado; mantener el envío externo deshabilitado hasta aprobación.
- [ ] Revisar los niveles de fuentes documentales y la política de respuesta.
- [ ] Confirmar que consultas que requieren contacto humano no se resuelvan con una ficha documental genérica.
- [ ] Definir registro, supervisión y escalamiento humano sin exponer datos privados en logs.

**Criterio de cierre:** respuestas institucionales trazables, fuentes pertinentes y derivaciones humanas probadas.

### D. Portada, gadgets y servicios web — alcance protegido

**Gadgets existentes que deben conservarse:**
- [x] Mini Pizarra.
- [x] Historiografía de Tucumán.
- [x] AXIAL · TruthTable.
- [x] Portal lateral de créditos, novedades y proyectos.

**Nuevo frente incorporado a la agenda:**
- [ ] Gadgets de encuestas: definir propósito, preguntas, población destinataria, mecanismo de respuesta, resultados y criterios de privacidad.
- [ ] Diseñar la experiencia de consulta y participación sin reemplazar el chat institucional ni los gadgets actuales.
- [ ] Determinar si las encuestas serán institucionales, de opinión/sondeo o de evaluación de servicios; separar esos usos y sus políticas.
- [ ] Definir almacenamiento, anonimización o identificación, retención y acceso a resultados antes de implementarlas.
- [ ] Incorporar un módulo de encuestas a la portada solo tras revisión visual y aprobación.

**Criterio de cierre:** los gadgets actuales permanecen intactos y el nuevo gadget de encuestas tiene alcance y protección de datos definidos antes de programarse.

### E. Capo y recursos interactivos

- [ ] Mantener Capo como vizcacha argentina; conservar identidad visual aprobada.
- [ ] Separar recursos del frontend, modelos 3D y documentación de la lógica backend.
- [ ] Validar accesibilidad, rendimiento móvil y movimiento reducido cuando se integren experiencias interactivas.

### F. Calidad, dependencias y despliegue

- [ ] Mantener `npm test` como puerta única de regresión de aplicación.
- [ ] Mantener pruebas de integración Redis en un workflow separado que requiera secretos de staging.
- [ ] Actualizar `package-lock.json` con npm, nunca editando manualmente versiones o integridades.
- [ ] Registrar para cada Preview: rama, SHA completo, URL y pruebas efectivamente ejecutadas.
- [ ] Verificar el HTML desplegado para confirmar que los gadgets esperados siguen visibles.
- [ ] No desplegar a Production ni fusionar PR sin revisión y aprobación explícita.

## Orden operativo inmediato

1. Resolver PR #17 en su rama: auditar el diff, atender fallos y verificar suites.
2. Obtener una ejecución de resiliencia real contra Upstash no productivo; mientras no existan secretos, registrar ese punto como bloqueado, no como aprobado.
3. Cerrar el contrato Messenger–ActionRouter–Kernel y las pruebas end-to-end.
4. Revisar PR #12 y #15 de forma independiente.
5. Producir el diseño funcional de encuestas, sin modificar todavía la portada.
6. Ejecutar validación visual/funcional de gadgets y solo entonces preparar cualquier integración.

## Registro de integridad

Esta agenda es un plan consolidado y una lista de control. Una casilla marcada como implementada refleja presencia en código o CI observado, no necesariamente validación end-to-end ni operación real. Ningún cambio de esta agenda autoriza una publicación en producción.
