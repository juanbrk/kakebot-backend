# Session Log

## 2026-06-10: Commit 4b-4 — validado en botitio_testitoBot, Oleada C cerrada

### Completado
- Testing OK: adjuntar ARS/USD standalone, guard de texto, flujo de pago sin regresión, lista de resúmenes
- TICKET.md: items 5b y 4b-4 marcados ✅

### Pendiente
- Commit 5: cleanup final (`session.service.ts`, `TaxSessionState` de `SessionState`)

---

## 2026-06-09: Commit 4b-4 — flujos receipt_ars/receipt_usd + cleanup tipos legacy tarjeta

### Completado
- `receipt_ars` y `receipt_usd` migrados a `card-stmt.scene.ts` (steps 23–24): `stepGuardReceiptARS/USD`, `handleStandaloneARSReceiptUpload/USD`, dispatch en photo/document handlers, cases en `repromptCurrentStep`
- `handleStmtReceiptsAttachARS` y `handleAttachReceiptUSD` en `card.ts`: eliminado `setSession`; ahora entran al scene con `flow: "receipt_ars/usd"`
- Limpieza en 9 handlers de `card.ts`: eliminado read de session para `cardLabel`; siempre `getCardById`
- `CardSessionState` eliminado de `types/index.ts`; 10 campos de sesión de tarjetas removidos de `Session`
- `emptySessionForPartial` eliminado de `session.service.ts` (0 callers)
- Guard muerto `card_stmt_awaiting_month` eliminado de `text.ts`
- Build ✅ lint ✅ (0 errores)

### Pendiente
- Validar en botitio_testitoBot: Adjuntar ARS/USD desde submenú Comprobantes, flujo de pago sin regresión
- Commit 5: cleanup final (eliminar `session.service.ts`, `TaxSessionState` de `SessionState`)

## 2026-06-09: Commit 4b-3 — flujos de edición de resumen migrados a card-stmt.scene

### Completado
- Flujos `edit_ars`, `edit_usd`, `edit_day` migrados a `card-stmt.scene.ts` (steps 15–22): guards, confirm keyboards, action handlers, reprompt
- Handlers legacy de edición eliminados de `card.ts`, `text.ts`; dispatch de comprobantes de pago eliminado de `photo.ts`
- Bug fix: dueDate guardado a noon UTC para evitar edge case de timezone en `updateStatementDueDay`
- Validado en botitio_testitoBot: 13 escenarios ✅

### Pendiente
- 4b-4: comprobantes standalone (`receipt_ars`, `receipt_usd`) + cleanup tipos legacy (CardSessionState, `handleStatementsList` dead state)
- Commit 5: session.service cleanup, TaxSessionState y CardSessionState removidos de SessionState union

## 2026-06-06: Commit 4b-2 — card-stmt.scene.ts flujo de pago

### Completado
- Flujo de pago migrado a `card-stmt.scene.ts` (steps 9–14): ARS-only, USD en pesos/dólares, TCV, comprobantes ARS/USD, resumen de pago
- Handlers legacy de pago eliminados de `card.ts`, `text.ts` y `photo.ts`
- Bug fix: botones "Adjuntar" no tenían feedback visual; foto enviada desde el teclado mostraba error
- Validado en botitio_testitoBot: 10 escenarios ✅

### Pendiente
- 4b-3: edición de resúmenes pagados (`card_stmt_edit_awaiting_*` en `text.ts`)
- 4b-4: comprobantes standalone + cleanup de tipos legacy

## 2026-06-05: Commit 4b-1 — card-stmt.scene.ts (flujo create + receipt_pdf)

### Completado
- `card-stmt.scene.ts` creado con `CardStmtWizardState` (8 flujos previstos; 4b-1 cubre `create` y `receipt_pdf`)
- `card.ts`, `text.ts`, `photo.ts`: handlers legacy de creación eliminados; entry points → `scene.enter`
- Validado en botitio_testitoBot: crear pesos/dólares/ambos + PDF + historial + robustez ✅

### Pendiente
- 4b-2 (pago), 4b-3 (ediciones), 4b-4 (comprobantes standalone + cleanup tipos)
- `handleStatementsList` aún setea `card_awaiting_receipt` (dead state) → limpiar en 4b-4

## 2026-06-04: Retrospectiva + Commit 4a: card-create.scene.ts

