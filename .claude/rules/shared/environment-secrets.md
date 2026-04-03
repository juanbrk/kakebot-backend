# Environment Secrets Management

## Critical Rule

**EVERY variable change in `.env.prod` MUST be synced to Firebase Cloud Secrets BEFORE deploying.**

Local `.env` files are only for local development. Production uses Google Cloud Secrets Manager.

## Sync Procedure

### Step 1: Update `.env.prod` locally
```bash
# Edit the variable in functions/.env.prod
GCS_BUCKET=kakebot-972c2
```

### Step 2: Set the secret in Google Cloud
```bash
# For each changed variable, run:
gcloud secrets versions add GCS_BUCKET --data-file=- <<< "kakebot-972c2"

# Or if the secret doesn't exist yet:
gcloud secrets create GCS_BUCKET --data-file=- <<< "kakebot-972c2"
```

### Step 3: Grant Cloud Functions service account access
```bash
# The service account needs to read secrets
gcloud secrets add-iam-policy-binding GCS_BUCKET \
  --member=serviceAccount:kakebot-972c2@appspot.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

### Step 4: Deploy (GitHub Actions will pick up the secret)
```bash
git add functions/.env.prod
git commit -m "Update GCS_BUCKET configuration"
git push
# GitHub Actions deploy-functions.yml runs automatically
```

## List of All Secrets (Production)

| Secret | Current Value | Last Updated |
|--------|---------------|--------------|
| `TELEGRAM_BOT_TOKEN` | ✅ set | 2026-03-01 |
| `AUTHORIZED_USER_ID` | ✅ set | 2026-03-02 |
| `GCS_BUCKET` | ✅ set | 2026-04-03 |

## Verification

To verify a secret exists in Google Cloud:
```bash
gcloud secrets list
gcloud secrets versions list GCS_BUCKET
```

## Why This Matters

- `.env` files are git-ignored (for security)
- Firebase Functions runtime needs access to these values
- Forgetting to set the secret = runtime 404/access errors in production
- Local dev works (emulator reads `.env`) but production fails silently
