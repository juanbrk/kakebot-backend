#!/bin/bash
# Script interactivo de desarrollo y deploy.
# Usage: npm run go (desde functions/)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FUNCTIONS_DIR="$ROOT/functions"

echo ""
echo "¿En qué entorno querés trabajar?"
echo ""

PS3="→ "
select ENV in "Test (botitio_testitoBot)" "Prod (kakebot)" "Salir"; do
  case $ENV in

    "Test (botitio_testitoBot)")
      bash "$SCRIPT_DIR/switch-env.sh" test
      echo ""

      echo "¿Qué querés hacer?"
      echo ""

      select ACTION in "Set polling" "Iniciar emuladores" "Iniciar desarrollo webhook" "Cancelar"; do
        case $ACTION in

          "Set polling")
            npm run --prefix "$FUNCTIONS_DIR" build || exit 1
            cd "$FUNCTIONS_DIR" || exit 1
            "$FUNCTIONS_DIR/node_modules/.bin/concurrently" \
              "firebase emulators:start --only firestore,storage --import=../emulator-data --export-on-exit=../emulator-data" \
              "./node_modules/.bin/tsc --watch --preserveWatchOutput" \
              "node --watch -r dotenv/config lib/dev.js"
            break
            ;;

          "Iniciar emuladores")
            cd "$ROOT" || exit 1
            firebase emulators:start --only firestore,storage \
              --import=emulator-data --export-on-exit=emulator-data
            break
            ;;

          "Iniciar desarrollo webhook")
            npm run --prefix "$FUNCTIONS_DIR" build || exit 1
            cd "$ROOT" || exit 1
            firebase emulators:start --only functions,firestore,storage \
              --import=emulator-data --export-on-exit=emulator-data
            break
            ;;

          "Cancelar")
            break
            ;;

        esac
      done
      break
      ;;

    "Prod (kakebot)")
      bash "$SCRIPT_DIR/switch-env.sh" prod
      echo ""
      echo "⚠️  Vas a operar contra PRODUCCIÓN (kakebot)."
      read -rp "¿Confirmás? [s/N] " CONFIRM
      if [[ "$CONFIRM" != "s" && "$CONFIRM" != "S" ]]; then
        echo "Operación cancelada."
        exit 0
      fi

      CURRENT_BRANCH=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)
      if [[ "$CURRENT_BRANCH" != "main" ]]; then
        echo "❌ Deploy a producción solo está permitido desde la branch 'main'."
        echo "   Branch actual: $CURRENT_BRANCH"
        exit 1
      fi
      echo ""

      echo "¿Qué querés hacer?"
      echo ""

      select ACTION in "Deploy functions" "Deploy indexes" "Cancelar"; do
        case $ACTION in

          "Deploy functions")
            cd "$ROOT" || exit 1
            firebase deploy --only functions && bash "$SCRIPT_DIR/set-webhook.sh"
            break
            ;;

          "Deploy indexes")
            cd "$ROOT" || exit 1
            firebase deploy --only firestore:indexes
            break
            ;;

          "Cancelar")
            break
            ;;

        esac
      done
      break
      ;;

    "Salir")
      echo "Chau!"
      exit 0
      ;;

    *)
      echo "Opción inválida."
      ;;

  esac
done
