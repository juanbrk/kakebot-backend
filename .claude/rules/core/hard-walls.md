# Hard Walls

Constraints that must never be violated.

## Security
- NEVER commit `.env` files or tokens to git
- NEVER hardcode sensitive values (user IDs, API keys, secrets) — always use `process.env`
- NEVER expose Telegram bot tokens in logs or responses
- Bot must only respond to authorized user (see user-profile.md for ID)

## Deployment
- NEVER deploy directly to kakebot production without testing on botitio_testitoBot first
- NEVER force push to main
- ALWAYS run `npm run build` + `npm run lint` before deploy
- ALWAYS check which environment is active before suggesting deploy:
  - Run `npm run env:status` to verify
  - Explicitly tell the user: "Vas a deployar a TEST/PROD, confirmar?"
  - Use `npm run deploy:test` for testing, `npm run deploy:prod` for production
- **ALWAYS verify Firestore composite indexes exist BEFORE deploying to production**
  - Check logs for "The query requires an index" errors
  - All Firestore queries with multiple field filters need composite indexes
  - See `shared/firestore-indexes.md` for index creation & verification procedure
  - Failure to create indexes = silent bot failures in production

## Git
- NEVER create commits — Juan handles all commits manually
- When asked for a commit message: provide a non-technical, coarse-grained description
  - Describe the before/after state, not each individual step
  - Focus on what was implemented, not how

## Code
- NEVER use `functions.config()` — it's deprecated. Use `process.env` (dotenv)
- NEVER assume deploy region is southamerica-east1 — functions deploy to `us-central1`
- Firestore database is in `southamerica-east1` but functions are in `us-central1`
- ALWAYS respect the modular project structure defined in `shared/conventions.md`:
  - New handlers go in `bot/handlers/` (one file per feature)
  - New Firestore operations go in `services/` (one file per domain)
  - New pure functions go in `helpers/`
  - New keyboard builders go in `bot/keyboards/`
  - NEVER add logic directly to `bot/telegram.ts` — it is only an orchestrator
