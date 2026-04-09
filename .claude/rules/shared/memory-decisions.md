# Decisions Log

## 2026-04-08: Refactorización completa de firmas de funciones — params objects + destructuring en firma

### Cambios implementados
- **Arquitectura de tipos consolidada**: Cada entidad tiene su archivo en `types/[entidad].types.ts`; `types/index.ts` congelado para nuevas interfaces
- **16 funciones refactorizadas** en ~10 archivos siguiendo dos patrones:
  1. **Destructuring en firma**: `const { x } = params` movido de cuerpo a firma de función
  2. **Tipos inline eliminados**: `}: { x: string }` reemplazados con interfaces nombradas en `types/`

### Archivos de tipos creados
- `types/category.types.ts` — `AssignCategoryParams`, `BuildExpensePromptTextParams`
- `types/service.types.ts` — `SaveInstallmentParams`, `BuildInstallmentListKeyboardParams`, `BuildInstallmentDetailKeyboardParams`
- `types/card.types.ts` — `CreateCardParams`, `CreateStatementParams`, `CardConfirmTextParams`, `StmtConfirmTextParams`
- `types/storage.types.ts` — `FileUploadParams`, `UploadFileInternalParams`

### Interfaces agregadas a tipos existentes
- `types/tax.types.ts` — `SaveTaxInstallmentParams`, `BuildTaxInstallmentDetailKeyboardParams`
- `types/expense.types.ts` — pattern aplicado pero interfaces ya existían (heredadas)
- `types/income.types.ts` — pattern aplicado pero interfaces ya existían
- `types/report.types.ts` — pattern aplicado pero interfaces ya existían

### Patrón consolidado en documentación
- Nueva sección en `shared/conventions.md`: "Destructuring in Signature, Not in Body"
- Regla: SIEMPRE destructurar en la firma, NUNCA en el cuerpo de la función
- Regla: NUNCA tipos inline (`}:{ x: string }`); use interfaces nombradas
- Benefits: una sola fuente de verdad, cuerpo limpio, sin boilerplate

### Hook PreToolUse creado
- **Archivo**: `scripts/check-param-patterns.js`
- **Detecta dos violaciones**:
  1. Body destructuring: `const { ... } = params;` en cuerpo de función
  2. Inline type annotations: `}:{ ` en firmas
- **Validación**: stripStringsAndComments para evitar falsos positivos
- **Exit code**: 0 si OK, Exit 2 si violación (bloquea Edit/Write)
- **Configuración**: (pendiente) agregar a `.claude/settings.json` cuando usuario lo active

### Resultados
- ✅ Build: 0 errores TypeScript
- ✅ Lint: 0 nuevos warnings
- ✅ Patrón aplicado consistentemente a todo el codebase
- ✅ Hook listo para activación (mejora pattern enforcement)

---

## 2026-04-06: Types per entity + param object convention enforced
- Nueva arquitectura: cada entidad tiene `types/[entidad].types.ts`; `types/index.ts` congelado
- Interfaces migradas esta sesión: `Expense`, `BulkExpenseEntry` → `expense.types.ts`; `Income` → `income.types.ts`; `MonthlyReport` → `report.types.ts`
- Interfaces de parámetros siguen patrón `[Func]Params`: `SaveExpenseParams`, `SaveIncomeParams`, `ShowMonthSelectorParams`
- 3 funciones corregidas: `saveExpense`, `saveIncome`, `showMonthSelector` (todas tenían 4 params posicionales)
- Regla documentada en `shared/types-architecture.md` con tabla de pendientes de migración
- Hook creado: `scripts/check-function-params.js` + `.claude/hooks/params-rule.json`
  - PostToolUse en Edit|Write → detecta funciones con 4+ params posicionales en archivos .ts
  - Exit 2 con mensaje de violación si detecta problemas
  - Para activar: copiar bloque `"hooks"` de `params-rule.json` a `.claude/settings.json`

## 2026-04-06: Report history + retroactive registration
- New feature: Reportes menu → Mes actual | Ver anteriores → year/month selector → report/expense/income
- Back navigation fix: when only 1 year has data, `showMonthSelector` receives `backCallback="menu_reportes"` to avoid infinite loop
- `buildBackdatedTimestamp(yearMonth)` added to `helpers/format.ts` — last day of month at 20:00 UTC (17:00 ART)
- `getPastMonthsWithData(userId)` in `report.service.ts` uses single-field Firestore queries (no new composite index needed)
- `reportMonth?: string` field added to `Session` — preserved automatically through income flow via `{ ...session, ... }` spread
- Breadcrumb bug: accidentally created a new `breadcrumb()` function instead of using existing `buildBreadcrumb()` — rule added to `shared/conventions.md` "Before Writing Any New Helper" with a lookup table of all known helpers

