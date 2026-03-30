# Session Data Reuse

## Principle

**Never re-fetch from Firestore what a previous step already knows.** When a flow spans multiple handlers (user selects service → edits → confirms), pass data forward via session instead of calling Firestore again at each step.

## Pattern: Cache at Entry, Read from Session Downstream

### Entry point (first handler in the flow)
Fetch from Firestore and store in session:

```typescript
const service = await getServiceById(serviceId);
await setSession(telegramUserId, {
  ...emptySessionForPartial(telegramUserId),
  serviceId,
  serviceName: service.name,
});
```

### Downstream handlers (subsequent steps)
Read from session first, Firestore as fallback:

```typescript
async function getServiceNameCached(
  telegramUserId: string, serviceId: string
): Promise<string | null> {
  const session = await getSession(telegramUserId);
  if (session?.serviceId === serviceId && session?.serviceName) {
    return session.serviceName;
  }
  const service = await getServiceById(serviceId);
  return service?.name || null;
}
```

## When to Apply

| Situation | Action |
|-----------|--------|
| Handler A fetches a value, Handler B (next step) needs the same value | Store in session at A, read from session at B |
| Multiple handlers in a flow need `serviceName`, `selectedMonth`, etc. | Cache at flow entry point |
| A value is derived (e.g., formatted name) and reused later | Store the derived value, not just the raw ID |
| Loop fetches same document type repeatedly | Use `Promise.all` + batch, not sequential awaits |

## When NOT to Apply

| Situation | Reason |
|-----------|--------|
| Data may have changed between steps (e.g., `isPaid` status) | Stale cache risk — re-fetch |
| Entry point of a new flow (no prior session context) | Must fetch from Firestore |
| One-shot handler (no subsequent steps) | No reuse opportunity |

## Session Fields Available for Caching

See `types/index.ts` — Session interface. Key fields:
- `serviceId` / `serviceName` — avoid re-fetching service document
- `selectedMonth` — avoid re-deriving month context
- `installmentId` — avoid re-querying installment
- `pendingFileId` / `pendingFileType` — file data across photo → classification → upload steps

## Anti-Patterns

```typescript
// BAD: fetching serviceById in every handler of the same flow
async function handleStep2(ctx) {
  const service = await getServiceById(serviceId); // already fetched in step 1
  const name = service.name;
}

// BAD: sequential independent reads
const service = await getServiceById(id);
const installment = await getInstallment(id, month);

// GOOD: parallel independent reads
const [service, installment] = await Promise.all([
  getServiceById(id),
  getInstallment(id, month),
]);
```

## See Also

- [Conventions](conventions.md) — project structure
- [Guard Conditions](guard-conditions.md) — validation pattern
