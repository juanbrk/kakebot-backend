# Code Conventions

## TypeScript
- Strict mode enabled
- Target: ES2017, Module: CommonJS
- JSDoc only for exported functions (see code-docs.md)
- Use `process.env` for config, never `functions.config()`

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
