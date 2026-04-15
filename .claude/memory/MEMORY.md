# Memory

## CI/CD

- `firestore.indexes.json` se despliega automáticamente via GitHub Actions al hacer merge a `main` (`.github/workflows/deploy-indexes.yml`). No es necesario correr `firebase deploy --only firestore:indexes` manualmente.
- Existe también `deploy-functions.yml` y `ci.yml` en `.github/workflows/`.

## Types Architecture Status

- Archivos de tipos por entidad: `expense`, `income`, `report`, `category`, `service`, `card`, `tax`, `storage`, `upcoming-dues`
- `types/index.ts` congelado — no agregar interfaces nuevas ahí
- Pendientes de migrar: `Session`, `SessionState`, `SubcategoryMapping`, `Category`, `Service`, `CreditCard` (ver `shared/types-architecture.md`)
