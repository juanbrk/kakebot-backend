# Guard Conditions and Preconditions

## Principle

Extract multi-part conditions into a named variable before the guard. This makes preconditions explicit and enables early exit—improving readability and reducing nesting.

## Pattern: Guard Clause with Named Preconditions

### ❌ WRONG — Nested conditions hide intent

```typescript
if (ctx.from && session && session.state === "svc_awaiting_day" && messageText) {
  // ... 15 lines of implementation
}
```

**Problems:**
- Intent is buried in condition syntax
- Difficult to understand what preconditions are required
- Deep nesting if there are follow-up conditions
- Hard to reuse the condition elsewhere

### ✅ RIGHT — Named variable clarifies preconditions

```typescript
const isValidServiceDayInput =
  ctx.from &&
  session &&
  session.state === "svc_awaiting_day" &&
  messageText.trim().length > 0;

if (!isValidServiceDayInput) {
  return;
}

// ... 15 lines of implementation
```

**Benefits:**
- Preconditions are explicit and self-documenting
- Early return pattern reduces nesting
- Condition can be reused elsewhere
- Easier to test and debug
- Better code review experience

## Naming Convention

Use a descriptive `is*` or `should*` prefix:
- `isValidInput`
- `isAuthorizedUser`
- `shouldProcessRequest`
- `canProceedWithSave`
- `hasRequiredFields`

## Examples in Codebase

### Service Registration Flow

```typescript
// ❌ BEFORE: Nested condition
if (session && session.serviceId && session.selectedMonth && dayStr) {
  const [year, month] = session.selectedMonth.split("-");
  const dueDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, day);
  // ... continue
}

// ✅ AFTER: Guard clause
const hasRequiredSessionData =
  session &&
  session.serviceId &&
  session.selectedMonth &&
  dayStr;

if (!hasRequiredSessionData) {
  await ctx.reply("Error: datos de sesión incompletos.");
  return;
}

const [year, month] = session.selectedMonth.split("-");
const dueDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, day);
// ... continue
```

### Duplicate Detection

```typescript
// ❌ BEFORE: Complex nested condition
if (session && session.selectedMonth && session.partialAmount) {
  const existing = await getInstallment(serviceId, selectedMonth);
  if (existing) {
    // handle duplicate
  } else {
    // save
  }
}

// ✅ AFTER: Named preconditions
const hasInstallmentData =
  session &&
  session.selectedMonth &&
  session.partialAmount;

if (!hasInstallmentData) {
  return;
}

const existing = await getInstallment(serviceId, selectedMonth);
if (existing) {
  // handle duplicate
} else {
  // save
}
```

## When to Apply

Apply this pattern when:
- Condition has 3+ parts (e.g., `a && b && c`)
- Condition is used multiple times
- Condition's purpose is not immediately obvious
- Implementation block is longer than 10 lines

Skip this pattern when:
- Simple 1-2 part conditions (e.g., `if (!user) return`)
- Ternary/conditional operator (use as-is)
- Logic is self-evident (e.g., `if (isEmpty(list)) return`)

## See Also

- [Code Conventions](conventions.md) — general code style
- [Hard Walls](../core/hard-walls.md) — security checks require explicit guards
