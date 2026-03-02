#!/bin/bash
# Switch between test and prod environments
# Usage: ./scripts/switch-env.sh [test|prod|status]

FUNCTIONS_DIR="$(dirname "$0")/../functions"
ENV_FILE="$FUNCTIONS_DIR/.env"
ENV_TEST="$FUNCTIONS_DIR/.env.test"
ENV_PROD="$FUNCTIONS_DIR/.env.prod"

show_current() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "No .env file found"
    return
  fi
  if grep -q "botitio_testitoBot\|1717305413" "$ENV_FILE" 2>/dev/null; then
    echo "Current: TEST (botitio_testitoBot)"
  elif grep -q "kakebot\|8774417787" "$ENV_FILE" 2>/dev/null; then
    echo "Current: PROD (kakebot)"
  else
    echo "Current: UNKNOWN"
  fi
}

case "${1:-status}" in
  test)
    cp "$ENV_TEST" "$ENV_FILE"
    echo "Switched to TEST (botitio_testitoBot)"
    ;;
  prod)
    cp "$ENV_PROD" "$ENV_FILE"
    echo "Switched to PROD (kakebot)"
    ;;
  status)
    show_current
    ;;
  *)
    echo "Usage: ./scripts/switch-env.sh [test|prod|status]"
    exit 1
    ;;
esac
