# Hook: Parameter Pattern Validation

**File**: `scripts/check-param-patterns.js`
**Type**: PreToolUse
**Triggers**: Edit, Write (TypeScript files)
**Status**: Ready to activate

## What It Does

Validates two critical TypeScript parameter patterns:

1. **Inline type annotations** — Detects `}: {` (e.g., `function foo({ x, y }: { x: string; y: number })`)
   - Fix: Define a named interface in `types/[entity].types.ts`
   - Example: `CreateCardParams` instead of inline type literal

2. **Body destructuring** — Detects `const { ... } = params;` in function body
   - Fix: Move destructuring to function signature
   - Example: `function foo({ x, y }: FooParams)` instead of `function foo(params: FooParams) { const { x, y } = params; }`

## Why It Matters

- **Inline types**: Create duplicate definitions, harder to maintain, violate DRY
- **Body destructuring**: Pure boilerplate, obscures actual logic, repeats type information

## How to Activate

Add this block to `.claude/settings.json` (if it doesn't exist, create it):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "glob": "**/*.ts",
        "command": "node scripts/check-param-patterns.js"
      }
    ]
  }
}
```

## Testing the Hook

After activation, test by attempting to create an inline type or body destructuring violation:

```bash
# This should be blocked by the hook
echo '{"tool_input":{"new_string":"function foo({ x, y }: { x: string; y: number }): void {}"}}' | node scripts/check-param-patterns.js
# Exit code 2 = violation detected
```

## False Positives

The hook filters out:
- String literals containing the patterns
- Comments containing the patterns
- JSDoc/multi-line comments

Regex-based detection is approximate; if you encounter a false positive, add a comment explaining the exception:
```typescript
// EXCEPTION: This pattern is required for X reason
function specialCase({ x }: { x: string }) { }
```

## Related Rules

- `shared/conventions.md` — "Destructuring in Signature, Not in Body" section
- `shared/types-architecture.md` — Types per entity architecture
- `memory-decisions.md` — 2026-04-08 entry (hook implementation)
