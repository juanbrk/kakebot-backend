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

⚠️ **Nunca matar el emulador de Storage por puerto.** `lsof -ti:9199 | xargs kill -9` no mata "el emulador de Storage": mata al proceso del CLI de Firebase, que lo hospeda in-process. El emulador de Firestore es un proceso Java aparte, queda huérfano agarrado a 8080/9150, y el próximo `npm run go` falla con `Port 8080 is not open on localhost` — mensaje engañoso: significa **ocupado**, no libre. Salida: `kill <pid-java>` (buscarlo con `lsof -nP -iTCP -sTCP:LISTEN | grep :8080`), y cortar la corrida vieja antes de arrancar otra para no dejar dos bots haciendo long-polling.

Para QA que necesita bajar **solo** Storage (ej. forzar un fallo de subida con Firestore vivo), levantarlos en dos terminales en vez de un único `npm run go`:
```bash
firebase emulators:start --only firestore --import=./emulator-data --export-on-exit
firebase emulators:start --only storage
```
Así Ctrl-C sobre el segundo baja Storage limpio y no orfana nada.

## Telegram Bots
| Bot | Purpose | Username |
|-----|---------|----------|
| kakebot | Production | @kakebot_bot (TBD) |
| botitio_testitoBot | Testing | @botitio_testitoBot |

## Ticket Tracking (TICKET.md)

Every worktree tracks its ticket in a `TICKET.md` at the repo root
(`$(git rev-parse --show-toplevel)/TICKET.md`). It's gitignored, never committed —
holds internal review notes and defer/avoid rationales. Full convention, including
the merge-by-ID rules for `Pending`/`Deferred`:
`~/.claude/shared/ticket-md.md`.

**Exactly 6 sections, never a 7th:** Context, Pending, Acceptance Criteria, Done
(with commit SHA), Deferred, Checkpoints. **150-line soft limit** — the
`ticket-check.js` hook (below) flags it, `/ticket-consolidate` compresses it.

**Two hooks, both `exit 0` always — advisory only, never block:**

| Hook | Trigger | Does |
|---|---|---|
| `.claude/hooks/ticket-check.js` | `PostToolUse`, `Edit\|Write\|MultiEdit` | Source-file edit → unchecks `[x] pr-audit`. `TICKET.md` edit → warns past 150 lines |
| `.claude/hooks/ticket-backfill.js` | `UserPromptSubmit`, every message | Resolves `` `PENDING-SHA` `` placeholders once a real commit lands |

**The `PENDING-SHA` / `pending-since` mechanism:** Claude never runs `git commit`
(hard wall), so when `/commit`/`/commit-lite` append a `Done` entry the SHA doesn't
exist yet — they write the literal `` `PENDING-SHA` `` plus a
`<!-- pending-since: <sha> -->` marker recording `HEAD` at write time.
`ticket-backfill.js` compares that marker against current `HEAD` on **every**
subsequent message; the moment they differ, a real commit landed, so it backfills
the real SHA and drops the marker — no need to re-run `/commit`.

**Checkpoints — exactly two lines, `technician-check` and `pr-audit`:** editing
source code unchecks `pr-audit` (via `ticket-check.js`); `/audit-pr` re-checks it.
`technician-check` is **never** touched by a hook or by any other skill — the sole
exception is `/technician-check` itself, ticking it as the direct result of running
that pass.
