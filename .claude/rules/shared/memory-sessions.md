# Session Log

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
  - `bot/handlers/upcoming-dues.ts`: `registerUpcomingDuesHandler` + formateo con `├─` / `└─` + prefijos `[Svc]`/`[Imp]`
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

## 2026-03-01: Initial setup and expense registration

### Completed
- Created Telegram bot with @BotFather, configured token in .env
- Set webhook to `https://us-central1-kakebot-972c2.cloudfunctions.net/bot`
- Cleaned project to minimal skeleton (bot-only, empty routes preserved)
- Fixed ESLint config (.eslintrc.js): added tsconfig.dev.json, disabled new-cap and no-namespace
- Upgraded Node.js engine from 18 to 20 (18 was decommissioned)
- Added .env to functions/.gitignore
- Implemented expense registration system:
  - Free text parsing (description + amount, Argentine format)
  - Inline keyboard confirmation (Confirm/Cancel)
  - Firestore storage in `expenses` collection
  - Auto-category assignment via `subcategory_mappings`
  - Monthly report command `/reporte`
- Set up CLAUDE.md + .claude/rules/ modular rule system
- Created local dev environment:
  - `dev.ts` for polling mode with Firestore emulator
  - npm scripts: `dev`, `dev:bot`, `dev:emulators`
  - Environment switching: `env:test`, `env:prod`, `env:status`
  - Deploy scripts: `deploy:test`, `deploy:prod`
- Added Firestore composite index (telegramUserId + date)
- Captured Juan's Telegram user ID: `1183288911`
- Tested expense registration on emulators — working
- Build + lint pass clean

### Pending
- Restrict bot to authorized user only (ID: 1183288911)
- Test `/reporte` command on emulators
- Deploy Firestore indexes to production
- Implement category assignment feature

## 2026-03-02: Code quality and documentation standards

### Completed
- Refactored `telegram.ts`:
  - Eliminated all obvious/redundant comments
  - Improved variable naming: `raw`→`input`, `cleaned`→`withoutThousands`, `num`→`parsedAmount`, `userId`→`telegramUserId`, etc.
  - Extracted regex patterns to module constants: `AMOUNT_PATTERN`, `AMOUNT_AT_END`, `AMOUNT_AT_START`
  - Extracted `MONTH_NAMES` constant
  - Added helper function `toFloatOrNull` for clarity
  - Renamed `parseAmount` → `parseArgentineAmount` (self-documenting)
  - Improved loop variable naming: `cat`/`norm`/`groups` → `categoryKey`/`subcategoryKey`/`groupedByCategory`
- Enhanced code documentation rules:
  - New philosophy: "Fix the code, not the comment" — naming first
  - Explicit prohibition of generic variable names (`raw`, `data`, `num`, `val`, `tmp`)
  - Handler labels are unnecessary (code structure is the label)
  - JSDoc only for non-obvious exported functions (ESLint format: `{type}` annotations, `@return`)
- Created `core/user-preferences.md` with structured ticket templates:
  - Feature (funcionalidad): Historia de Usuario, Criterios de Aceptación, Aspectos Técnicos, Sugerencias UX
  - Bug (error): Comportamiento Actual, Comportamiento Deseado, Aspectos Técnicos
  - Improvement (mejora): Historia de Usuario, Situación Actual, Situación Deseada, Criterios de Aceptación
- Updated CLAUDE.md to reference new `user-preferences.md`
- Updated `memory-decisions.md` with decisions on code docs + ticket formats
- All build + lint checks pass

### Pending
- Create commit with refactoring changes

## 2026-03-02: Bot access control implementation

### Completed
- Implemented user authorization check: `isAuthorizedUser()` function
- Added auth checks to all handlers: `/start`, text messages, `/reporte`, confirm/cancel
- Bot now silently ignores unauthorized users (no response)
- Moved `AUTHORIZED_USER_ID` from hardcoded to `process.env`
- Updated `.env`, `.env.test`, `.env.prod` with `AUTHORIZED_USER_ID=1183288911`
- Added security rule to `hard-walls.md`: never hardcode sensitive values
- All build + lint checks pass

### Pending
- Create commit with auth implementation

## 2026-03-03: Interactive category assignment feature

### Completed
- Added Session, PendingDescEntry, SessionExpenseEntry types to types/index.ts
- Implemented full `/categorizar` command flow with interactive category assignment
- Added session management helpers: getSession, setSession, clearSession
- Implemented category fetching and pagination (4 categories per page)
- Added inline keyboard builders with navigation and new category creation
- Implemented expense grouping by normalizedDesc (deduplicated)
- Added new action handlers:
  - `cat_sel:<categoryId>` - category selection
  - `cat_pg:<page>` - pagination navigation
  - `cat_new` - request new category creation
  - `cat_cancel` - cancel categorization flow
