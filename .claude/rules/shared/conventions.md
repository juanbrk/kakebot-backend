# Code Conventions

## Text Formatting in Bot Messages

### Bullet Character for List Items

**ALWAYS use `•` (U+2022) as the bullet character for list items.** Never use tree characters (`├─`, `└─`) in list formatting.

```typescript
// ❌ WRONG — tree characters
`├─ Telecentro  $ 2.100,00 (07/04)`
`└─ Ganancias  $ 1.180,50 (09/04)`

// ✅ RIGHT — standard bullet
`• Telecentro  $ 2.100,00 (07/04)`
`• Ganancias  $ 1.180,50 (09/04)`
```

This convention is enforced by a PreToolUse hook (`scripts/check-list-bullets.js`) that blocks edits containing `├─` or `└─` in TypeScript files.

**Known usages in codebase:**
- `report.service.ts` — expense/service/income/tax lines
- `keyboards/service.ts` — service installment list
- `helpers/bulk-parse.ts` — bulk expense preview
- `bot/handlers/tax.ts` — tax list
- `bot/handlers/upcoming-dues.ts` — upcoming dues buckets

---

## TypeScript
- Strict mode enabled
- Target: ES2017, Module: CommonJS
- JSDoc only for exported functions (see code-docs.md)
- Use `process.env` for config, never `functions.config()`
- **All imports must be at the top of the file** — never use `await import()` or dynamic imports inside functions.
  If a symbol is missing from the static imports, add it there. Dynamic imports mid-function are a sign of a forgotten import, not a valid pattern.
- **Functions with more than 3 parameters must accept a single object** instead of positional args:
  ```typescript
  // ❌ WRONG
  buildStmtConfirmText(cardLabel, monthLabel, amountARS, amountUSD, dueDay, stmtMonth)
  // ✅ RIGHT
  buildStmtConfirmText({ cardLabel, monthLabel, amountARS, amountUSD, dueDay, stmtMonth })
  ```
  Benefits: explicit typing, argument order is irrelevant, avoids positional mistakes.

### Type Assertions (`as`)
- **Avoid `as` casts whenever possible.** A cast silences TypeScript without adding safety.
- When a cast is unavoidable (e.g. extracting a value from an untyped Telegraf regex match), cast at the point of extraction — not at the point of use:
  ```typescript
  // ❌ WRONG — cast buried inside the handler, repeated across callers
  const processor = session!.cardLabel! as "VISA" | "MASTERCARD";

  // ✅ RIGHT — cast once at the extraction boundary
  const processor = ((ctx as any).match as string[])[1] as CreditCardProcessor;
  ```
- Never use `session: any`. Always type session parameters as `Session` from `types/index.ts`.
- Never use `// eslint-disable @typescript-eslint/no-explicit-any` to suppress a `session: any` parameter. Fix the type instead.

### Destructuring in Signature, Not in Body

When a function accepts an object parameter, **ALWAYS destructure in the signature**, never in the body.

```typescript
// ❌ WRONG — destructuring in function body (pure boilerplate)
function saveExpense(params: SaveExpenseParams): Promise<string | null> {
  const { telegramUserId, description, amount, date } = params;
  // ... logic
}

// ✅ RIGHT — destructuring in the signature
function saveExpense({
  telegramUserId,
  description,
  amount,
  date,
}: SaveExpenseParams): Promise<string | null> {
  // ... logic starts directly
}
```

**Benefits**: single source of truth (the interface), cleaner body, one less line of boilerplate.

**Also WRONG: Inline type annotations.** Never define parameter types inline; use a named interface:

```typescript
// ❌ WRONG — type defined inline
function createCard({
  telegramUserId,
  lastFourDigits,
  bank,
}: {
  telegramUserId: string;
  lastFourDigits: string;
  bank: string;
}): Promise<string>

// ✅ RIGHT — named interface in types/[entity].types.ts
function createCard({
  telegramUserId,
  lastFourDigits,
  bank,
}: CreateCardParams): Promise<string>
```

### Named Types for Domain Values
- **All domain-specific literal unions must be exported as named types from `types/index.ts`.** Never inline a union in a function signature or interface field if it represents a business concept.
  ```typescript
  // ❌ WRONG — inline union, repeated in every signature that uses it
  function handleCurrencySelected(currency: "ars" | "usd" | "both") { ... }
  pendingFileType?: "photo" | "pdf";

  // ✅ RIGHT — named type, defined once, referenced everywhere
  export type StatementCurrency = "ars" | "usd" | "both";
  export type PendingFileType = "photo" | "pdf";
  ```
