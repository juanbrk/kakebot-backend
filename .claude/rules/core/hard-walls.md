# Hard Walls

Constraints that must never be violated.

## Security
- NEVER commit `.env` files or tokens to git
- NEVER hardcode sensitive values (user IDs, API keys, secrets) — always use `process.env`
- NEVER expose Telegram bot tokens in logs or responses
- Bot must only respond to authorized user (see user-profile.md for ID)

## Deployment
- NEVER deploy directly to kakebot production without testing on botitio_testitoBot first
- **Testing does NOT require a real deploy**: `npm run go` (desde `functions/`) → Test (botitio_testitoBot) → "Set polling" corre el bot real contra el token de test por long-polling, con logs en vivo en la terminal. Usar esto para QA — reservar un deploy real solo para validar específicamente el transporte webhook. Ver `shared/workflow.md`.
- NEVER force push to main
- ALWAYS run `npm run build` + `npm run lint` before deploy
- ALWAYS check which environment is active before suggesting deploy:
  - Run `bash scripts/switch-env.sh status` to verify — **not** an npm script (`npm run env:status` does not exist)
  - Explicitly tell the user: "Vas a deployar a TEST/PROD, confirmar?"
  - No existen `npm run deploy:test`/`npm run deploy:prod`. Deploy real de producción: `npm run go` → Prod (kakebot) → "Deploy functions" (bloqueado fuera de `main`, pide confirmación `[s/N]`) — equivalente manual al deploy automático de GitHub Actions en push a `main`.
- **ALWAYS verify Firestore composite indexes exist BEFORE deploying to production**
  - Check logs for "The query requires an index" errors
  - All Firestore queries with multiple field filters need composite indexes
  - See `shared/firestore-indexes.md` for index creation & verification procedure
  - Failure to create indexes = silent bot failures in production

## Environment Secrets
- **WHENEVER `.env.prod` is modified (variable changed or added), ALWAYS remind the user to update the GitHub Repository Secret**
  - Deployment reads from GitHub Secrets, NOT from `.env.prod` directly
  - Path: GitHub Secret → `deploy-functions.yml` writes `functions/.env` → Firebase CLI deploys → function reads `process.env`
  - Without updating the GitHub Secret, the fix is invisible in production
  - Remind: "Acordate de actualizar el GitHub Repository Secret `VAR_NAME` en Settings → Secrets → Actions"
- **NEVER forget to update `.pending-secrets` after changing `.env.prod`**
  - When Claude modifies an environment variable, register it immediately in `scripts/.pending-secrets`
  - Procedure: `echo "VAR_NAME" >> scripts/.pending-secrets`
  - Sync with: `npm run go → Prod → Sync secrets` (updates Google Cloud Secrets Manager for consistency)
- Real example: changed `GCS_BUCKET` locally 3 times — production kept failing because GitHub Secret was never updated

## Git
- NEVER create commits — Juan handles all commits manually
- When asked for a commit message: provide a non-technical, coarse-grained description
  - Describe the before/after state, not each individual step
  - Focus on what was implemented, not how
- **NEVER rename an existing branch** — especially `main` or `master`
  - When asked to "create a branch", ALWAYS use `git checkout -b <name>` from the current branch
  - `git branch -m` is forbidden unless the user explicitly says "rename this branch"
  - Root cause of past mistake: confused "rename branch" with "create branch"

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
