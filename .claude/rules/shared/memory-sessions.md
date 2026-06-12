# Session Log

## 2026-06-12: techDebt/wizard-layer-all-flows — Migración completa a WizardScene

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

## Collapsed Sessions (older)

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
