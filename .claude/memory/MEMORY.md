# Memory

## CI/CD

- `firestore.indexes.json` se despliega automáticamente via GitHub Actions al hacer merge a `main` (`.github/workflows/deploy-indexes.yml`). No es necesario correr `firebase deploy --only firestore:indexes` manualmente.
- Existe también `deploy-functions.yml` y `ci.yml` en `.github/workflows/`.
- El deploy de índices en CI usa `firebase.ci.json` (sin `rules`) — no borrar ni agregarle `"rules"`.

## Types Architecture Status

- Archivos de tipos por entidad: `expense`, `income`, `report`, `category`, `service`, `card`, `tax`, `storage`, `upcoming-dues`, `handlers`, `logger`, `telegraf-context`
- `types/index.ts` congelado — no agregar interfaces nuevas ahí
- `Session`, `SessionState` y type guards eliminados (migración a WizardScene completada)
- Pendientes de migrar: `SubcategoryMapping`, `Category`, `Service`, `CreditCard` (ver `shared/types-architecture.md`)

## WizardScene (Telegraf)

- Migración completa: 9 dominios migrados a `Scenes.WizardScene` nativo (junio 2026)
- Store Firestore: colección `telegraf_sessions`; `getSessionKey = ctx.from?.id.toString()`
- `session.service.ts` y ~30 campos legacy de Session eliminados
- Reglamento completo en `shared/wizard-scenes.md` + hook `check-wizard-scene.js`

## Current Branch

- `fix/escape-markdown-user-input`: migración de `parse_mode: "Markdown"` → `"HTML"` + `escapeHtml` para texto de usuario