### Completado
- §10.3 en wizard-scenes.md: regla "no llamar scene.leave() si el teclado todavía espera respuesta"
- Flujo de creación de tarjeta migrado a `card-create.scene.ts`; 3 handlers eliminados de `card.ts`

### Pendiente
- Commit 4b: `card-stmt.scene.ts`
- Commit 5: cleanup final (session.service, TaxSessionState, CardSessionState)

## 2026-06-03: Oleada C — Commit 3: service.scene.ts completo y testeado

### Completado
- `service.scene.ts` creado (12 steps, 7 entry routes, 6 scene.actions, file upload handlers)
- `ServiceWizardState` en `telegraf-context.types.ts`
- `service.ts`: 8 entry points → `scene.enter`; 5 funciones eliminadas; registraciones removidas
- `text.ts`: 6 bloques `svc_awaiting_*` + funciones eliminados
- `photo.ts`: 4 dispatches `svc_awaiting_receipt/invoice` + funciones eliminados
- `telegram.ts`: `serviceScene` agregado al Stage
- `types/index.ts`: `ServiceSessionState` eliminado de `SessionState`
- Bug fixes post-testing: `stepHandleAmount` ahora queda en escena al mostrar prompt de factura (`selectStep(INVOICE_STEP)`); `handleMarkAsPaid`/`handleMarkAsPaidFromService` entran al scene directamente — resuelve texto→expense y foto→doc-router
- Validado en botitio_testitoBot: 9 flujos + casos de robustez ✅

### Pendiente
- Commit 4a: `card-create.scene.ts`
- Commit 4b: `card-stmt.scene.ts`
- Commit 5: cleanup final (session.service, Session fields, CardSessionState, TaxSessionState)

## 2026-06-02: Oleada B completa — limpieza final de handlers legacy y tipos huérfanos

### Completado
- B4: handlers legacy de factura/comprobante eliminados de `text.ts`; archivos `invoice.ts` y `receipt-direct.ts` borrados; sus registros removidos de `telegram.ts`
- B5: `InvoiceSessionState`, `ReceiptSessionState`, `pendingFileId`, `pendingFileType`, `isNewService` eliminados de `types/index.ts`; tipos `AttachInvoiceParams`/`AttachReceiptParams` removidos de `handlers.types.ts`; comentario desactualizado en `telegraf-context.types.ts` corregido
- Oleada B totalmente cerrada: build ✅ lint ✅

### Pendiente
- Validar upload GCS en botitio_testitoBot (emulador local no tiene Storage disponible)
- Oleada C: flujos complejos pendientes (service, card-create, card-stmt)

## 2026-06-02: Oleada B — Paso 3: doc-router.scene conectado directo a invoice.scene

### Completado
- `doc-router.scene.ts` abandona el patrón bridge: los handlers de Factura/Comprobante llaman `ctx.scene.enter(INVOICE_SCENE_ID)` directamente en lugar de escribir a Firestore y dejar la escena
- UX fixes en `invoice.scene.ts`: botón Cancelar eliminado del picker de servicios y del picker de meses; salida únicamente por palabra "cancelar"
- Comportamiento de foto recibida mientras se espera selección de tipo: actualiza estado silenciosamente y re-presenta el teclado (sin mensaje de error)
- Validado en botitio_testitoBot — 8 rutas (foto+PDF × factura+comprobante × servicio existente con/sin cuota) sin regresiones

### Pendiente
- ~~B4~~, ~~B5~~ — completados en sesión siguiente

## 2026-06-01: Oleada B — categorize.scene.ts + UX fixes post-testing

### Completado
- `categorize.scene.ts`: 3 steps, 7 action handlers (cat_sel, cat_pg, cat_new, cat_skip, cat_back_to_list, cat_cancel, cancel_word)
- Keyboard: `[Omitir | + Nueva cat.]` reemplaza `[+ Agregar categoría]`; `buildExpensePromptText` simplificado
- Bug fix: `handleCatNew` usa `ctx.editMessageText` (no `ctx.reply`) para mantener el `session.messageId` apuntando al picker — `advanceOrFinish` edita el mismo mensaje in-place
- Counter fix: `skipCurrentItem` agrega el ítem omitido a `sessionExpenses` con `categoryName: ""` para que `advanceOrFinish` calcule `total` y `current` correctamente; `finishCategorizingFlow` filtra esas entradas del resumen
- Confirmación nueva categoría: `stepHandleNewCategoryName` envía `✅ Agregaste X $Y a Z.` después de crear + asignar
- `CategorySessionState` eliminado de `types/index.ts`; bloques de categorización eliminados de `text.ts`
- `categorize.ts` reducido a entry points únicamente; `CategorizeWizardState` definido en `telegraf-context.types.ts`
- Prereq (sesión anterior): `invoice.scene.ts` con rutas `flow: invoice | receipt`

