# Firestore Composite Indexes

## Why This Matters

Any Firestore query with **2+ field filters** requires a **composite index**. Without it:
- Query fails silently in production
- Bot doesn't crash — it just returns nothing or empty responses
- Very difficult to debug because logs show "The query requires an index" error

### Example: Real Problem from KakeBot
```
/reporte command returns empty text because:
service_installments query filters by (telegramUserId + dueMonth + serviceName)
→ This 3-field query needs a composite index
→ Index didn't exist → query failed → report was empty
```

## Pre-Deploy Checklist

**BEFORE every production deploy:**

1. **Check logs for index errors:**
   ```bash
   gcloud functions logs read bot --limit 100 --project kakebot-972c2 2>&1 | grep "requires an index"
   ```
   - If output appears → indexes are missing
   - Copy the full error including the Firebase Console URL

2. **Identify all composite indexes needed:**
   - Every query file: `services/expense.service.ts`, `services/report.service.ts`, etc.
   - Look for `where()` chains with 2+ conditions
   - Document the collection + field combinations

3. **Create missing indexes:**
   - **Option A (Easy)**: Click the link in the error log
     - Firebase Console auto-opens with pre-filled index config
     - Click "Create Index" and wait 5-10 minutes
   - **Option B (Manual)**: Go to Firebase Console → Firestore → Indexes → Create Index
     - Select collection, add fields in order, click Create

4. **Verify creation:**
   - Wait for status to change from "Creating" → "Enabled"
   - Re-run the same action that triggered the error
   - Check logs again — error should be gone

## Current Indexes (KakeBot)

| Collection | Fields | Status | Purpose |
|---|---|---|---|
| `services` | `telegramUserId` ↑, `createdAt` ↑ | ❓ | List user's services |
| `service_installments` | `dueMonth` ↑, `telegramUserId` ↑, `serviceName` ↑ | ❓ | Generate monthly report with service section |
| `expenses` | `telegramUserId` ↑, `date` ↓ | ✅ | Monthly report expense filtering |

## Creating Indexes Programmatically

If many indexes needed, can use `firestore.indexes.yaml`:

```yaml
indexes:
  - collection: services
    fields:
      - fieldPath: telegramUserId
        order: ASCENDING
      - fieldPath: createdAt
        order: ASCENDING
  - collection: service_installments
    queryScope: COLLECTION
    fields:
      - fieldPath: dueMonth
        order: ASCENDING
      - fieldPath: telegramUserId
        order: ASCENDING
      - fieldPath: serviceName
        order: ASCENDING
```

Then deploy with:
```bash
firebase deploy --only firestore:indexes
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `/reporte` returns empty | service_installments index missing | Create index (dueMonth, telegramUserId, serviceName) |
| `/servicios` (list) doesn't show services | services index missing | Create index (telegramUserId, createdAt) |
| "The query requires an index" in logs | Composite index not created yet | Check log link, create index |
| Index shows "Creating" for >30 min | Usually stalled | Can be safely deleted and recreated |

## Prevention: Query Design

To minimize index needs:
- Use **single-field queries** whenever possible
- Filter by `telegramUserId` first (security boundary)
- Use sorting in code, not in query
- Avoid unnecessary `orderBy` in Firestore — fetch data and sort in JS
