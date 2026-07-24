# Session Log

## 2026-07-23: Desmarcar cuota de impuesto pagada, con sub-flujo de comprobante

### Completado
- Nuevo botón "Marcar como no pagada" en el detalle de cuota de impuesto (Historial): revierte a Pendiente. Si tenía comprobante, sub-flujo Conservar/Borrar (borrado también en GCS), migrado a WizardScene tras QA para que no caiga al parser de gastos ni deje botones clickeables indefinidamente.
- Introduce el patrón "unmark" y el primer borrado en GCS del proyecto; "Marcar como pagado" saltea el prompt de comprobante si ya había uno.
- Dos rondas de QA (10+4 casos) cerradas: textos de contexto ajustados, QA #8 confirmado como comportamiento esperado (no bug); dos observaciones de una QA de seguimiento (botones Conservar/Borrar desaparecen tras resolverse, comprobante oculto mientras la cuota no está pagada) confirmadas como comportamiento esperado, no bugs.
- Duplicación entre las dos ramas de la decisión Conservar/Borrar extraída a un helper compartido (`resolveUnpayDecision`); de paso se corrigió que el primer commit de la rama había quedado incompleto (dos funciones de `tax.service.ts` referenciadas por el handler y la escena pero nunca exportadas — el build no compilaba desde ese commit en soledad).
- Build + lint OK en todo momento.

### Pendiente
- Ninguno — a la espera del commit final de Juan.

## 2026-07-23: Cierre del ticket session-state-handler-guard (obsoleto) + limpieza de docs

### Completado
- Investigación confirmó que el ticket (hook para validar handlers de `SessionState` en `text.ts`) quedó sin objeto: la migración a WizardScene eliminó el union `SessionState` y el despacho global por estado; el hook era inconstruible e innecesario. Cerrado sin implementación.
- Limpiados dos comentarios JSDoc reliquia que aún describían el difunto "session state"; ahora reflejan la entrada a la scene. Build + lint OK.

### Pendiente
- Commit (a cargo del usuario).

## 2026-07-23: Auditoría post-QA — fixes de edición, docs corregidas, y dos follow-ups menores resueltos

### Completado
- Los fallos reales de edición ya no pasan desapercibidos, y un bug relacionado quedó corregido; ambos validados en botitio_testitoBot.
- Corregida documentación de deploy desactualizada y formalizado un checklist de sincronización de hooks entre worktrees.
- De los 5 follow-ups que había dejado la auditoría, se resolvieron los dos de menor riesgo: un patrón de confirmación inconsistente en dos pantallas compartidas, y una suposición no documentada sobre cómo se entra a ciertos flujos. Build, lint y QA en botitio_testitoBot cerrados (10/10).

### Pendiente
- Commit (a cargo del usuario).
- Los otros 3 follow-ups siguen abiertos: uno espera datos de uso real antes de decidir el fix; los otros dos quedan fuera de esta rama.

### Pendiente
- Merge a main (a cargo de Juan); post-merge `git pull` en el worktree de main — el hook llega solo, no hace falta copiarlo.
- Tickets A-E de la auditoría pendientes de abrir (detalle en `memory-decisions.md`, entrada 2026-07-22).

## 2026-07-16: Unificación de edits cosméticos bajo replyOrEdit + hook de enforcement — QA cerrada

### Completado
- Los 88 edits cosméticos restantes migrados a `replyOrEdit` (15 archivos); regla de tres vías cerrada y documentada en `conventions.md` + `wizard-scenes.md §9`; nuevo hook `check-raw-edit-message.js` bloquea el edit pelado. Grep de aceptación en 0; build + lint limpios (baseline de warnings sin cambios).
- QA completa en botitio_testitoBot confirmada por el usuario: doble-tap en Reportes → Balances sin error/stack trace; flujos servicio, tarjeta e impuesto validados end-to-end (incluidos doble-taps de navegación en cada uno).

## 2026-07-15: Resiliencia en confirmaciones write-then-edit (editOrReply) + eliminación de código muerto

