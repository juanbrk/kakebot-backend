# Session Log

## 2026-04-19: Logging estructurado con firebase-functions/logger

### Completado
- **Nueva feature**: módulo `helpers/logger.ts` que envuelve `firebase-functions/logger` con `log.info`, `log.warn`, `log.error`
- Serialización explícita de `error: unknown` → `error.message`, `error.stack`, `error.name` en Cloud Logging
- 16 `console.error` reemplazados en 8 archivos de producción: `photo.ts` (7), `card.ts` (2), `tax.ts`, `invoice.ts`, `receipt-direct.ts`, `telegram.ts`, `index.ts`, `middleware/auth.ts`
- `dev.ts` sin cambios (startup logs locales se mantienen como `console.log`)
- **Tech debt corregido**: `attachInvoiceToInstallment` y `attachReceiptToInstallment` refactorizados de 5 parámetros posicionales a `AttachInvoiceParams` / `AttachReceiptParams` en `types/handlers.types.ts`
- Build: ✅ 0 errores — Lint: ✅ 0 errores

### Pendiente
- Deploy a botitio_testitoBot: verificar que logs aparecen con `severity: ERROR` (no `DEFAULT`) en Cloud Logging
- Confirmar que campos estructurados (`module`, `userId`, `error.message`, `error.stack`) son visibles en Log Explorer
- Agregar `kakebot-firebase-loggers` al language map en `~/.claude/settings.json` para commits en español
## 2026-04-18: Bug fix — Parsing de decimales con punto en ingreso de montos

### Completado
- **Bug fix**: `parseArgentineAmount()` trataba punto con 3+ dígitos como separador de miles (`157.324` → 157324); ahora siempre es decimal
- `AMOUNT_PATTERN` regex reescrito con 3 alternativas ordenadas: formato AR completo (`238.130,00`), separador único (punto o coma), entero
- Truncamiento a 2 dígitos: `157.324` → `157.32`, `9.9999` → `9.99` (sin redondear); casos con coma sin cambios
- Documentada regla "Decimal Input Parsing" en `conventions.md` con tabla de ejemplos y excepción formato AR
- Build + lint: ✅ 0 errores, 0 errores nuevos

### Pendiente
- Testing en emuladores: ingresar montos con decimales en flujos de servicios, impuestos y gastos
## 2026-04-17: Reporte Métodos de Pago + reestructuración del menú Reportes

### Completado
- **Migración de tipos**: `Service`, `ServiceInstallment`, `ServicePaymentMethod` movidos de `types/index.ts` (congelado) a `types/service.types.ts`; todos los consumers actualizados (8 archivos)
- **Nuevo servicio**: `services/payment-method-report.service.ts` — agrupa servicios por método de pago, muestra cuota del mes en curso con monto y fecha de vencimiento (`$ -` si no hay cuota)
- **Nuevo handler**: `bot/handlers/payment-method-report.ts` — action `menu_payment_methods`, back a `rep_servicios`
- **Menú Reportes reestructurado**: submenúes Balances / Pagos / Servicios con breadcrumbs actualizados; `handleRepHistory` redirige back a `rep_balances`
- **Descripciones en menús**: cada pantalla de menú muestra bullets explicativos debajo de "¿Qué querés ver?"
- **Nueva regla**: `.claude/rules/shared/reports-menu.md` — estructura del menú, breadcrumbs, back-navigation y guía paso a paso para agregar nuevos reportes
- Build + lint: ✅ 0 errores

### Pendiente
- Testing en emuladores: navegar Menú → Reportes → verificar submenúes y reporte Métodos de Pago

---

## 2026-04-16: Método de pago en impuestos — registro, edición y corrección de UX

### Completado
- **Feature**: al crear un impuesto, el flujo ahora solicita el método de pago (Tarjeta de Crédito, Débito Automático, Manual) después del día de vencimiento
- El campo `paymentMethod` se guarda en el documento del impuesto en Firestore
- La vista de detalle muestra el método registrado (o "No registrado" si no hay)
- Nuevo botón "Modificar" en la vista de detalle → pantalla de edición → cambio de método de pago
- El reporte mensual muestra el método entre paréntesis junto al monto en la sección IMPUESTOS
- **Bug fix**: eliminado botón "Volver" del teclado de selección de método en el flujo de edición (loop cerrado)
- **Bug fix**: agregado guard en `text.ts` para `tax_awaiting_payment_method` — evita caída al parser de gastos si el usuario escribe texto en ese estado
- Build: ✅ 0 errores

