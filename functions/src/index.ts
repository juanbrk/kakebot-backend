import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { telegramBot } from "./bot/telegram";
import { log } from "./helpers/logger";

admin.initializeApp();

export const bot = functions.https.onRequest(async (req, res) => {
  try {
    await telegramBot.handleUpdate(req.body);
    res.status(200).send("OK");
  } catch (error) {
    log.error("Error handling telegram update", error, { module: "index" });
    res.status(500).send("Error");
  }
});
