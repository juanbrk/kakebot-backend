#!/bin/bash
# Set Telegram webhook from active .env
# Usage: ./scripts/set-webhook.sh

FUNCTIONS_DIR="$(dirname "$0")/../functions"
ENV_FILE="$FUNCTIONS_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: No .env file found at $ENV_FILE"
  exit 1
fi

TOKEN=$(grep "^TELEGRAM_BOT_TOKEN=" "$ENV_FILE" | cut -d'=' -f2)
WEBHOOK_URL=$(grep "^TELEGRAM_WEBHOOK_URL=" "$ENV_FILE" | cut -d'=' -f2)

if [ -z "$TOKEN" ] || [ -z "$WEBHOOK_URL" ]; then
  echo "Error: TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_URL not found in .env"
  exit 1
fi

echo "Setting webhook to: $WEBHOOK_URL"
RESPONSE=$(curl -sF "url=$WEBHOOK_URL" "https://api.telegram.org/bot$TOKEN/setWebhook")

if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "Webhook configured successfully"
else
  echo "Error setting webhook: $RESPONSE"
  exit 1
fi
