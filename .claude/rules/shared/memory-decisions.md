# Decisions Log

## 2026-04-28: Diseño del flujo multicurrency en comprobantes de resúmenes de tarjeta

### Decisiones tomadas
- **Schema**: `paymentReceiptUrl` → `receiptUrlARS` + `receiptUrlUSD` (campos separados en Firestore); `exchangeRate` guardado al momento del pago
- **Flujo secuencial**: al marcar como pagado, se pide ARS primero → luego USD (no simultáneo); `hasUSD` codificado en el callback `card_stmt_pay_ars_skip:{id}:{0|1}` para evitar re-fetch
- **TCV requerido si hay USD**: si `amountUSD > 0`, el pago no se registra hasta recibir el TCV (text.ts, Commit 2)
- **Submenú Comprobantes**: botón dedicado en el detalle del resumen → pantalla separada con Resumen PDF + ARS + USD; mantiene separación entre el PDF bancario y los comprobantes de pago
- **Comprobantes desde historial vs flujo de pago**: adjuntar desde historial usa `statementAmountUSD: 0` en session para suprimir el prompt USD; adjuntar desde flujo de pago usa el valor real de `amountUSD`

---

## 2026-04-15: Patrón UX para Telegraf callback handlers — edit-before-reply

### Patrón correcto establecido
1. **Respuesta primaria**: `ctx.editMessageText()` — edita el mensaje que contenía el botón presionado
2. **Follow-up**: `ctx.reply()` — envía el siguiente paso como mensaje nuevo
3. **Guard clause**: `ctx.reply()` + `return` inmediato — siempre válido para errores/early exit
4. **Alternativa**: `replyOrEdit()` de `helpers/telegram.ts` — cumple el patrón

### Aplicado en
`bot/handlers/tax.ts` — 5 funciones: `handlePaidNo`, `handlePaidYes`, `handleMarkAsPaid`, `handleAttachReceipt`, `handleSkipReceipt`

### Pendiente
- Convención documentada en `.claude/rules/shared/telegram-callback-ux.md`
- Hook PostToolUse advisory `check-callback-pattern.js` — detecta violaciones sin bloquear
- Registrar en `.claude/settings.json` + `.claude/settings.example.json`

---

## 2026-04-14: PostToolUse Hooks migrados a stderr — Visibilidad y consistencia

Los 3 hooks PostToolUse (`env-change-guard.js`, `typecheck-feedback.js`, `lint-feedback.js`) fueron migrados de `console.log()` (stdout) a `process.stderr.write()` (stderr) para consistencia con PreToolUse hooks. Funcionan correctamente pero Claude Code aún no captura stderr de PostToolUse hooks.

---

## 2026-04-08: Params objects + destructuring en firma (incluye migración de tipos por entidad)

### Reglas activas
- **Arquitectura de tipos**: Cada entidad tiene `types/[entidad].types.ts`; `types/index.ts` congelado para nuevas interfaces
- **Destructuring en firma**: SIEMPRE destructurar en la firma, NUNCA `const { x } = params` en el cuerpo
- **Tipos inline prohibidos**: NUNCA `}: { x: string }`; usar interfaces nombradas en `types/[entidad].types.ts`
- **Interfaces de parámetros**: patrón `[Func]Params` (e.g., `SaveExpenseParams`)

### Archivos de tipos creados
- `types/category.types.ts`, `types/service.types.ts`, `types/card.types.ts`, `types/storage.types.ts`
- Interfaces agregadas a: `types/tax.types.ts`, `types/expense.types.ts`, `types/income.types.ts`, `types/report.types.ts`

### Enforcement
- Hook PreToolUse: `.claude/hooks/check-param-patterns.js` — detecta body destructuring e inline types, exit 2 si violación

---

## 2026-04-06: Report history + retroactive registration
- Reportes menu → Mes actual | Ver anteriores → year/month selector → report/expense/income
- Back navigation: when only 1 year has data, `showMonthSelector` receives `backCallback="menu_reportes"`
- `buildBackdatedTimestamp(yearMonth)` in `helpers/format.ts` — last day of month at 20:00 UTC (17:00 ART)
- `getPastMonthsWithData(userId)` in `report.service.ts` — single-field Firestore queries (no composite index needed)
- `reportMonth?: string` field in `Session` — preserved through income flow via `{ ...session, ... }` spread

## 2026-04-06: Never create duplicate helpers — mandatory pre-check rule
- ALWAYS search `functions/src/helpers/` before writing any new helper
- Known helpers table in `shared/conventions.md` (must be updated when adding new helpers)
- Breadcrumb separator is ` / ` (not ` > `), output is `_path_\n\n` (italic Markdown) — requires `parse_mode: "Markdown"`

## 2026-04-03: Environment secrets automation — .pending-secrets registry + GCS_BUCKET resolution
- **Registry system**: `scripts/.pending-secrets` lists variable names pending sync (no values)
- **Sync command**: `npm run go → Prod → Sync secrets` reads registry, applies gcloud commands, clears file
- **GCS_BUCKET correcto**: `kakebot-972c2.firebasestorage.app` (no `kakebot-972c2`)
- **Lección clave**: GitHub Repository Secrets es lo que llega a producción, no `.env.prod`. Ambos deben estar en sync.
- Hard wall in `core/hard-walls.md`: NEVER forget to update `.pending-secrets` after changing `.env.prod`
- Workflow step 4 in `shared/workflow.md`: Verify & Sync secrets BEFORE deploy

## 2026-04-02: Type safety — named types and no session: any
- All domain literal unions must be exported as named types (never inline)
- Current named types: `CategoryType`, `PendingFileType`, `CreditCardProcessor`, `StatementCurrency`
- `SessionState` is a union of flow-specific sub-types (one per feature domain)
- Type guards exported from `types/index.ts`: `isCardSessionState`, `isServiceSessionState`, etc.
- `session: any` forbidden — always type as `Session`
- `as` casts allowed only at extraction boundaries (Telegraf regex match), never at point of use

## 2026-03-30: Session data reuse rule
- Never re-fetch from Firestore what a previous flow step already knows
- Entry points fetch + store in session; downstream handlers read from session with Firestore fallback
- Independent reads must use `Promise.all`, not sequential awaits
- Pattern applied: `getServiceNameCached()` in service.ts (9 handlers), `Promise.all` in 5 locations

## 2026-03-08: JSDoc required on all functions
- JSDoc required on ALL functions (new or modified), not just exported ones
- Single-line summary sufficient for self-explanatory signatures
- Add `@param` / `@return` when purpose or contract is non-obvious

## 2026-03-01: Bot message format
- Free text input: "Panaderia 238130" (description + amount)
- Bot parses and asks for confirmation with inline buttons
- Categories assigned AFTER recording, not during

## 2026-03-01: Subcategories are dynamic
- The expense description becomes the subcategory automatically
- Normalized (lowercase) for grouping: "Panaderia" → "panaderia"
- If same normalizedDesc seen again, amounts accumulate in reports
