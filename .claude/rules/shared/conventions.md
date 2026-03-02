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
├── index.ts           # Cloud Function exports (entry point)
├── bot/telegram.ts    # All bot logic
├── types/index.ts     # TypeScript interfaces
├── routes/            # API routes (empty, reserved for future)
├── middleware/         # Express middleware (reserved)
├── services/          # Business logic (reserved)
└── utils/             # Utilities (categories init)
```