- Current named types in `types/index.ts`: `CategoryType`, `PendingFileType`, `CreditCardProcessor`, `StatementCurrency`, `SessionState` (and its sub-types per flow).

### Session State Typing
- `Session.state` uses `SessionState`, which is a union of flow-specific sub-types:
  `ExpenseSessionState | CategorySessionState | ServiceSessionState | DocSessionState | InvoiceSessionState | ReceiptSessionState | IncomeSessionState | CardSessionState`
- When adding a new flow, add a new `XxxSessionState` sub-type and include it in `SessionState`.
- When adding a new session field that holds a domain value (e.g. a processor, a currency), add a named type for it alongside the field.

## ESLint Rules
- Double quotes
- 2-space indent
- Max line length: 120 (strings exempt)
- Object curly spacing: always
- Ternary operators: `?` and `:` at END of line, not start
- `new-cap` disabled (for Express Router())
- `@typescript-eslint/no-namespace` disabled (for Express type augmentation)

## Firestore
- Collections: `expenses`, `subcategory_mappings`, `categories`
- Timestamps: use `admin.firestore.Timestamp.now()`
- Normalize strings with `.toLowerCase().trim()` for grouping keys
- NEVER call `admin.firestore()` at module top level — use a lazy getter function
  (`function getDb() { return admin.firestore(); }`) because Firebase CLI
  analyzes modules before `initializeApp()` runs

## WizardScene

Reglamento completo en `shared/wizard-scenes.md`. Cubre estructura del archivo, naming, cursor guards, entry points con `entryArgs`, invalid input handling, UX (breadcrumbs prohibidos dentro del scene), logging, `scene.leave()` ordering y checklist pre-PR. Toda escena nueva o migrada debe cumplirlo.

---

## Telegram Bot (Telegraf)
- Bot token from `process.env.TELEGRAM_BOT_TOKEN`
- Webhook handler exported as `bot` Cloud Function
- Use inline keyboards (Markup.inlineKeyboard) for confirmations
- Callback data format: `action:param1:param2`
- Handler registration order: `start` → `command()` → `action()` → `on("text")` → `catch`
  (`on("text")` is catch-all, must be last before `catch`)
- Button order in inline keyboards (when multiple options):
  - Left: cancel, back, exit (negative/dismissive actions)
  - Right: confirm, continue, create (positive/affirmative actions)

## Project Structure
```
functions/src/
├── index.ts                        # Cloud Function exports (entry point)
├── dev.ts                          # Local dev (polling mode)
├── bot/
│   ├── telegram.ts                 # Orchestrator: creates bot, registers middleware + handlers
│   ├── middleware/
│   │   └── auth.ts                 # Telegraf auth middleware (isAuthorizedUser)
│   ├── handlers/
│   │   ├── start.ts                # /start command
│   │   ├── menu.ts                 # /menu command
│   │   ├── expense.ts              # confirm/cancel actions (single expense)
│   │   ├── bulk.ts                 # bulk_confirm/bulk_cancel actions
│   │   ├── report.ts               # /reporte + menu_reporte action
│   │   ├── report-history.ts       # report history nav + retroactive registration
│   │   ├── income.ts               # income registration flow
│   │   ├── categorize.ts           # /categorizar + menu_categorizar + cat_* actions
│   │   ├── service.ts              # service CRUD + installment actions
│   │   ├── invoice.ts              # invoice photo/PDF upload flow
│   │   ├── receipt-direct.ts       # direct receipt attachment flow
│   │   ├── card.ts                 # credit card + statement actions
│   │   ├── photo.ts                # on("photo") / on("document") dispatcher
│   │   └── text.ts                 # on("text") central dispatcher
│   └── keyboards/
│       ├── category.ts             # buildCategoryKeyboard, buildExpensePromptText
│       ├── service.ts              # service keyboards
│       └── invoice.ts              # invoice + receipt keyboards
├── services/
│   ├── db.ts                       # getDb() lazy Firestore getter
│   ├── session.service.ts          # Session CRUD + emptySessionForPartial
│   ├── expense.service.ts          # saveExpense, saveBulkExpenses
│   ├── income.service.ts           # saveIncome, getMonthlyIncomes
│   ├── category.service.ts         # Category CRUD, categorization flow logic
│   ├── service.service.ts          # Service + installment CRUD
│   ├── card.service.ts             # Credit card + statement CRUD
│   ├── storage.service.ts          # GCS file upload (receipts, statements)
│   └── report.service.ts           # generateMonthlyReport, getPastMonthsWithData
├── helpers/
│   ├── parse-amount.ts             # Argentine amount parsing + expense message parsing
│   ├── format.ts                   # formatARS, MONTH_NAMES, buildBackdatedTimestamp
│   ├── breadcrumb.ts               # buildBreadcrumb — navigation path display
│   ├── telegram.ts                 # replyOrEdit + editOrReply — ONLY allowed message-edit helpers
│   └── bulk-parse.ts               # Bulk message parsing + text builders
├── types/index.ts                  # TypeScript interfaces
├── middleware/auth.ts               # Express auth middleware (unused by bot)
└── routes/                          # API routes (reserved for future)
```