## 2026-04-06: Never create duplicate helpers — mandatory pre-check rule
- Rule added to `shared/conventions.md`: ALWAYS search `functions/src/helpers/` before writing any new helper
- Known helpers table maintained in `shared/conventions.md` (must be updated when adding new helpers)
- Root cause of violation: opened a new file and wrote logic without checking if equivalent already existed
- Breadcrumb separator is ` / ` (not ` > `), output is `_path_\n\n` (italic Markdown) — requires `parse_mode: "Markdown"` on every message that uses it

## 2026-04-02: Type safety — named types and no session: any
- All domain literal unions must be exported as named types from `types/index.ts` (never inline)
- Current named types: `CategoryType`, `PendingFileType`, `CreditCardProcessor`, `StatementCurrency`
- `SessionState` is a union of flow-specific sub-types (one per feature domain)
- Type guards exported from `types/index.ts`: `isCardSessionState`, `isServiceSessionState`, etc.
- `session: any` is forbidden — always type as `Session`; removing `any` revealed two latent bugs (missing `pendingFileId` null checks in invoice.ts and receipt-direct.ts)
- `as` casts are allowed only at extraction boundaries (Telegraf regex match), never at point of use
- Rules codified in `shared/conventions.md` under "Type Assertions" and "Named Types for Domain Values"

## 2026-03-30: Session data reuse rule
- New rule: `shared/session-data-reuse.md`
- Principle: never re-fetch from Firestore what a previous flow step already knows
- Entry points fetch + store in session; downstream handlers read from session with Firestore fallback
- Independent reads must use `Promise.all`, not sequential awaits
- Applied pattern: `getServiceNameCached()` in service.ts (9 handlers), `Promise.all` in 5 locations

## 2026-03-08: JSDoc required on all functions
- Scope expanded: JSDoc now required on ALL functions (new or modified), not just exported ones
- Single-line summary is enough for self-explanatory signatures
- Add `@param` / `@return` when purpose or contract is non-obvious
- Updated `shared/code-docs.md` accordingly

## 2026-03-01: Project reset
- Cleaned all generated code, started from minimal skeleton
- Only `/start` command initially, build incrementally

## 2026-03-01: Bot message format
- Free text input: "Panaderia 238130" (description + amount)
- Bot parses and asks for confirmation with inline buttons
- Categories assigned AFTER recording, not during

## 2026-03-01: Subcategories are dynamic
- The expense description becomes the subcategory automatically
- Normalized (lowercase) for grouping: "Panaderia" → "panaderia"
- If same normalizedDesc seen again, amounts accumulate in reports

## 2026-03-01: Environment config
- Use dotenv (.env files), NOT firebase functions.config() (deprecated)
- Firebase Functions deploy to us-central1 (default), Firestore in southamerica-east1

## 2026-03-01: Testing workflow
- Two bots: botitio_testitoBot (testing) → kakebot (production)
- Always test on testito before deploying to production

## 2026-03-01: Access control
- Bot restricted to Juan only (by Telegram user ID, pending capture)
- Future: per-user/family auth

## 2026-03-01: Code documentation philosophy
- Self-documenting code > comments (fix naming, not comments)
- Naming: no `raw`, `data`, `num`, `val`, `tmp` (ever)
- JSDoc only for non-obvious exported functions
- Handler labels are unnecessary (code structure is the label)

## 2026-03-01: Ticket format standards
- Feature, bug, improvement requests use structured templates
- Templates defined in `core/user-preferences.md`
- Strictly follow template structure—no additions, no omissions

## 2026-03-02: Sensitive values security
- NEVER hardcode sensitive values (user IDs, API keys, secrets)
- All sensitive values obtained from `process.env` via .env files
- Hard rule added to `core/hard-walls.md`

## 2026-03-03: Bot UI button ordering
- Negative actions (Cancelar, Volver, Salir) go LEFT
- Positive actions (Confirmar, Continuar, Crear) go RIGHT
- Rule added to `core/user-preferences.md` and `shared/conventions.md`