### Pendiente
- Testing en emuladores: flujo crear impuesto con método de pago, editar método, reporte con método visible

---

## 2026-04-16: Comandos de generación de tickets (feature, bug, mejora, automatización)

### Completado
- Creados 4 comandos en `.claude/commands/`: `/feature`, `/bug`, `/improvement`, `/automatizacion`
- Cada comando detecta automáticamente el modo de operación:
  - **RETROACTIVO**: hay cambios en git → genera el ticket como si no estuvieran implementados todavía
  - **DESCRIPCIÓN**: sin cambios + texto en `$ARGUMENTS` o respuesta del usuario → genera desde descripción
  - **PROMPT**: sin cambios y sin args → pregunta la descripción y espera
- En modo DESCRIPCIÓN: ofrece invocar la secuencia de personas recomendada post-ticket
- Cada ticket incluye un `**Nombre:**` sugerido antes del cuerpo
- Agregado template "Automatización" en `user-preferences.md` (cuarto tipo de ticket)

### Pendiente
- Ninguno

---

## 2026-04-15: Mejora — Listado de servicios agrupado en secciones por estado

### Completado
- **Feature**: "Listar servicios" deja de mostrar lista plana y muestra 5 secciones diferenciadas
  - **Vencidos**: cuota registrada, impaga, `dueDate` anterior a hoy (más urgente, aparece primero)
  - **Próximos a vencer**: cuota registrada, impaga, vence dentro de 7 días (mismo threshold que `handleShowUpcoming`)
  - **Pagados**: cuota registrada y marcada como pagada
  - **Pendientes**: cuota registrada, impaga, vence en más de 7 días
  - **Sin cuota**: sin cuota registrada para el mes actual
- Secciones vacías se omiten; dentro de cada sección orden ascendente por `dueDate`
- Texto diferenciado: vencidos muestran `venció DD/MM`, futuros muestran `vence DD/MM`
- **Optimización Firestore**: `handleListServices` reemplaza N llamadas a `getInstallment` por 1 sola query a `getInstallmentsForMonth`
- **Archivos modificados**: `bot/handlers/service.ts`, `bot/keyboards/service.ts`
- Build + lint: ✅ 0 errores, 0 warnings nuevos

### Pendiente
- Testing en emuladores con datos reales: verificar las 5 secciones

---

## 2026-04-15: Bug fix — Telegraf callback handlers UX (stale keyboards) en tax.ts

### Completado
- **Bug identificado**: En el flujo de registro de cuota de impuesto, al presionar "No" en "¿Deseas marcar como pagada?", el bot enviaba `ctx.reply()` (nuevo mensaje) antes de editar el prompt original → mensajes desordenados + keyboard huérfano
- **Patrón correcto establecido**: En `bot.action()` handlers, el mensaje con el botón presionado SIEMPRE debe editarse (`ctx.editMessageText`) como respuesta primaria; follow-up va como `ctx.reply()` separado
- **5 funciones corregidas en `bot/handlers/tax.ts`**:
  - `handlePaidNo` — reemplazó `ctx.reply()` + `showTaxActionView()` por `ctx.editMessageText(context+detail)` + `ctx.reply(submenu)`
  - `handlePaidYes` — agregó `ctx.editMessageText("✅ Cuota marcada...")` antes de enviar prompt de comprobante
  - `handleMarkAsPaid` — reemplazó `ctx.reply()` por `ctx.editMessageText("✅ Cuota marcada...")`
  - `handleAttachReceipt` — reemplazó `ctx.reply()` por `ctx.editMessageText("*Enviá la foto...")`
  - `handleSkipReceipt` — reemplazó `ctx.reply()` por `ctx.editMessageText("Listo...")`
- Build + lint: ✅ 0 errores, 0 warnings nuevos

### Pendiente (próxima sesión)
- Implementar convención + hook:
  - Crear `.claude/rules/shared/telegram-callback-ux.md`
  - Crear `.claude/hooks/check-callback-pattern.js` (PostToolUse advisory, exit 0, stderr)
  - Registrar en `.claude/settings.json` + `.claude/settings.example.json`
  - Agregar fila en CLAUDE.md rules table
  - Actualizar `shared/memory-decisions.md`