### Pendiente
- B3: rewire `doc-router.scene.ts` → `ctx.scene.enter(INVOICE_SCENE_ID)`
- B4: eliminar handlers invoice/comp legacy de `text.ts` (líneas ~498-708)
- B5: borrar `InvoiceSessionState`, `ReceiptSessionState` de `types/index.ts`; `pendingFileId`/`pendingFileType` de `Session`

## 2026-05-29: Oleada A — expense, bulk y doc-router migrados a WizardScene

### Completado
- `expense.scene.ts`, `bulk.scene.ts`, `doc-router.scene.ts` creados e integrados al Stage
- `ExpenseSessionState` y `DocSessionState` eliminados de `SessionState`; `handlers/expense.ts` y `handlers/bulk.ts` eliminados
- Retroactivo de gastos (`report-history`) y entry foto/PDF (`photo.ts`) usan `ctx.scene.enter`; acciones `doc_type_*` eliminadas de `invoice.ts` y `receipt-direct.ts`
- Validado en botitio_testitoBot — 4 rutas de expense + bulk + doc-router (foto y PDF) sin regresiones

### Pendiente
- Oleada B: migrar factura, comprobante directo y categorización
- `pendingFileId`/`pendingFileType` permanecen en `Session` hasta Oleada B (handlers legacy los leen después de `scene.leave()`)

## 2026-05-28: Reglamento de WizardScenes + hook estructural + refactor de income/tax

### Completado
- Reglamento creado: `.claude/rules/shared/wizard-scenes.md` (16 secciones + checklist pre-PR). Cubre anatomía, naming, cursor guards, entry points con entryArgs, UX (breadcrumbs prohibidos dentro del scene), logging, `scene.leave()` ordering. tax.scene como referencia estructural canónica.
- Hook PreToolUse `check-wizard-scene.js`: 8 chequeos estructurales sobre archivos `*.scene.ts`. Registrado en settings.json y settings.example.json. Documentado en hooks-error-log.md.
- conventions.md: 3 secciones legacy de WizardScene reemplazadas por puntero a wizard-scenes.md.
- CLAUDE.md: fila nueva en tabla de rules.
- Refactor income.scene.ts (Fase 3a): `promptAmount/handleAmount/handleReason` → `stepInit/stepHandleAmount/stepHandleReason`; cursor guard extraído a `stepGuardConfirm` (step 3); logging estructurado en `handleConfirm`; orden corregido (mensaje final antes de `scene.leave()`).
- Cleanup tax.scene.ts (Fase 3b): 5 llamadas a `buildBreadcrumb` removidas de dentro del scene; import eliminado; duplicación de "Vas a registrar un nuevo impuesto" en stepInit eliminada (ahora el handler externo `handleAddTax` lo provee).
- `handleAddTax` (handlers/tax.ts): mensaje de contexto con breadcrumb pre-scene agregado para consistencia con `handleRegisterInstallment`.
- Build + lint: 0 errores, 0 warnings nuevos. Hook pasa sobre income.scene.ts y tax.scene.ts.

### Pendiente
- Deploy a botitio_testitoBot y verificar manualmente income y tax flows tras los cambios (UX sin breadcrumbs internos, cursor guard en income separado).
- Sync del hook `check-wizard-scene.js` al repo principal `kakebot-backend/.claude/hooks/` cuando se haga merge (los paths en settings.json apuntan ahí por consistencia con los demás hooks).
- Iniciar Fase 4 — Oleada A: migración de flujos simples (expense, bulk, doc-router) usando el reglamento.

## 2026-05-27: TaxWizardScene completo con selector de mes integrado y normalización de patrones