## 2026-03-02: Git commit policy
- Claude NEVER creates commits — Juan handles all commits manually
- When asked, provide a non-technical, coarse-grained commit message
- Describe before/after state, not each step
- Rule added to `core/hard-walls.md`

## 2026-03-03: Telegraf handler registration order
- Must be: start → command() → action() → on("text") → catch
- `on("text")` is catch-all, blocks subsequent handlers if registered first
- Bug found: commands registered after `on("text")` were unreachable

## 2026-03-03: Modular architecture
- telegram.ts is a thin orchestrator: creates bot, registers auth middleware, registers handlers
- Auth centralized via Telegraf middleware (`bot.use(authMiddleware)`) — no per-handler checks
- Handlers organized by feature (one file per feature), each exports `register*Handler(bot)`
- Services may receive Telegraf `ctx` when orchestrating flow + Firestore (pragmatic decision)
- Helpers are pure functions only (no I/O, no side effects)
- Services handle Firestore I/O and business logic
- `getDb()` lives in `services/db.ts` as single source of truth for lazy Firestore access
- Use relative imports (not `@/*` path aliases) — CommonJS doesn't resolve them at runtime
- All new code MUST follow this structure — hard wall added to prevent regression

## 2026-03-05: Firestore composite index requirement
- **Hard rule**: ALWAYS verify Firestore composite indexes BEFORE deploying to production
- Any Firestore query with 2+ field filters requires a composite index
- Missing indexes cause silent failures: bot doesn't crash, just returns empty data
- Real example: `/reporte` returned empty text because service_installments query had no index
- Pre-deploy procedure: `gcloud functions logs read bot --limit 100 | grep "requires an index"`
- New rule file: `shared/firestore-indexes.md` with creation/verification procedure
- Updated `core/hard-walls.md` (Deployment section) and `shared/workflow.md` (step 3)
- Added to CLAUDE.md rules table for visibility

## 2026-04-03: Environment secrets automation — .pending-secrets registry
- **Problem**: Changes to `.env.prod` variables are not automatically synced to Google Cloud Secrets Manager → silent failures in production
- **Solution**: File-based state registry + integrated sync in `npm run go`:
  - New file: `scripts/.pending-secrets` — lists variable names pending sync (no values, so safe to git-track)
  - When Claude changes `.env.prod`, immediately append variable name to `.pending-secrets` + inform in commit message
  - When user runs `npm run go → Prod → Sync secrets`: reads `.pending-secrets`, applies `gcloud secrets versions add/create` automatically, deletes file when done
  - No manual commands needed; entire process automated via `go.sh`
- **Archival approach** vs. live detection: chose registry (faster, no GCloud queries, deterministic)
- New hard wall: "NEVER forget to update `.pending-secrets` after changing `.env.prod`" (see `core/hard-walls.md`)
- New workflow step: "Verify & Sync Environment Secrets" added to `shared/workflow.md` before deploy
- Applies to: `TELEGRAM_BOT_TOKEN`, `AUTHORIZED_USER_ID`, `GCS_BUCKET`, (and future secrets)

## 2026-04-04: GCS_BUCKET root cause — correcto valor y flujo de deployment
- **Causa raíz**: `GCS_BUCKET=kakebot-972c2` no es un bucket GCS válido. El nombre correcto es `kakebot-972c2.firebasestorage.app`
- **Por qué fixes anteriores no funcionaron**: Se actualizó `.env.prod` local PERO no se actualizó el **GitHub Repository Secret `GCS_BUCKET`**
- **Flujo de deployment**: GitHub Actions lee `${{ secrets.GCS_BUCKET }}` del repo → escribe `functions/.env` → Firebase CLI despliega. El `.env.prod` local NO es el que llega a producción.
- **Lección**: Hay DOS lugares donde GCS_BUCKET vive: `functions/.env.prod` (referencia local) Y GitHub Repository Secret (lo que realmente usa el deploy). Ambos deben estar en sync.
- **Google Cloud Secrets Manager**: Existe `GCS_BUCKET` ahí también, pero la función NO lo lee en runtime. Es solo por consistencia/documentación.
- **Corrección aplicada**: `GCS_BUCKET=kakebot-972c2.firebasestorage.app` en `.env.prod`, `.env`, `.env.test` + usuario debe actualizar GitHub Secret manualmente.