### Completado
- Nuevo helper que evita perder la confirmación al usuario cuando falla la edición de un mensaje después de guardar un cambio; migrados todos los flujos afectados (16 sitios en total).
- Auditados todos los edits restantes del bot: la mayoría eran cosméticos y no necesitaban cambios; se encontró un caso oculto (reemplazo de cuota duplicada), que una investigación posterior confirmó como código inalcanzable — el fix inicial fue reemplazado por la eliminación completa del subsistema (`service.scene.ts`, `keyboards/service.ts`, `service.service.ts`, `partialAmount` en `ServiceWizardState`).
- Validado en botitio_testitoBot (helper), build + lint limpios (eliminación).

## 2026-07-12/13: Botón "Marcar como pagado" en submenú de impuesto + fix validación comprobante

### Completado
- Nuevo botón "Marcar como pagado" en el submenú principal del impuesto (evita pasar por Historial).
- Bug fix: esa acción (y la de Historial) no validaba la respuesta al pedir comprobante; texto libre disparaba el flujo de gasto. Corregido entrando a la escena del wizard.
- Build + lint OK.

## 2026-07-11: Vencimiento por cuota del impuesto — cleanup final y validación de reportes

### Completado
- Se elimina `estimatedDueDay` del impuesto; "Cambiar vencimiento" pasa al detalle de cada cuota y edita su propio vencimiento, validado contra el mes de esa cuota.
- Nuevo helper `formatDueDateDayMonth` reemplaza el cálculo inline duplicado; el detalle del impuesto (`showTaxActionView`) también muestra ahora el vencimiento de la cuota actual.
- Investigación confirmó que los reportes (balance mensual, Próximos Vencimientos, Métodos de pago) ya eran compatibles con el cambio; de paso se corrigió que la sección IMPUESTOS del reporte mensual no mostraba `(vence dd/mm)`/`(Pagado) ✅` como sí hacen SERVICIOS y TARJETAS.
- Build + lint OK en todo momento.

## 2026-07-10: Día de vencimiento por cuota + editar vencimiento estimado del impuesto

### Completado
- "Nueva cuota" ahora pide el día de vencimiento de la cuota (Mes → Monto → Día → ¿Pagada?), validado contra el mes; el flujo de creación también lo pide para su primera cuota. Nuevo step `stepHandleInstallmentDueDay` en `tax.scene.ts`.
- Submenú Modificar tiene "Cambiar vencimiento": edita `estimatedDueDay` vía texto libre (1-31) por nueva ruta de entrada al scene, espejando el patrón `edit_day` de `service.scene.ts`. Nuevo `updateTaxEstimatedDueDay` + handler `handleChangeDueDay`. Build + lint OK.

## 2026-07-08: Documentar patrón de archivo como input primario en WizardScenes

### Completado
- Nueva subsección en `wizard-scenes.md` §7.3 para escenas donde el archivo es el input primario (varios cursores válidos, sin mensaje de error al reemplazar archivo); referencia canónica `doc-router.scene.ts`. Ítem agregado al checklist pre-PR §16 y fila nueva en la tabla de referencias. Cambio puramente documental, sin código.

### Pendiente
- Commit (a cargo del usuario)

## 2026-07-06: Ordenar Métodos de Pago por vencimiento

### Completado
- Cada sección del reporte de Métodos de pago ordena sus servicios ascendente por `dueDate`; los sin cuota del mes (`$ -`) van al final. Nuevo helper `sortByDueDateAscending` aplicado en `buildSection` (`payment-method-report.service.ts`). Build + lint OK.

## 2026-07-05: Estado vacío en el submenú de Impuestos

### Completado
- `openTaxesMenu` consulta `getTaxesByUser`: sin impuestos muestra "No tenés ningún impuesto registrado." y oculta "Mis impuestos" (nuevo `buildTaxesEmptyStateKeyboard`, espeja patrón de tarjetas). Con impuestos, sin cambios. Build + lint OK, QA manual validado. TICKET.md actualizado.

### Pendiente
- Commit y merge a main (a cargo del usuario)

