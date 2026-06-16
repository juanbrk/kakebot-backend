# Session Log

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
