// Local dev script: runs bot in polling mode with Firestore emulator
// Usage: npm run dev (from functions/)

import * as admin from "firebase-admin";

// Point to Firestore emulator BEFORE initializing
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";

admin.initializeApp({ projectId: "kakebot-972c2" });

// Import bot after admin is initialized
import { telegramBot } from "./bot/telegram";

// Delete any existing webhook so polling works
telegramBot.telegram.deleteWebhook().then(() => {
  console.log("Webhook deleted, starting polling...");
  console.log(`Bot token: ...${(process.env.TELEGRAM_BOT_TOKEN || "").slice(-6)}`);
  console.log("Firestore: emulator (localhost:8080)");
  console.log("Ready! Send a message to the bot in Telegram.\n");

  telegramBot.launch();
});

// Graceful shutdown
process.once("SIGINT", () => telegramBot.stop("SIGINT"));
process.once("SIGTERM", () => telegramBot.stop("SIGTERM"));
