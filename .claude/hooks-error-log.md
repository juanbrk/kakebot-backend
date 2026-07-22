# Hooks Error Log

Registro estructurado de pain points, bugs detectados por hooks, y estado de implementación.

---

## Checklist: sincronizar un hook nuevo creado en un worktree

Cuando se crea un hook dentro de un worktree (no en el clone principal `kakebot-backend`), `settings.json` sigue apuntando por path absoluto al repo principal — el hook no se activa ahí hasta sincronizarlo a mano. Pasos, en orden:

1. Verificar que el hook está registrado en `.claude/settings.json` (path absoluto al repo principal) **y** en `.claude/settings.example.json` (placeholder `$PWD`) del worktree.
2. Al mergear la branch a `main`: copiar el archivo del hook (`.claude/hooks/<nombre>.js`) al repo principal (`kakebot-backend/.claude/hooks/`).
3. Confirmar que `kakebot-backend/.claude/settings.json` tiene la entrada del hook (llega vía merge si el archivo está trackeado — revisar igual por posibles conflictos de merge en `settings.json`).
4. Correr un caso de prueba trivial (una edición que debería bloquear, una que debería pasar) en el repo principal para confirmar que el hook está activo ahí.
5. Registrar la sincronización en la entrada correspondiente de este log (`Sync entre worktrees: ✅ sincronizado el YYYY-MM-DD`).

Aplica a cualquier hook `PreToolUse`/`PostToolUse` nuevo creado desde un worktree. `check-wizard-scene.js` (2026-05-28) y `check-raw-edit-message.js` (2026-07-16) atravesaron este mismo paso manual sin un checklist formal hasta ahora.

---

## 2026-07-16: check-raw-edit-message.js — prohibir .editMessageText pelado en handlers y scenes

**Status:** ✅ Implementado

Hook PreToolUse `Edit|Write` que bloquea cualquier Edit/Write que introduzca `.editMessageText(` en archivos `.ts` bajo `functions/src/bot/handlers/` o `functions/src/bot/scenes/`. Enforcea la regla de tres vías (ticket unify-cosmetic-edits-replyoredit): write-then-edit → `editOrReply`; edit cosmético en callback → `replyOrEdit`; `ctx.editMessageText` pelado → prohibido.

**Fuera del guard (permitido):** `helpers/telegram.ts` (definiciones de los helpers) y `services/` (loop de categorización con `ctx.telegram.editMessageText` low-level por `chatId`/`messageId` — excepción documentada).

**Testing:** verificado con violación en handler (exit 2), edit en `helpers/telegram.ts` (exit 0) y scene usando `replyOrEdit` (exit 0).

**Sync entre worktrees:** ⏳ pendiente — seguir el checklist al inicio de este archivo.

---

## 2026-05-28: check-wizard-scene.js — hook estructural para WizardScenes

**Status:** ✅ Implementado

Hook PreToolUse `Edit|Write` que valida la estructura mínima de archivos `functions/src/bot/scenes/*.scene.ts` contra el reglamento `shared/wizard-scenes.md`.

Chequeos:
1. Importa `getMessageText` desde `helpers/wizard`
2. Define `CANCEL_REGEX` con literal canónico (`/^\s*(salir|cancelar|terminar|stop)\s*$/i`)
3. Exporta `[DOMAIN]_SCENE_ID` con sufijo `-wizard`
4. Registra `scene.hears(CANCEL_REGEX, ...)`
5. Registra `scene.on("photo", ...)` y `scene.on("document", ...)`
6. Define función `repromptCurrentStep`
7. Async functions usan prefijos sanctioned (`step`, `handle`, `reprompt`, `get`, `build`, etc.)
8. Exporta el scene como `[domain]Scene = new Scenes.WizardScene<...>(...)`
9. Cross-check: domain del export camelCase coincide con domain del `SCENE_ID` kebab-case

**Activación:** solo archivos que matchean `/bot/scenes/[a-z][\w-]*\.scene\.ts$/`. Resto de archivos pasan transparentes.

**Implementación:** lee el archivo del disco para Edit (aplicando el patch old→new) o usa `tool_input.content` para Write. Esto evita falsos negativos en edits parciales.

**Testing:** verificado contra `tax.scene.ts` (pasa), `income.scene.ts` (falla por `promptAmount` — deuda técnica conocida, será corregida en refactor Fase 3a), y dummy file vacío (falla 8 chequeos).

**Sync entre worktrees:** seguir el checklist al inicio de este archivo. Los paths en `settings.json` apuntan al repo principal (`kakebot-backend/.claude/hooks/...`) por consistencia con los demás hooks.

---

## 2026-04-14: Migración completa a .claude/hooks/

**Status:** ✅ Implementado

Los hook scripts fueron migrados de `scripts/` a `.claude/hooks/`. Razón: `scripts/` es para scripts operativos (go.sh, switch-env.sh); `.claude/hooks/` es el lugar correcto para lógica de hooks de Claude Code.

Hooks activos post-migración:

| Hook | Tipo | Trigger | Propósito |
|------|------|---------|-----------|
| `protect-sensitive-files.js` | PreToolUse | Read, Grep | Bloquea lectura de .env, .env.prod, .env.test |
| `check-list-bullets.js` | PreToolUse | Edit, Write | Bloquea `├─` / `└─` en archivos .ts |
| `check-param-patterns.js` | PreToolUse | Edit, Write | Bloquea inline types y body destructuring en .ts |
| `track-modified-file.js` | PostToolUse | Edit, Write | Registra .ts modificados para check al final de sesión |
| `env-change-guard.js` | PostToolUse | Edit, Write | Aviso sobre GitHub Secrets cuando se modifica .env.prod |
| `typecheck-feedback.js` | PostToolUse | Edit, Write | Corre tsc --noEmit después de cada edit a .ts |
| `lint-feedback.js` | PostToolUse | Edit, Write | Corre ESLint después de cada edit a .ts |
| `check-session-params.js` | Stop | — | Verifica funciones con 4+ params posicionales al cerrar sesión |

---

## 2026-04-14: check-param-patterns.js — wiring completado

**Status:** ✅ Implementado

El script existía desde 2026-04-08 (Phase 5) pero nunca se conectó a `settings.json`. Conectado en esta sesión como parte del PreToolUse Edit|Write block junto a `check-list-bullets.js`.

---

## 2026-04-08: Param patterns hook — creado, pendiente de wiring

**Status:** ✅ Implementado (ver entrada anterior)

Script `check-param-patterns.js` creado y testeado. Detecta:
- Inline type annotations: `}: {` en firmas de funciones
- Body destructuring: `const { } = params;` en cuerpo de función

Documentado en `.claude/hooks/PHASE-5-SUMMARY.md`.

---

## 2026-04-06: 4+ params rule — implementado via track + Stop

**Status:** ✅ Implementado

Sistema de dos fases: `track-modified-file.js` (PostToolUse) registra archivos modificados en sesión; `check-session-params.js` (Stop) verifica todos los archivos al cierre. Shared logic en `params-rule-core.js`.

---

## 2026-04-06: Bullet char enforcement — implementado

**Status:** ✅ Implementado

`check-list-bullets.js` bloquea uso de `├─` / `└─` en archivos .ts. Reemplazar siempre con `•` (U+2022).

---

## Pain Points conocidos (sin hook todavía)

| Pain Point | Frecuencia | Severidad | Hook Propuesto |
|------------|------------|-----------|----------------|
| Firestore index missing → bot silently returns empty | Ocurrió en producción (Mar 2026) | Alta | Pre-deploy index check (pendiente) |