---

## 2026-04-14: Hooks PostToolUse — Migración a stderr + investigación de visibilidad

### Completado
- **Investigación**: ¿Por qué los hooks PostToolUse se ejecutan silenciosamente?
  - Root cause: PostToolUse hooks escriben a stdout (console.log), Claude Code solo captura stderr
  - PreToolUse hooks escriben a stderr → visibles; PostToolUse escriben a stdout → invisibles
- **Cambios en 3 hooks PostToolUse** (migrados a stderr):
  - `env-change-guard.js`: `console.log()` → `process.stderr.write()`
  - `typecheck-feedback.js`: `console.log()` → `process.stderr.write()`
  - `lint-feedback.js`: `console.log()` → `process.stderr.write()`
- **Verificación de funcionalidad**: ✅ Todos 3 hooks funcionan correctamente
  - `env-change-guard.js`: Detecta variables en `.env.prod` (estructura validada)
  - `typecheck-feedback.js`: `tsc --noEmit` detecta TS2322 type mismatch (verificado manualmente)
  - `lint-feedback.js`: `eslint` detecta 4 violaciones: no-var, unused-vars (x2), semi (verificado manualmente)
- Build + lint: ✅ 0 errores después de limpiar cambios de prueba

### Estado actual de hooks
| Hook | Tipo | Funciona | Visible |
|------|------|----------|---------|
| `protect-sensitive-files.js` | PreToolUse | ✅ | ✅ (stderr) |
| `check-list-bullets.js` | PreToolUse | ✅ | ✅ (stderr) |
| `check-param-patterns.js` | PreToolUse | ✅ | ✅ (stderr) |
| `env-change-guard.js` | PostToolUse | ✅ | ⚠️ (stderr, no capturado) |
| `typecheck-feedback.js` | PostToolUse | ✅ | ⚠️ (stderr, no capturado) |
| `lint-feedback.js` | PostToolUse | ✅ | ⚠️ (stderr, no capturado) |
| `track-modified-file.js` | PostToolUse | ✅ | N/A (silencioso) |
| `commit-dream-check.js` | PostToolUse | ✅ | N/A (Bash matcher) |
| `check-session-params.js` | Stop | ✅ | ✅ (stderr) |

### Pendiente
- Claude Code podría mejorar captura de stderr de PostToolUse hooks en futuras versiones
- Cuando eso suceda, los 3 hooks serán visibles automáticamente

---

## 2026-04-13: Tarjetas en Próximos Vencimientos

### Completado
- **Feature**: resúmenes de tarjeta (CardStatement) ahora aparecen en "Próximos Vencimientos"
- **Archivos modificados**:
  - `firestore.indexes.json`: nuevo índice `card_statements (telegramUserId, isPaid, dueDate)`
  - `types/card.types.ts`: nueva interface `CardStatementForDue { cardLabel, amountARS, dueDate }`
  - `services/card.service.ts`: nueva función `getUpcomingUnpaidCardStatements(userId, daysAhead)` — query compound + batch fetch de cards para resolver labels
  - `types/upcoming-dues.types.ts`: `UpcomingDueEntityType` extendido con `"card"`
  - `services/upcoming-dues.service.ts`: `getUpcomingDues` actualizado con tercer branch (cards) en Promise.all y mapping a UpcomingDueItem
- **Sin cambios**: handler `upcoming-dues.ts` (ya era genérico), `report-history.ts`, `telegram.ts`
- Build + lint: ✅ 0 errores, 0 warnings nuevos
- **Nota**: `buildCardLabel` existe en `bot/keyboards/card.ts` — NO importar desde service layer; replicar la lógica inline

### Pendiente
- Deploy del nuevo índice: `firebase deploy --only firestore:indexes`
- Esperar que index pase a "Enabled" (~5-10 min) antes de deploy a prod
- Testing en emuladores con card_statement de isPaid=false y dueDate en próximos 7 días

## 2026-04-09: Feature Próximos Vencimientos — implementación completa