- Modified text handler to detect `awaiting_new_category_name` state
- Implemented handleNewCategoryInput for dynamic category creation
- Added `seed:categories` npm script for emulator seeding
- Updated `/start` command to show new `/categorizar` option
- Build + lint: both pass clean

### Implementation Details
- Session stored in Firestore `sessions` collection (doc ID = telegramUserId)
- Session state machine: "categorizing" ↔ "awaiting_new_category_name"
- Batch updates: all expenses with same normalizedDesc get categoryId
- Upserts subcategory_mappings with deterministic doc ID format
- Summary shows categorized expenses grouped by category name
- Message editing throughout flow keeps chat clean (single message thread)
- Callback data format: cat_sel:<id>, cat_pg:<page>, cat_new, cat_cancel

## 2026-03-03: Bug fix + UI preferences + partial input

### Completed
- Fixed /categorizar not responding: handler registration order bug
  - `on("text")` was registered before `command()` handlers, blocking them
  - Reordered: start → command() → action() → on("text") → catch
- Added button ordering preference rule:
  - Left: negative/dismissive (Cancelar, Volver, Salir)
  - Right: positive/affirmative (Confirmar, Continuar, Crear)
  - Applied to all existing inline keyboards
  - Updated conventions.md and user-preferences.md
- Implemented partial input flow for expenses:
  - User sends just text → bot asks "¿Cuánto gastaste en X?"
  - User sends just amount → bot asks "¿En qué gastaste $X?"
  - Uses session states: `awaiting_amount`, `awaiting_description`
  - Session cleared after user provides the missing part
  - Mixed-but-unparseable input still shows error message
- Build + lint: both pass clean

### Pending
- Manual testing of all three changes on emulators
- Deploy to test bot (botitio_testitoBot) and verify

## 2026-03-04: Guard conditions pattern + service flow optimization

### Completed
- Created `shared/guard-conditions.md` rule: extract multi-part conditions into named preconditions for clarity
- Applied guard condition pattern to all validation checks:
  - `isValidDay` variables in handleServiceDay, handleEditServiceDayText
  - `hasRequiredSessionData` in handleServiceAmount, handleReplaceDuplicate
  - `isValidAmount` in handleEditServiceAmountText
  - `hasValidName` in handleEditServiceNameText
- **Reordered service registration flow**: Mes → Día → Monto (improves UX)
  - Modified handleMonthSelected to set `svc_awaiting_day` state
  - Modified handleServiceDay to set `svc_awaiting_amount` state (validation only)
  - Modified handleServiceAmount to save installment (was just validation)
- **UI improvements** from user feedback:
  - Menu: "Selecciona una opción" (clearer than "¿Qué querés hacer con servicios?")
  - Service edit menu: 2-column layout (2x2 grid)
  - Service list: 6 items per page, displayed 3x2 grid with pagination
  - Edit service text: "¿Qué deseas hacer con *[nombre]*?" (with name in bold)
  - Post-creation: prompt user to add installment immediately [Cancelar|Aceptar]
- Updated CLAUDE.md to reference new guard-conditions rule
- Build + lint: clean

### Pending
- Test service flows on emulators (Mes → Día → Monto sequence)
- Deploy to botitio_testitoBot
- Phase 2: Integración al reporte mensual (add SERVICIOS section)

## 2026-03-03: Modularization of telegram.ts

### Completed
- Refactored telegram.ts from 1267-line monolith to ~28-line orchestrator
- Created modular architecture with clear separation of concerns:
  - `helpers/`: pure functions (parse-amount.ts, format.ts, bulk-parse.ts)
  - `services/`: Firestore operations (db.ts, session.service.ts, expense.service.ts, category.service.ts, report.service.ts)
  - `bot/handlers/`: feature-organized handlers (start, menu, expense, bulk, report, categorize, text)
  - `bot/middleware/auth.ts`: centralized Telegraf auth middleware
  - `bot/keyboards/category.ts`: keyboard builders
- Eliminated code duplication:
  - Report logic (was copy-pasted in /reporte and menu_reporte) → single `generateMonthlyReport()` in report.service.ts
  - Categorization init (was copy-pasted in /categorizar and menu_categorizar) → single `startCategorizationFlow()` in categorize.ts
- Centralized auth: `telegramBot.use(authMiddleware)` replaces 16 manual auth checks
- Extracted text handler sub-functions for readability (handleAwaitingAmount, handleAwaitingDescription, etc.)
- Updated conventions.md with new project structure
- Deleted empty stub `services/reports.service.ts`
- Build + lint: both pass clean (0 errors, 0 warnings)

### Pending
- Test on emulators (npm run serve)
- Deploy to botitio_testitoBot and verify all flows

