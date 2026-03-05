# KakeBot Backend

Household finance management via Telegram bot, powered by Firebase Functions.

## Quick Reference

- **Stack**: TypeScript, Firebase Functions, Firestore, Telegraf
- **Entry point**: `functions/src/index.ts` → exports `bot` Cloud Function
- **Bot logic**: `functions/src/bot/telegram.ts`
- **Types**: `functions/src/types/index.ts`
- **Deploy region**: `us-central1` (NOT southamerica-east1)
- **Firebase project**: `kakebot-972c2`

## Commands

```bash
cd functions
npm run build          # Compile TypeScript
npm run lint           # ESLint check
npm run serve          # Build + emulators (functions + firestore)
firebase deploy --only functions  # Deploy to production
```

## Rules (auto-loaded from .claude/rules/)

| File | What it covers |
|------|---------------|
| `core/hard-walls.md` | Never-violate constraints (security, deploy, git, code) |
| `core/user-profile.md` | User context, identity |
| `core/user-preferences.md` | Ticket templates (feature, bug, improvement) |
| `core/session-protocol.md` | Start/end behavior, memory updates |
| `shared/workflow.md` | Dev → test → deploy pipeline |
| `shared/conventions.md` | Code style, project patterns |
| `shared/code-docs.md` | Documentation philosophy, naming conventions |
| `shared/guard-conditions.md` | Guard clauses, named preconditions pattern |
| `shared/firestore-indexes.md` | Composite index creation & verification for Firestore |
| `shared/memory-decisions.md` | Past decisions for consistency |
| `shared/memory-sessions.md` | Rolling summary of recent work |

## Auto-Update Memory (MANDATORY)

**Update memory files AS YOU GO, not at the end.** When you learn something new, update immediately.

| Trigger | Action |
|---------|--------|
| User shares a fact about themselves | → Update `core/user-profile.md` |
| User states a preference | → Update `core/user-profile.md` |
| A decision is made | → Update `shared/memory-decisions.md` with date |
| Completing substantive work | → Add to `shared/memory-sessions.md` |
| Fix or workaround discovered | → Update relevant rule file |

**Skip:** Quick factual questions, trivial tasks with no new info.

**DO NOT ASK. Just update the files when you learn something.**
