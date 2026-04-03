# Development Workflow

## Pipeline: develop → test → deploy

### 1. Develop (local)
```bash
cd functions
npm run build    # Verify TypeScript compiles
npm run lint     # Verify ESLint passes
npm run serve    # Emulators with persistent seed data
```

### 2. Test with botitio_testitoBot
```bash
npm run deploy:test   # Switches to test .env + deploys
```
- After deploy, set webhook for test bot:
  ```bash
  curl -F "url=https://us-central1-kakebot-972c2.cloudfunctions.net/bot" \
    https://api.telegram.org/bot<TEST_TOKEN>/setWebhook
  ```
- Test in Telegram via @botitio_testitoBot

### 3. Verify Firestore Indexes (production only)
```bash
gcloud functions logs read bot --limit 100 --project kakebot-972c2 2>&1 | grep "requires an index"
```
- **If any index errors appear**: Follow `shared/firestore-indexes.md` to create missing indexes
- Wait for all indexes to reach "Enabled" status (5-10 minutes each)
- Re-test affected features locally before deploying
- **DO NOT deploy to production if index errors exist**

### 4. Verify & Sync Environment Secrets (production only)
- If `.env.prod` was modified, check if `scripts/.pending-secrets` exists
- If present: run `npm run go → Prod → Sync secrets` to apply changes to Google Cloud Secret Manager
- **DO NOT deploy to production if environment secrets are pending** (they'll fail silently with 404/auth errors in prod)
- See `core/hard-walls.md` section "Environment Secrets" for details

### 5. Deploy to kakebot (production)

**Functions & Indexes**: Deployed automatically via GitHub Actions on push/merge to `main`.
- `deploy-functions.yml`: runs on every push to `main` — deploys functions + sets webhook
- `deploy-indexes.yml`: runs on push to `main` when `firestore.indexes.json` changes

**Storage Rules**: No GitHub Action — deploy manually after merging to main:
```bash
firebase deploy --only storage
```

## Environment Switching
```bash
npm run env:test      # Switch .env to test (botitio_testitoBot)
npm run env:prod      # Switch .env to prod (kakebot)
npm run env:status    # Show current environment
```

Separate env files:
- `.env.test` → botitio_testitoBot token
- `.env.prod` → kakebot token
- `.env` → active copy (this is what gets deployed)

## Firebase Emulators
- Functions: port 5001
- Firestore: port 8080
- UI: port 4000
- `npm run serve` auto-imports and exports seed data from `emulator-data/`
- Seed data persists between sessions automatically

## Telegram Bots
| Bot | Purpose | Username |
|-----|---------|----------|
| kakebot | Production | @kakebot_bot (TBD) |
| botitio_testitoBot | Testing | @botitio_testitoBot |