## 2026-03-06: Estado de pago (Fase 1) + Comprobantes (Fase 2)

### Fase 1: Estado de pago — COMPLETADA
- Agregado `isPaid: boolean` y `paidAt?: Timestamp` a `ServiceInstallment` en types/index.ts
- `saveInstallment()` ahora guarda `isPaid: false` por defecto
- Nueva función `markInstallmentAsPaid()` en service.service.ts
- Nuevo handler `svc_pay` (por installmentId) y `svc_pay_from` (por serviceId del mes actual)
- `buildServiceActionKeyboard` ahora muestra botones condicionales:
  - Con cuota impaga: `[Marcar como pagado] [Modificar]`
  - Con cuota pagada: `[Modificar]`
  - Sin cuota: `[Registrar cuota] [Modificar]`
- `buildInstallmentDetailKeyboard` muestra "Marcar como pagado" solo si `!isPaid`
- `buildInstallmentDetailText` muestra "Estado: Pendiente" o "Estado: ✅ Pagado"
- `buildServiceViewText` (svc_list): cuotas pagadas muestran `(Pagado) ✅`
- `report.service.ts`: sección SERVICIOS muestra `(Pagado) ✅` en vez de `(vence DD/MM)`
- Título del detalle de servicio muestra `(Pagado) ✅` para cuotas pagadas
- Fix bug pre-existente: `openServicesMenu` llamaba `answerCbQuery()` incondicionalmente
- Build + lint: clean

### Fase 2: Adjuntar comprobantes — CÓDIGO COMPLETADO, PENDIENTE TESTING
- Agregado `receiptUrl?: string` a `ServiceInstallment`
- Agregado estado `svc_awaiting_receipt` a Session
- **Nuevo archivo** `services/storage.service.ts`:
  - `getBucket()` lazy getter usando `process.env.GCS_BUCKET`
  - `uploadReceipt()` sube a `receipts/{userId}/{installmentId}.jpg`
  - Detecta emulador via `FIREBASE_STORAGE_EMULATOR_HOST` (skipea makePublic, genera URL de emulador)
- **Nuevo archivo** `bot/handlers/photo.ts`:
  - `bot.on("photo")` handler
  - Verifica sesión `svc_awaiting_receipt`
  - Descarga foto de Telegram → sube a Storage → guarda URL en Firestore
  - Try/catch con logging de errores
- `service.service.ts`: nueva función `saveReceiptUrl()`
- `keyboards/service.ts`:
  - `buildReceiptPromptKeyboard(installmentId)`: botones `[Omitir] [Adjuntar]`
  - `buildInstallmentDetailKeyboard` ahora recibe `hasReceipt`, muestra "Adjuntar comprobante" si `isPaid && !hasReceipt`
- `handlers/service.ts`:
  - `handleMarkAsPaid` y `handleMarkAsPaidFromService` ahora muestran prompt post-pago "¿Deseas adjuntar comprobante?"
  - Nuevos handlers: `handleAttachReceipt` (svc_attach), `handleSkipReceipt` (svc_skip_receipt)
- `telegram.ts`: registra `registerPhotoHandler` antes de `registerTextHandler`
- `dev.ts`: agregado `FIREBASE_STORAGE_EMULATOR_HOST = "localhost:9199"`
- `firebase.json`: agregado emulador de Storage en puerto 9199
- **Nuevo archivo** `storage.rules`: acceso denegado (Admin SDK bypasea reglas)
- Scripts npm: `dev`, `dev:emulators`, `serve` ahora incluyen `storage`
- `.env*`: variable `GCS_BUCKET=kakebot-972c2.appspot.com` (no `FIREBASE_STORAGE_BUCKET` — prefijo reservado por Firebase)
- Build + lint: clean

### Bug encontrado durante testing
- `FIREBASE_STORAGE_BUCKET` es prefijo reservado por Firebase Functions → renombrado a `GCS_BUCKET`
- `npm run serve` no sirve para probar fotos (webhook apunta a producción, no al emulador local)
- Para probar fotos en local: `npm run dev:emulators` + `npm run dev` (polling mode)

## 2026-03-06: Testing Fase 2 (Storage + Comprobantes) — ✅ COMPLETADO

**Resultado**: Fase 2 funcionando perfectamente

**Validación Exitosa**:
- ✅ Marcar cuota como pagada → prompt "¿Deseas adjuntar comprobante?"
- ✅ Enviar foto → respuesta "✅ Comprobante guardado." + sesión limpia
- ✅ Archivo en Storage: `receipts/1183288911/tfOyDuYqaS2avCNSMSoK.jpg`
- ✅ receiptUrl guardado en Firestore
- ✅ Flujo funciona en cuota existente + nuevo servicio registrado como pagado
- ✅ Build + lint: clean

