# Environment Secrets Management

## Cómo llegan las variables a producción (flujo real)

```
GitHub Repository Secrets  (Settings → Secrets and variables → Actions)
  ↓  deploy-functions.yml escribe: echo "VAR=${VAR}" >> functions/.env
Firebase CLI deploys con ese .env
  ↓
Cloud Function lee process.env.VAR_NAME
```

**Los `.env.*` locales son solo referencia.** Lo que llega a producción viene de los GitHub Repository Secrets.

## Regla crítica

**Toda vez que se modifica o agrega una variable en `.env.prod`, hay que actualizar el GitHub Repository Secret correspondiente.**

Sin ese paso, el cambio es invisible en producción aunque el archivo local esté correcto.

## Procedimiento al cambiar una variable

### 1. Actualizar `.env.prod` localmente
```bash
GCS_BUCKET=kakebot-972c2.firebasestorage.app
```

### 2. Actualizar el GitHub Repository Secret (CRÍTICO)
Ir a: **github.com → repo → Settings → Secrets and variables → Actions → Repository secrets**
Editar `GCS_BUCKET` con el nuevo valor.

### 3. Registrar en `.pending-secrets` (para sync a Cloud Secrets Manager)
```bash
echo "GCS_BUCKET" >> scripts/.pending-secrets
```
Luego: `npm run go → Prod → Sync secrets`

### 4. Push a main → GitHub Actions redespliega automáticamente

## Variables de producción

| Variable | GitHub Secret | GCloud Secret | Última actualización |
|----------|--------------|----------------|----------------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | ✅ | 2026-03-01 |
| `AUTHORIZED_USER_ID` | ✅ | ✅ | 2026-03-02 |
| `GCS_BUCKET` | ⚠️ actualizar | ✅ `kakebot-972c2.firebasestorage.app` | 2026-04-04 |

## Google Cloud Secrets Manager

La función **no lee de Cloud Secrets Manager directamente** (no usa `runWith({ secrets: [...] })`).
El sync a GCloud se mantiene por consistencia y como backup, pero no es lo que alimenta el deploy actual.

## Verificación post-deploy

```bash
gcloud functions logs read bot --limit 30 --project kakebot-972c2 2>&1 | grep -i "bucket\|storage\|Error"
```

## First-Time Setup

The Secret Manager API is **not enabled by default** in new GCloud projects.
The first time `go.sh → Prod → Sync secrets` runs on a new project, gcloud may ask:
```
API [secretmanager.googleapis.com] not enabled on project. Would you like to enable and retry?
```
Answer `y`. The API will be enabled and the operation will retry automatically.
This only happens once per project.