## 2026-07-03: Editar mensajes al marcar resumen de tarjeta como pagado

### Completado
- La confirmación y la pregunta de moneda editan el mensaje de opciones en vez de crear uno nuevo; la rama USD muestra contexto (mes · tarjeta) antes del selector de moneda. Caso 1 (solo ARS) sin cambios.
- "Adjuntar" separa contexto e instrucciones. Build + lint OK.

### Pendiente
- Test en botitio_testitoBot (Casos 2 y 3) y commit (a cargo del usuario)
## 2026-07-03: Sección "Vencen hoy" en Próximos Vencimientos

### Completado
- Nueva sección "Vencen hoy"; buckets robustecidos para tolerar cualquier horario, no solo medianoche exacta
- Fechas de vencimiento (servicio/impuesto/tarjeta) ahora se construyen sin depender del huso horario del servidor
- Build + lint OK, QA manual validado

### Pendiente
- Commit (a cargo del usuario)

## 2026-07-02: Omitir prompt de comprobante al marcar cuota pagada si ya tiene comprobante

### Completado
- `handleMarkAsPaid` y `handleMarkAsPaidFromService` (bot/handlers/service.ts): si la cuota ya tiene `receiptUrl`, se omite la escena de comprobante y se vuelve al origen (detalle de cuota / menú de servicio)
- Build + lint OK, validado end-to-end en botitio_testitoBot (ambos entry points, con y sin comprobante previo)

### Pendiente
- Commit (a cargo del usuario)

## 2026-06-16: Mostrar USD en Próximos Vencimientos y balance de Egresos

### Completado
- Resúmenes de tarjeta con `amountUSD > 0` muestran el monto USD en Próximos Vencimientos (ítem y header de bucket)
- Header `*EGRESOS*` del balance mensual muestra el pendiente USD cuando aplica
- TICKET.md actualizado para reflejar la implementación real (formato `U$S`, headers, fix EGRESOS)

### Pendiente
- Ninguno

## 2026-06-12: techDebt/wizard-layer-all-flows — Migración completa a WizardScene
## 2026-06-03: GitHub Actions updated to Node.js 24 compatible versions
## 2026-06-14: Fix pipeline de deploy — warnings de deprecación eliminados

### Completado
- Node.js 20 → 22 en los tres workflows y en `engines.node` de functions
- firebase-functions v5.1.1 → v7.2.5 (API compatible, sin cambios en source)
- WIF keyless reemplaza FIREBASE_TOKEN; provider path y IAM binding del SA corregidos vía GCP CLI
- 4 GCP APIs habilitadas manualmente: eventarc, run, cloudbuild, cloudbilling
- Cloud Functions fijada a Gen 1 — imports `firebase-functions/v1` y `firebase-functions/logger` previenen upgrade forzado a Gen 2

### Pendiente
- Merge a main y confirmar deploy sin warnings
- Borrar secret `FIREBASE_TOKEN` de GitHub post-confirmación

## 2026-06-12: techDebt/wizard-layer-all-flows — Migración completa a WizardScene

## 2026-06-02: Consolidación de memoria (/mem-consolidate)

### Completado
- 15 sesiones de abril colapsadas a one-liners; 5 más recientes (mayo) mantenidas completas
- Tipos actualizados en MEMORY.md: agregados `handlers`, `logger`, `telegraf-context`
- WizardScene (POC estado actual) documentado en `.claude/memory/MEMORY.md`
- `dream-state.json` actualizado; fecha de hooks en global MEMORY.md corregida a 2026-06-02

### Pendiente
- Ninguno

## 2026-05-25: POC — Flujo de ingresos migrado a WizardScene de Telegraf

### Completado
Migración de todos los flujos conversacionales del bot (9 dominios) del sistema legacy de sesión Firestore a `Scenes.WizardScene` nativo de Telegraf. Trabajo previo al branch incluye: impuestos (feature completa + comprobantes multicurrency en tarjetas + próximos vencimientos + logging estructurado + /worktree automation).

