# Code Conventions

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
- Max line length: 100 (strings exempt)
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
│   │   ├── categorize.ts           # /categorizar + menu_categorizar + cat_* actions
│   │   └── text.ts                 # on("text") central dispatcher
│   └── keyboards/
│       └── category.ts             # buildCategoryKeyboard, buildExpensePromptText
├── services/
│   ├── db.ts                       # getDb() lazy Firestore getter
│   ├── session.service.ts          # Session CRUD + emptySessionForPartial
│   ├── expense.service.ts          # saveExpense, saveBulkExpenses
│   ├── category.service.ts         # Category CRUD, categorization flow logic
│   └── report.service.ts           # generateMonthlyReport
├── helpers/
│   ├── parse-amount.ts             # Argentine amount parsing + expense message parsing
│   ├── format.ts                   # formatARS, MONTH_NAMES
│   └── bulk-parse.ts               # Bulk message parsing + text builders
├── types/index.ts                  # TypeScript interfaces
├── middleware/auth.ts               # Express auth middleware (unused by bot)
└── routes/                          # API routes (reserved for future)
```