### Completado
- **Feature**: reporte "Próximos Vencimientos" en menú Reportes (solo servicios e impuestos impagos)
- **Archivos creados**:
  - `types/upcoming-dues.types.ts`: `UpcomingDueEntityType`, `UpcomingDueItem`, `UpcomingDuesBucket`, `UpcomingDuesResult`
  - `services/upcoming-dues.service.ts`: `getUpcomingDues(userId)` — fetch paralelo + agrupación en buckets no superpuestos (días 0-3, 4-5, 6-7)
  - `bot/handlers/upcoming-dues.ts`: `registerUpcomingDuesHandler` + formateo con prefijos `[Svc]`/`[Imp]`
- **Archivos modificados**:
  - `services/tax.service.ts`: agregada `getUpcomingUnpaidTaxInstallments(userId, daysAhead)` — mirror de la función equivalente en service.service.ts
  - `firestore.indexes.json`: nuevo índice `tax_installments (telegramUserId, isPaid, dueDate)` para query de próximos vencimientos
  - `bot/handlers/report-history.ts`: botón "Próximos Vencimientos" → `menu_upcoming` en menú de Reportes
  - `bot/telegram.ts`: registro de `registerUpcomingDuesHandler`
- **Decisiones clave**:
  - Tarjetas excluidas (CardStatement no tiene `isPaid`) → ticket de mejora generado
  - Buckets no superpuestos: cada ítem aparece en una sola sección
  - Action: `menu_upcoming`, back: `menu_reportes`
- Build + lint: ✅ 0 errores, 0 warnings nuevos

### Pendiente
- Testing en emuladores: flujo completo Menú → Reportes → Próximos Vencimientos
- Deploy a botitio_testitoBot
- **Antes de prod**: verificar que el nuevo índice `tax_installments (telegramUserId, isPaid, dueDate)` esté "Enabled" en Firebase Console

### Ticket de mejora generado: Estado de Pago en Tarjetas
- Agregar `isPaid` + `paidAt` a `CardStatement`
- Nueva función `markStatementAsPaid` en card.service.ts
- Nuevo índice `card_statements (telegramUserId, isPaid, dueDate)`
- Integrar tarjetas en upcoming-dues con prefijo `[TC]`

## 2026-04-07: Feature Impuestos — implementación completa

### Completado
- **Feature completa**: sección Impuestos en KakeBot (réplica del dominio Servicios con prefijo `tax_`)
- **Archivos creados**:
  - `types/tax.types.ts`: interfaces `Tax` y `TaxInstallment`
  - `services/tax.service.ts`: CRUD completo (`createTax`, `getTaxesByUser`, `getTaxById`, `saveTaxInstallment`, `getTaxInstallment`, `getTaxInstallmentById`, `markTaxInstallmentAsPaid`, `saveTaxReceiptUrl`, `getTaxInstallmentsForMonth`)
  - `bot/keyboards/tax.ts`: 6 builders de keyboards
  - `bot/handlers/tax.ts`: `registerTaxHandler` + 3 handlers exportados para text.ts
- **Archivos modificados**:
  - `types/index.ts`: `TaxSessionState` + fields `taxId?`, `taxName?`, `taxInstallmentId?` en Session
  - `firestore.indexes.json`: índice compuesto `tax_installments (telegramUserId, dueMonth)`
  - `services/storage.service.ts`: `uploadTaxReceipt`
  - `bot/handlers/text.ts`: 3 bloques de estado tax
  - `bot/handlers/photo.ts`: detección `tax_awaiting_receipt` + upload handlers
  - `bot/telegram.ts`: registro de `registerTaxHandler`
  - `bot/handlers/menu.ts`: botón "Impuestos" entre Servicios y Tarjetas
  - `services/report.service.ts`: 5ª query, hasNoData, sección IMPUESTOS en detalle, egresosTotal + Impuestos en balance
- **Decisiones clave**:
  - `estimatedDueDay` en entidad `Tax` (no en installment); capado con `getDaysInMonth` al crear cuota
  - `taxInstallmentId` en session (distinto de `installmentId` de servicios, sin colisión)
  - Ordenamiento en código, no en Firestore (evita índices adicionales)
- Build + lint: ✅ 0 errores

### Pendiente
- Testing en emuladores: flujos crear impuesto, registrar cuota, marcar pagado, adjuntar comprobante, reporte
- Deploy a botitio_testitoBot para validación end-to-end

---

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
