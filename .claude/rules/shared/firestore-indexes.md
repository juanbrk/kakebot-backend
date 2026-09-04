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
| `services` | `telegramUserId` ↑, `createdAt` ↑ | ✅ | List user's services |
| `service_installments` | `dueMonth` ↑, `telegramUserId` ↑, `serviceName` ↑ | ✅ | Generate monthly report with service section |
| `expenses` | `telegramUserId` ↑, `date` ↑ | ✅ | Monthly report expense filtering |
| `incomes` | `telegramUserId` ↑, `date` ↑ | ✅ | Monthly income report filtering |
| `usd_sales` | `telegramUserId` ↑, `date` ↑ | ✅ | Monthly USD sale section + weighted average sale rate |

## Preferred Workflow

**Always add new indexes to `firestore.indexes.json` BEFORE deploying to production.**

Benefits:
- Indexes are version-controlled in the repository
- Team visibility: all indexes tracked in one file
- Reproducibility: deploy with `firebase deploy --only firestore:indexes`

⚠️ Do NOT create indexes manually in Firebase Console — they won't be tracked in git.

### `firebase.ci.json` — por qué existe un segundo archivo de config

`deploy-indexes.yml` deploya con `--config firebase.ci.json`, no con `firebase.json`. Ese archivo
es el bloque `firestore` de `firebase.json` **menos** `"rules"`, y la omisión es deliberada: con
`--only firestore:indexes`, `firebase-tools` igual compila `firestore.rules` (su `prepare.js`
ignora el flag `context.firestoreRules` que él mismo calcula), y esa compilación pega a
`firebaserules.googleapis.com/...:test`, que requiere el permiso `firebaserules.rulesets.test`.
El service account del WIF tiene `roles/firebase.sdkAdminServiceAgent`, que **no** lo incluye →
403 y el job muere sin deployar nada (pasó el 2026-09-03). Sin `"rules"` en la config, esa
compilación no ocurre.

**No borrar `firebase.ci.json` "porque duplica firebase.json"**, ni agregarle `"rules"`. Las rules
nunca se deployaron desde este workflow — `deploy.js` y `release.js` sí respetan el flag. Si algún
día hace falta deployarlas desde CI, el camino es otro: darle al SA `firebaserules.rulesets.test`.
El deploy manual (`npm run go` → Prod → Deploy indexes) sigue usando `firebase.json` y corre con
las credenciales de Juan, que sí tienen el permiso.

Tampoco recortar el archivo a solo `"indexes"`: `prepare.js` llama `createDatabase()` en **todo**
deploy y, si `getDatabase` devuelve 404, crea la base en `firestoreCfg.location || "nam5"`. Con la
base ya existente nunca se dispara, pero `database` y `location` son lo que evita que el default
silencioso apunte al hemisferio equivocado.

## Creating Indexes Programmatically

Add entries to `firestore.indexes.json`:

```json
{
  "collectionGroup": "COLLECTION_NAME",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "fieldName1", "order": "ASCENDING" },
    { "fieldPath": "fieldName2", "order": "ASCENDING" }
  ]
}
```

Then deploy with:
```bash
firebase deploy --only firestore:indexes
```

Wait 5-10 minutes for status to change from "Creating" → "Enabled".

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