## Decimal Input Parsing

**Rule: any separator (dot or comma) is always a decimal separator.**

| Input | Output | Interpretation |
|---|---|---|
| `54.32` | `54.32` | Dot = decimal |
| `157.324` | `157.32` | Dot = decimal, truncated to 2 digits |
| `9.9999` | `9.99` | Dot = decimal, truncated to 2 digits |
| `1000,50` | `1000.50` | Comma = decimal |
| `238.130,00` | `238130.00` | Full AR format (dot = thousands, comma = decimal) |
| `238130` | `238130` | Plain integer, no separator |

**Exception — full AR format**: when both dot AND comma are present (`1.234,56`), dot = thousands and comma = decimal. This is the only case where a dot is not a decimal separator.

**Truncation**: if more than 2 decimal digits are provided, truncate (do not round). `157.324` → `157.32`, not `157.33`.

Implemented in `helpers/parse-amount.ts` → `parseArgentineAmount()`.

---

## Before Writing Any New Helper or Utility Function

**ALWAYS search the existing codebase first.** This project has grown organically and already has helpers for many common operations. Creating a duplicate wastes effort and causes inconsistency.

**Mandatory search before creating a new helper:**

```bash
grep -r "function buildBreadcrumb\|function formatARS\|function parseExpenseMessage\|function replyOrEdit" functions/src/helpers/
```

Or use Grep tool to search `functions/src/helpers/` for any function with a similar name or purpose.

**Known helpers — use these, do NOT recreate:**

| Function | File | Purpose |
|---|---|---|
| `buildBreadcrumb(segments)` | `helpers/breadcrumb.ts` | Italic nav path `_A / B / C_\n\n` with `parse_mode: "Markdown"` |
| `formatARS(amount)` | `helpers/format.ts` | ARS currency formatting (dot thousands, comma decimal) |
| `MONTH_NAMES` | `helpers/format.ts` | Spanish month name array (0-indexed) |
| `buildBackdatedTimestamp(yearMonth)` | `helpers/format.ts` | Last day of month at 17:00 ART as Firestore Timestamp |
| `buildDueDate(year, month, day)` | `helpers/format.ts` | Due-date `Date` anchored at 12:00 UTC — use for any persisted dueDate (service/tax/card installments) to survive process-timezone differences between production (UTC) and local emulator (ART) |
| `parseArgentineAmount(input)` | `helpers/parse-amount.ts` | Argentine-format string → number |
| `parseExpenseMessage(input)` | `helpers/parse-amount.ts` | "desc amount" → `{ description, amount }` |
| `replyOrEdit(ctx, text, extra?)` | `helpers/telegram.ts` | Edit message when triggered from a callback, else reply. Swallows every edit error, but only the double-tap "not modified" is silent — any other reason is logged as `log.warn`. Use for EVERY cosmetic edit (no preceding write): menu navigation, re-rendering screens, consuming a button. |
| `editOrReply(ctx, text, extra?)` | `helpers/telegram.ts` | Edit message; on any edit failure other than "not modified", fall back to a fresh reply. Use at write-then-edit sites so a failed edit never abandons a flow after data was persisted. |

**Three-way rule for message edits** (enforced by the `check-raw-edit-message.js` PreToolUse hook):

| Case | Use |
|---|---|
| Cosmetic edit in a callback handler (no preceding write) | `replyOrEdit` |
| Confirmation after a write (Firestore/GCS) | `editOrReply` |
| Bare `ctx.editMessageText` in `bot/handlers/` or `bot/scenes/` | **Forbidden** |

Sole exception: the categorization loop (`services/category.service.ts`) uses low-level `ctx.telegram.editMessageText` targeting a stored `chatId`/`messageId` — not migratable, lives outside the guarded paths. See `wizard-scenes.md §9` for the full semantics.

**Breadcrumb pattern** — every screen that uses `buildBreadcrumb` MUST use `parse_mode: "Markdown"`:
```typescript
await replyOrEdit(
  ctx,
  buildBreadcrumb(["Section", "Subsection"]) + "Prompt text",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { parse_mode: "Markdown", reply_markup: keyboard.reply_markup as any },
);
```