### Completado
- Selector de mes movido dentro del wizard (step 0 muestra el selector cuando `taxId` llega sin `selectedMonth`); handler global muestra mensaje de contexto antes de `scene.enter`
- Bug fixes: botón "Volver a impuestos" no hacía nada (doble `answerCbQuery`); archivo en cursor 0 no re-mostraba teclado (faltaba `case 0` en `repromptCurrentStep`)
- Botón "← Volver a impuestos" eliminado del selector de meses — salida solo por `cancelar`
- Income scene normalizada: `repromptCurrentStep` + handlers photo/document; `getMessageText` extraído a `helpers/wizard.ts` compartido

### Pendiente
- Deploy a botitio_testitoBot y testear flujo completo de impuestos
- Fase 2: `invoice.scene.ts`

## 2026-05-26: Fase 1 — Flujo de impuestos migrado a TaxWizardScene

### Completado
- `TICKET.md` actualizado con plan final (fases 0–7, tarjeta en dos escenas)
- Fase 0: sección `§ WizardScene — Cursor Guard` documentada en `conventions.md`
- Fase 1: `bot/scenes/tax.scene.ts` creado con 8 pasos + 8 action handlers + photo/document handlers
  - Tres rutas de entrada: (1) creación completa, (2) solo cuota (`taxId + selectedMonth`), (3) solo comprobante (`installmentId`)
  - `handleAddTax` → `ctx.scene.enter(TAX_SCENE_ID)`
  - `handleTaxMonthSelected` → `ctx.scene.enter(TAX_SCENE_ID, { taxId, selectedMonth, taxName })`
  - `handleAttachReceipt` → edita mensaje + `ctx.scene.enter(TAX_SCENE_ID, { installmentId })`
  - `text.ts`: −4 bloques (`tax_awaiting_name`, `_day`, `_payment_method`, `_amount`)
  - `photo.ts`: −2 bloques (`tax_awaiting_receipt` en photo y document) + 2 funciones eliminadas
  - `telegram.ts`: `taxScene` registrado en `Scenes.Stage`
- Build ✅ 0 errores — Lint ✅ 0 errores nuevos

### Pendiente
- Testear en botitio_testitoBot: crear impuesto, registrar cuota, marcar pagado, adjuntar comprobante
- Fase 2: `invoice.scene.ts` (factura + comprobante directo)

## 2026-05-25: POC — Flujo de ingresos migrado a WizardScene de Telegraf

### Completado
- Income flow migrado a `Scenes.WizardScene` nativo; store Firestore (`telegraf_sessions`) para persistencia en Cloud Functions stateless
- Bug fix: texto en paso de confirmación sobreescribía `state.reason`; guard `if (state.reason)` previene la sobreescritura
- Normativa de wizards documentada en `conventions.md`: input inválido → mensaje de contexto + repetición completa del paso actual

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

## 2026-04-29: UX de pago multicurrency en resúmenes de tarjeta (Commit 2b)

### Completado
- **`usdPaymentCurrency`** agregado a `CardStatement`, `Session`, `MarkStatementAsPaidParams`, `UpdateStatementUSDAndRateParams`
- **Nuevo keyboard `buildStmtUsdCurrencyKeyboard`**: muestra "Dólares" / "Pesos"; flow=`"pay"` o `"edit"` determina el prefijo del callback
- **`buildPaymentSummaryText`**: muestra el resumen final al terminar el flujo de pago; si pagó en pesos incluye equivalente ARS del monto USD
- **`buildStmtPayUSDKeyboard`**: skip callback ahora incluye `statementId` (`card_stmt_pay_usd_skip:{id}`)
- **`handleMarkStatementAsPaid`**: para USD → muestra teclado de moneda en lugar del TCV directamente; para ARS-only → igual que antes
- **4 nuevos handlers en `card.ts`**: `handleUsdPaymentCurrencyUSD`, `handleUsdPaymentCurrencyARS`, `handleEditUsdPaymentCurrencyUSD`, `handleEditUsdPaymentCurrencyARS`
- **`handleSkipARSReceipt`**: agrega "Omitiste..." + summary en terminal (sin USD); agrega "Omitiste..." antes de prompt USD
- **`handleSkipUSDReceipt`**: extrae statementId del callback, agrega "Omitiste..." + summary
- **`handleCardStmtEditUsd` (text.ts)**: en lugar de TCV, muestra teclado de moneda
- **`handleCardStmtEditExchangeRate` (text.ts)**: agrega línea "Total: $X" en el confirm
- **`handleCardStmtExchangeRate` (text.ts)**: pasa `usdPaymentCurrency: "ars"` al mark-paid; muestra "Pagaste USD X a $Y. Total $Z"
- **`handleStatementARSReceiptUpload` (photo.ts)**: confirmación "Comprobante de pago en Pesos guardado."; summary al terminal
- **`handleStatementUSDReceiptUpload` (photo.ts)**: confirmación "Comprobante de pago en Dólares guardado."; summary siempre
- Build ✅ 0 errores — Lint ✅ 0 errores

