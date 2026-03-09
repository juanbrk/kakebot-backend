# Code Documentation

## Core Principle

**If you need a comment, the code isn't clear enough.** Fix the code first — rename variables, extract functions, restructure logic. Comments are a last resort for things code *cannot* express.

## Self-Documenting Code > Comments

```typescript
// BAD: comment compensating for vague naming
const num = parseFloat(cleaned); // Parse the cleaned amount
if (raw.includes(",")) { // If has comma decimal (AR format)

// GOOD: naming makes intent obvious
const parsedAmount = parseFloat(withDotDecimal);
const hasArgentineDecimalSeparator = input.includes(",");
```

## When Comments ARE Justified

| Situation | Example |
|---|---|
| Non-obvious business rule | `// AR format: dot=thousands, comma=decimal (opposite to US)` |
| Workaround for external limitation | `// HACK: Telegraf v4 requires ...` |
| Technical debt | `// TODO: replace with per-user locale` |
| Any function contract | JSDoc with `@param`, `@return` |

## Never Comment

- What the code already says (`// Increment counter`)
- Section headers that restate the function name (`// Parse amount`)
- Changelogs (`// Modified by Juan on 2026-03-01`)
- Commented-out code (use git)
- Handler labels (`// Callback: cancel`) — the code structure is the label

## JSDoc (All Functions — New or Modified)

**Every function must have a JSDoc comment**, whether exported or internal.
Apply this rule to: any new function you write, and any existing function you modify.

The same philosophy applies to all functions:
- If the signature is self-explanatory, a single summary line suffices.
- If the purpose, parameters, or return value are non-obvious, add `@param` and `@return`.

```typescript
/**
 * Parses Argentine-format amount strings into numbers.
 * Handles thousands separator (dot) and decimal separator (comma).
 *
 * @param {string} input - e.g. "238.130,00", "9.444,32", "238130", "8.50"
 * @return {number | null} Parsed number or null if invalid
 */
function parseArgentineAmount(input: string): number | null {

/** Formats a number as ARS currency string. */
function formatARS(amount: number): string {

/** Returns the lazy Firestore instance, initializing it on first call. */
function getDb(): FirebaseFirestore.Firestore {
```

Note: ESLint `valid-jsdoc` requires `{type}` annotations and `@return` (not `@returns`).

## Naming Conventions

### Variables & Functions

| Type | Convention | Examples |
|---|---|---|
| Local variables | camelCase, descriptive | `grandTotal`, `normalizedDesc`, `categoryKey` |
| Module constants | UPPER_SNAKE_CASE | `BOT_TOKEN`, `MONTH_NAMES`, `AMOUNT_PATTERN` |
| Boolean variables | `is`, `has`, `can`, `should` prefix | `isEmpty`, `hasMapping`, `looksLikeDecimal` |
| Event handlers | `handle[Event]` | `handleConfirm`, `handleCancel` |
| Getters/helpers | `get[Thing]` / `parse[Thing]` / `format[Thing]` | `getDb`, `parseArgentineAmount`, `formatARS` |
| Generic avoidance | NEVER use `raw`, `data`, `num`, `val`, `tmp` | Use `input`, `expenseData`, `parsedAmount` |

### Files & Directories

| Type | Convention | Examples |
|---|---|---|
| Source files | kebab-case | `telegram.ts`, `init-categories.ts` |
| Type files | `index.ts` inside type folder | `types/index.ts` |
| Services | `[domain].service.ts` | `reports.service.ts` |
| Middleware | descriptive name | `auth.ts` |
