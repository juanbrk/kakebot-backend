# Hooks Error Log

Registro estructurado de pain points, bugs detectados por hooks, y estado de implementación.

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
