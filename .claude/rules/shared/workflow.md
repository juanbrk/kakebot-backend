# Development Workflow

**El único punto de entrada real es `npm run go` (desde `functions/`, corre `scripts/go.sh`).**
`npm run deploy:test`, `npm run deploy:prod`, `npm run env:status`, `npm run env:test`, `npm run env:prod` y `npm run serve` **no existen** en ningún `package.json` de este repo — invocarlos falla con "missing script". Ver `scripts/go.sh` para el árbol completo de opciones.

## Pipeline: develop → test → deploy

### 1. Develop (local)
```bash
cd functions
npm run build    # Verify TypeScript compiles
npm run lint     # Verify ESLint passes
npm run go       # → Test (botitio_testitoBot) → Set polling
```
`npm run go` → **Test (botitio_testitoBot)** ofrece tres modos:
- **Set polling** (uso diario): build + `tsc --watch` + `node --watch lib/dev.js`, más emulador Firestore/Storage — corre el bot real (`bot/telegram.ts`) contra la API de Telegram por long-polling con el token de test, logs en vivo en la misma terminal, sin ningún deploy.
- **Iniciar emuladores**: solo Firestore + Storage, sin bot.
- **Iniciar desarrollo webhook**: build + `firebase emulators:start --only functions,firestore,storage` — simula el transporte webhook localmente.

### 2. Test con botitio_testitoBot

No hace falta ningún deploy real para testear: "Set polling" ya ejecuta el mismo código de handlers/scenes contra el bot de test real, con logs de `log.error`/`console.log` visibles en la terminal al instante. Reservar un deploy real solo si hace falta validar específicamente el transporte webhook (no aplica a la mayoría de los cambios de lógica del bot).
- Test en Telegram vía @botitio_testitoBot

⚠️ **Al trabajar en un worktree, verificar desde qué checkout corre el polling ANTES de tocar un botón.**
Todos los worktrees hablan con el mismo `botitio_testitoBot`, así que un polling levantado desde el repo equivocado responde en Telegram con normalidad y el QA parece válido — pero está ejercitando otra branch. Síntoma típico: el fix "no funciona" y los logs muestran exactamente el comportamiento previo al cambio.
Chequeo: mirar la ruta en cualquier stack trace o en el output de `tsc --watch` — debe contener el nombre del worktree, no el del repo principal. Corolario: **un solo `npm run go` a la vez**; si quedó otro corriendo, los dos compiten por los updates del mismo bot (long-polling) y las respuestas alternan de forma no determinística.

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

### 5. Deploy a kakebot (production)

Dos vías, ambas reales:
- **Automática**: GitHub Actions en cada push/merge a `main`.
  - `deploy-functions.yml`: corre en cada push a `main` — deploya functions + setea el webhook
  - `deploy-indexes.yml`: corre en push a `main` cuando cambia `firestore.indexes.json`
- **Manual**: `npm run go` → **Prod (kakebot)** → "Deploy functions" / "Deploy indexes" / "Deploy storage" / "Sync secrets". Bloqueado si la branch actual no es `main`; pide confirmación explícita `[s/N]` antes de operar.

**Storage Rules**: sin GitHub Action — deploy manual después de mergear a main: `npm run go` → Prod → Deploy storage (equivale a `firebase deploy --only storage`).

## Environment Switching

No son scripts npm — es un script bash directo:
```bash
bash scripts/switch-env.sh test      # Switch .env to test (botitio_testitoBot)
bash scripts/switch-env.sh prod      # Switch .env to prod (kakebot)
bash scripts/switch-env.sh status    # Show current environment
```
`npm run go` lo invoca automáticamente al elegir Test o Prod en el menú interactivo — correrlo a mano solo hace falta fuera de ese flujo.

Separate env files:
- `.env.test` → botitio_testitoBot token
- `.env.prod` → kakebot token
- `.env` → active copy (this is what gets deployed)

## Firebase Emulators
- Functions: port 5001 (solo en modo "Iniciar desarrollo webhook" — "Set polling" no levanta el emulador de functions, corre el bot directo con Node)
- Firestore: port 8080
- UI: port 4000
- Ambos modos de `npm run go` importan/exportan seed data de `emulator-data/` automáticamente
- Seed data persists between sessions automatically

## Telegram Bots
| Bot | Purpose | Username |
|-----|---------|----------|
| kakebot | Production | @kakebot_bot (TBD) |
| botitio_testitoBot | Testing | @botitio_testitoBot |