**Reglamento y tooling:**
- `wizard-scenes.md` (17 secciones + checklist pre-PR) — estándar único para toda escena nueva o migrada
- Hook `check-wizard-scene.js` — 8 chequeos estructurales sobre `*.scene.ts`
- `helpers/wizard.ts` — `getMessageText` compartido entre scenes

**Oleadas de migración:**
- POC: `income.scene.ts` — validó el patrón con store Firestore (`telegraf_sessions`)
- Oleada A: `expense.scene.ts`, `bulk.scene.ts`, `doc-router.scene.ts`
- Oleada B: `invoice.scene.ts` (flujos factura + comprobante vía `entryArgs`), `categorize.scene.ts`, `doc-router.scene.ts` reconectado directo a invoice (abandon bridge)
- Oleada C: `service.scene.ts` (12 steps, 7 entry routes), `card-create.scene.ts`, `card-stmt.scene.ts` (create, receipt_pdf, pago ARS/USD, edición, comprobantes standalone)

**Cleanup final:**
- `session.service.ts` eliminado; `Session`/`SessionState` removidos de `types/index.ts`
- Sub-types eliminados: `ExpenseSessionState`, `DocSessionState`, `InvoiceSessionState`, `ReceiptSessionState`, `CategorySessionState`, `ServiceSessionState`, `CardSessionState`, `TaxSessionState`
- `pendingFileId`, `pendingFileType` y ~30 campos de sesión legacy removidos
- Bug fix en `finishCategorizingFlow`: gastos omitidos filtraban via `alreadyProcessed` Set para evitar error 400

**Audit pre-merge:** `/audit-pr` — 3 MAJOR + 5 MINOR corregidos, build ✅ lint ✅ botitio_testitoBot ✅

### Pendiente
- Merge a main
### Pendiente
- Deploy a botitio_testitoBot en modo webhook para validación final
- Camino C: migrar flujos restantes (servicio, impuesto, tarjeta, gasto, etc.)

## 2026-05-21: Recordatorio percepción RG 5617 al pagar resumen en USD

### Completado
- `handleUsdPaymentCurrencyUSD` (card.ts) envía `ctx.reply()` con recordatorio de descontar percepción RG 5617 entre el confirm y el prompt de comprobante ARS
- Solo aplica a la rama "Dólares"; rama "Pesos" sin cambios
- Build + lint: 0 errores, 0 warnings nuevos

### Pendiente
- Test en emuladores y commit

## 2026-05-21: Bug fix — Cuotas duplicadas en servicios e impuestos

### Completado
- Selector de mes filtra meses con cuota existente antes de mostrar el teclado (servicios e impuestos)
- Guard: si los 3 meses próximos ya tienen cuota, se muestra mensaje y se corta el flujo

### Pendiente
- Ninguno

## 2026-05-18: Sección TARJETAS completa en reporte mensual

### Completado
- Resúmenes de tarjeta en reporte: montos ARS/USD por tarjeta, equivalente en pesos al TCV, desglose en balance
- USD pendiente de conversión correcto en título y balance (no muestra USD ya pagados en ARS)
- Dead code eliminado (`saveStatementPaymentReceiptUrl`)

### Pendiente
- Ninguno

## 2026-05-04: Pulido UX del flujo de pago multicurrency

### Completado
- Prompts TCV simplificados, etiquetas "TCV" → "Tipo de cambio", summary con TCV en paréntesis
- Edición USD en resúmenes no pagados va directo a confirmar (sin moneda ni TCV)

## Collapsed Sessions (older)

