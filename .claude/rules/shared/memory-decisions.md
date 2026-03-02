# Decisions Log

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
