# Memory

## CI/CD

- `firestore.indexes.json` se despliega automáticamente via GitHub Actions al hacer merge a `main` (`.github/workflows/deploy-indexes.yml`). No es necesario correr `firebase deploy --only firestore:indexes` manualmente.
- Existe también `deploy-functions.yml` y `ci.yml` en `.github/workflows/`.
