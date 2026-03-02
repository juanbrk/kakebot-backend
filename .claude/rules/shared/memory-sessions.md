# Session Log

## 2026-03-01: Initial setup and expense registration

### Completed
- Created Telegram bot with @BotFather, configured token in .env
- Set webhook to `https://us-central1-kakebot-972c2.cloudfunctions.net/bot`
- Cleaned project to minimal skeleton (bot-only, empty routes preserved)
- Fixed ESLint config (.eslintrc.js): added tsconfig.dev.json, disabled new-cap and no-namespace
- Upgraded Node.js engine from 18 to 20 (18 was decommissioned)
- Added .env to functions/.gitignore
- Implemented expense registration system:
  - Free text parsing (description + amount, Argentine format)
  - Inline keyboard confirmation (Confirm/Cancel)
  - Firestore storage in `expenses` collection
  - Auto-category assignment via `subcategory_mappings`
  - Monthly report command `/reporte`
- Set up CLAUDE.md + .claude/rules/ modular rule system
- Created local dev environment:
  - `dev.ts` for polling mode with Firestore emulator
  - npm scripts: `dev`, `dev:bot`, `dev:emulators`
  - Environment switching: `env:test`, `env:prod`, `env:status`
  - Deploy scripts: `deploy:test`, `deploy:prod`
- Added Firestore composite index (telegramUserId + date)
- Captured Juan's Telegram user ID: `1183288911`
- Tested expense registration on emulators — working
- Build + lint pass clean

### Pending
- Restrict bot to authorized user only (ID: 1183288911)
- Test `/reporte` command on emulators
- Deploy Firestore indexes to production
- Implement category assignment feature
