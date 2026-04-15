# Memory Consolidation — KakeBot

You are running `/mem-consolidate` for the KakeBot project.

**Scope**: Only modify files in `.claude/memory/`, `.claude/rules/shared/memory-sessions.md`,
and `.claude/rules/shared/memory-decisions.md`. Read the project code as needed,
but do NOT modify any source files under `functions/`.

---

## STEP 1 — Acquire Lock

Check if `.claude/memory/.dream-lock` exists.

- If it exists AND was modified within the last 30 minutes → **abort**:
  > "Consolidation already running (lock file present). Try again in a few minutes."
- Otherwise → create `.claude/memory/.dream-lock` with the current ISO timestamp as its content.

---

## STEP 2 — Orient

Read the following files and record their **exact line count** before any changes:

1. `.claude/memory/MEMORY.md`
2. `.claude/rules/shared/memory-sessions.md`
3. `.claude/rules/shared/memory-decisions.md`
4. `~/.claude/projects/-Users-juan-freelance-Documents-proyectos-kakebot-backend/memory/MEMORY.md`

List all `.md` files in `.claude/memory/` (prior consolidations may have created topic files).

Report: `"Oriented. Snapshot: [file]: N lines..."`

---

## STEP 3 — Gather Signal

Scan the files read in Step 2. **Do NOT modify anything yet.** Catalog:

- **Stale sessions**: Sessions older than 60 days in `memory-sessions.md` (their content is already captured in decisions)
- **Superseded decisions**: Entries in `memory-decisions.md` where a later entry explicitly reverses or replaces an earlier one
- **Relative dates**: Any occurrence of "today", "yesterday", "this week", "last week", "this month" → these must be replaced with the actual date
- **Duplicate facts**: The same fact stated across multiple files
- **Dead references**: References to functions, files (`bot/handlers/X.ts`), or patterns no longer present in the codebase

For dead references: quickly check if the referenced file still exists before flagging it.

---

## STEP 4 — Consolidate Sessions

In `.claude/rules/shared/memory-sessions.md`:

**Keep the 5 most recent sessions in full (unchanged).**

For all older sessions, collapse each to a single line:
```
## YYYY-MM-DD: [original title] — [one sentence summary of what was done]
```

Remove the body of collapsed entries entirely. Do not add any new header section — just replace each old session's full content with its one-liner.

---

## STEP 5 — Consolidate Decisions

In `.claude/rules/shared/memory-decisions.md`:

- **Remove** any decision that is explicitly superseded by a later entry (note the supersession date in the surviving entry if relevant)
- **Merge** two entries that cover the same topic into one, keeping the most recent date
- **Replace** all relative dates with absolute dates (use today's date: 2026-04-15 for any "current" or "today" references)
- **Remove** historical context that is no longer actionable — e.g., "we tried X but it failed" once X has been fully resolved. Keep the resolution, remove the journey.

**Do NOT remove** decisions that are still active constraints (e.g., "never use `functions.config()`", button ordering rules, type safety rules).

---

## STEP 6 — Sync Auto-Memory

### `.claude/memory/MEMORY.md`

- Verify each fact against the current codebase and `CLAUDE.md`
- Remove entries that are stale or now covered more accurately in `CLAUDE.md`
- Add any key, high-signal facts discovered during Steps 4-5 that belong in the always-loaded index

### `~/.claude/projects/-Users-juan-freelance-Documents-proyectos-kakebot-backend/memory/MEMORY.md`

- Verify the hooks table matches the current `.claude/settings.json`
- Update the "Estado Actual" date if hooks have changed since the last entry
- Remove facts that simply duplicate what is already in `CLAUDE.md` (avoid redundancy in always-loaded context)

---

## STEP 7 — Update Dream State

Update `.claude/dream-state.json`:

- Set `last_consolidation_timestamp` to the current ISO UTC datetime
- Set `last_consolidation_commit` to the current value of `commit_count`
- Increment `total_consolidations` by 1

---

## STEP 8 — Release Lock

```
rm -f .claude/memory/.dream-lock
```

---

## Return

Print a summary:

```
## /mem-consolidate Summary

### Files Modified
| File | Before (lines) | After (lines) | Change |
|------|---------------|--------------|--------|
| memory-sessions.md | N | N | -N lines |
| memory-decisions.md | N | N | -N lines |
| .claude/memory/MEMORY.md | N | N | ±N lines |
| global MEMORY.md | N | N | ±N lines |

### What Changed
- Sessions collapsed: N (entries older than 60 days)
- Decisions removed/merged: N
- Relative dates fixed: N
- Dead references removed: N

### Notes
[Any notable findings, e.g., "Found reference to removed file X", "Decision Y was ambiguous — kept it"]
```

If nothing needed changing, say so clearly — that is a good outcome.