### Pendiente
- Testing en emuladores: flujo completo de pago con USD (selección moneda, TCV, comprobantes, summary)
- Commit 3: sección TARJETAS en el reporte mensual con equivalentes ARS

## 2026-04-28: Comprobantes multicurrency en resúmenes de tarjeta (Commit 1)

### Completado
- **Schema `CardStatement`**: `paymentReceiptUrl` reemplazado por `receiptUrlARS?`, `receiptUrlUSD?`, `exchangeRate?`
- **Nuevos estados de sesión**: `card_stmt_awaiting_exchange_rate`, `card_stmt_awaiting_receipt_ars`, `card_stmt_awaiting_receipt_usd`, `card_stmt_edit_awaiting_exchange_rate`; `statementAmountUSD?` agregado a `Session`
- **`markStatementAsPaid`**: migrado a `MarkStatementAsPaidParams` — acepta `exchangeRate?` opcional
- **Nuevas funciones en `card.service.ts`**: `saveStatementReceiptUrlARS`, `saveStatementReceiptUrlUSD`, `updateStatementUSDAndRate`
- **Nuevo folder GCS** en `storage.service.ts`: `uploadStatementPaymentReceiptUSD` → `stmt_receipts_usd/`
- **Keyboards reestructurados**: `buildStatementDetailKeyboard` simplificado; reemplazado `buildStmtPayReceiptKeyboard` por `buildStmtPayARSKeyboard`, `buildStmtPayUSDKeyboard`, `buildStmtReceiptsKeyboard`
- **Handlers reescritos en `card.ts`**: flujo de pago con TCV, 9 handlers nuevos para Comprobantes, `registerCardHandler` actualizado
- Build ✅ 0 errores — Lint ✅ 0 errores

### Pendiente
- **Commit 2**: `photo.ts` (despachar `card_stmt_awaiting_receipt_ars/usd`) + `text.ts` (handlers TCV + edición USD en dos pasos)
- **Commit 3**: `report.service.ts` — sección TARJETAS con equivalente ARS en reporte mensual
- `card_stmt_awaiting_receipt` y `saveStatementPaymentReceiptUrl` aún presentes (compat. Commit 2); eliminar en Commit 2

## 2026-04-27: Ordenamiento cronológico en historial de cuotas de servicios e impuestos

### Completado
- **Sort servicios corregido**: `getInstallmentsByService` cambió de descendente (`b.localeCompare(a)`) a ascendente (`a.localeCompare(b)`) — cuotas ahora se muestran de más antigua a más reciente
- **Tax sort verificado**: `getTaxInstallmentsByTaxId` ya usaba ascendente; sin cambio de código necesario
- **JSDoc corregido** en `buildTaxInstallmentHistoryKeyboard` y `getTaxInstallmentsByTaxId`: eliminada referencia errónea a "sorted newest first"
- Build ✅ 0 errores — Lint ✅ 0 errores

### Pendiente
- Test en emuladores: correr `seed-installments.js` y verificar que primera fila muestra Ene 2025 en historial de servicios
- Verificar historial de cuotas de impuestos con data real en emulador

## 2026-04-19: Automatización de creación de worktrees (/worktree)

### Completado
- **Nuevo script**: `scripts/new-worktree.sh` — crea worktree, corre `npm install`, copia `.env`/`.env.test`/`.env.prod` y `emulator-data/` del repo principal, abre VSCode
- Acepta `$1` (slug) y `$2` (tipo: feature/fix/improv/techDebt); interactivo si no se pasa `$2`
- **Nuevo skill**: `.claude/commands/worktree.md` — `/worktree [ticket]` extrae slug del campo `**Nombre:**`, pregunta tipo, llama al script y guarda el ticket como `TICKET.md` en el worktree
- Convención de nombres consistente con worktrees existentes: `kakebot-[slug]`, rama `[tipo]/[slug]`
- Un emulador a la vez (sin manejo de puertos múltiples)

### Pendiente
- Ninguno

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
