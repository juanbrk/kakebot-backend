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

## Code
- NEVER use `functions.config()` — it's deprecated. Use `process.env` (dotenv)
- NEVER assume deploy region is southamerica-east1 — functions deploy to `us-central1`
- Firestore database is in `southamerica-east1` but functions are in `us-central1`