**Bug Descubierto + Resuelto**:
- Error inicial: ECONNREFUSED localhost:9199
- Causa: Ejecutar `npm run dev:emulators` + `npm run dev` (2 instancias de emuladores)
- Solución: Usar solo `npm run dev` (inicia todo con concurrently)

**Próximos Pasos**:
1. Deploy a botitio_testitoBot con Storage real
2. Fase 3: Foto directa al bot → crear cuota automáticamente

## 2026-03-06: Fase 3b — Recepción de comprobante como mensaje directo

### Completado
- Flujo completo: foto/PDF sin sesión → `[Cancelar] [Factura] [Comprobante]` → selección de servicio → marca pagada + adjunta comprobante
- **Nuevo archivo** `bot/handlers/receipt-direct.ts`:
  - `registerReceiptDirectHandler(bot)` con actions: `doc_type_receipt`, `comp_pick`, `comp_new_service`, `comp_month`, `comp_pg`, `comp_cancel`
  - `attachReceiptToInstallment()` — descarga archivo, sube a `receipts/`, marca pagada, guarda URL, limpia sesión
- **keyboards/invoice.ts**: `buildDocTypeKeyboard` ahora muestra 3 opciones (Cancelar, Factura, Comprobante)
  - `buildReceiptServiceListKeyboard` y `buildReceiptMonthKeyboard` (2 columnas, paginación)
- **text.ts**: 3 nuevos handlers — `handleCompServiceName`, `handleCompDay`, `handleCompAmount`
- **types/index.ts**: 5 estados nuevos (`comp_awaiting_service/name/month/day/amount`)
- **Fix bug**: PDF en `svc_awaiting_receipt` ahora funciona (antes solo aceptaba fotos)
  - `handleDocument` en photo.ts ahora detecta `svc_awaiting_receipt`
  - Nueva función `handleReceiptUploadFromDocument`
  - Mensaje actualizado: "Enviá la foto o PDF del comprobante."
- Build + lint: clean

### Pendiente
- Testing en emuladores (`npm run dev`)
- Deploy a botitio_testitoBot
- Verificar Firestore indexes antes de deploy a producción

## 2026-04-03: File upload bug fix + Automated secrets sync via .pending-secrets

### Bug Identificado y Resuelto
- **Problema**: Carga de comprobantes fallaba en producción con error "The specified bucket does not exist"
- **Causa raíz**: `GCS_BUCKET=kakebot-972c2.firebasestorage.app` (incorrecto) en lugar de `kakebot-972c2` (correcto)
- **Por qué no se detectó localmente**: Emulador no valida nombres de bucket
- **Solución**: Cambio en `.env.prod` + `.env.test`: `GCS_BUCKET=kakebot-972c2`

### Automatización de Secrets Sync — Implementada Completa
- **Problema anterior**: Cambios de variables de env eran fáciles de olvidar sincronizar → silenciosas fallos en prod
- **Solución**: Registro de estado + integración en `npm run go` (sin nuevos scripts)

**Archivos creados/modificados:**
- ✅ Creado `scripts/.pending-secrets` — registro simple de variables a sincronizar (contiene `GCS_BUCKET`)
- ✅ Modificado `scripts/go.sh` — nuevo submenu `Sync secrets` en bloque PROD (automático, sin interacción adicional)
  - Lee `.pending-secrets`, aplica `gcloud secrets versions add/create` para cada variable, borra archivo si todo OK
  - Si hay `.pending-secrets` pero no hay archivo: muestra "No hay secrets pendientes"
- ✅ Actualizado `core/hard-walls.md` — nueva sección "Environment Secrets" (hard wall: NEVER forget `.pending-secrets`)
- ✅ Actualizado `shared/workflow.md` — paso 4 nuevo: "Verify & Sync Environment Secrets" (BEFORE deploy to prod)
- ✅ Actualizado `memory-decisions.md` — documentado el diseño (registry approach vs. live detection)

**Procedimiento para futuras sesiones:**
1. Claude modifica `.env.prod` → escribe nombre de variable en `scripts/.pending-secrets` → informa en commit message
2. Usuario ejecuta `npm run go → Prod → Sync secrets` → aplicación automática del cambio, borra archivo
3. Luego procede con deploy normal

**Diseño elegido:**
- Registry file (`.pending-secrets`) en lugar de live GCloud detection
- Solo nombres de variables, no valores (seguro, trackeable en git)
- Automático sin más pasos al elegir la opción en `go.sh`

### Status Final
- Build + lint: ✅ clean
- `.pending-secrets` contiene `GCS_BUCKET` — usuario debe ejecutar sync antes o después del deploy
- Cambios listos para commit + push
- Próximo: Verificar que sync funciona en producción y que comprobantes se suben correctamente