## 2026-04-29: UX de pago multicurrency en resúmenes de tarjeta (Commit 2b) — Flujo completo con selección moneda ARS/USD, TCV, handlers de skip/upload y buildPaymentSummaryText
## 2026-04-28: Comprobantes multicurrency en resúmenes de tarjeta (Commit 1) — Schema CardStatement migrado a receiptUrlARS/receiptUrlUSD/exchangeRate; nuevos keyboards y handlers
## 2026-04-27: Ordenamiento cronológico en historial de cuotas — getInstallmentsByService corregido a sort ascendente; JSDoc corregido en tax.ts
## 2026-04-19: Automatización de creación de worktrees (/worktree) — Script new-worktree.sh + skill /worktree; crea worktree con npm install, .env copiado y emulator-data
## 2026-04-19: Logging estructurado con firebase-functions/logger — Módulo helpers/logger.ts; 16 console.error reemplazados en 8 archivos; AttachInvoiceParams/AttachReceiptParams en handlers.types.ts
## 2026-04-18: Bug fix — Parsing de decimales con punto en ingreso de montos — parseArgentineAmount() corregido; AMOUNT_PATTERN reescrito con 3 alternativas; regla documentada en conventions.md
## 2026-04-17: Reporte Métodos de Pago + reestructuración del menú Reportes — Nuevo payment-method-report.ts; menú con submenúes Balances/Pagos/Servicios; reports-menu.md creado
## 2026-04-16: Método de pago en impuestos — Campo paymentMethod en Tax; flujo de registro y edición; método visible en reporte mensual
## 2026-04-16: Comandos de generación de tickets — 4 comandos /feature, /bug, /improvement, /automatizacion con detección retroactivo/descripción/prompt
## 2026-04-15: Mejora — Listado de servicios agrupado en secciones por estado — 5 secciones (Vencidos/Próximos/Pagados/Pendientes/Sin cuota); optimizado con getInstallmentsForMonth
## 2026-04-15: Bug fix — Telegraf callback handlers UX en tax.ts — 5 handlers corregidos al patrón editMessageText-first; patrón edit-before-reply establecido en decisions.md
## 2026-04-14: Hooks PostToolUse — Migración a stderr — 3 hooks migrados de console.log a process.stderr.write; stderr no capturado aún por Claude Code
## 2026-04-13: Tarjetas en Próximos Vencimientos — CardStatement integrado en getUpcomingDues; nuevo índice card_statements; getUpcomingUnpaidCardStatements implementado
## 2026-04-09: Feature Próximos Vencimientos — implementación completa — Tipos, servicio y handler; buckets 0-3/4-5/6-7 días con prefijos [Svc]/[Imp]/[TC]
## 2026-04-07: Feature Impuestos — implementación completa — Dominio completo: tipos, servicio, keyboards, handlers; sección IMPUESTOS en reporte mensual
## 2026-04-03: File upload bug fix + Automated secrets sync — Fixed GCS_BUCKET value, implemented .pending-secrets registry + go.sh sync integration
## 2026-03-06: Fase 3b — Recepción de comprobante como mensaje directo — Direct photo/PDF receipt flow with service selection, payment marking, and attachment
## 2026-03-06: Testing Fase 2 (Storage + Comprobantes) — Validated receipt upload end-to-end; fixed emulator startup (use only `npm run dev`)
## 2026-03-06: Estado de pago (Fase 1) + Comprobantes (Fase 2) — Added isPaid/paidAt to installments, receipt upload via GCS, photo handler, post-payment attachment flow
## 2026-03-04: Guard conditions pattern + service flow optimization — Created guard-conditions.md, reordered service flow to Mes/Dia/Monto, improved keyboard layouts
## 2026-03-03: Modularization of telegram.ts — Refactored 1267-line monolith into modular architecture with handlers/, services/, helpers/, centralized auth
## 2026-03-03: Bug fix + UI preferences + partial input — Fixed handler registration order, added button ordering convention, implemented partial expense input
## 2026-03-03: Interactive category assignment feature — Full /categorizar flow with inline keyboards, pagination, new category creation, batch expense updates
## 2026-03-02: Bot access control implementation — Implemented isAuthorizedUser() with process.env.AUTHORIZED_USER_ID, silent ignore for unauthorized users
## 2026-03-02: Code quality and documentation standards — Refactored variable naming, extracted constants/helpers, established code-docs and ticket format rules
## 2026-03-01: Initial setup and expense registration — Created bot skeleton, expense parsing, Firestore storage, monthly report, dev environment, composite indexes
