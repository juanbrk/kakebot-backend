import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { telegramBot } from "./bot/telegram";

admin.initializeApp();

export const bot = functions.https.onRequest(async (req, res) => {
  try {
    await telegramBot.handleUpdate(req.body);
    res.status(200).send("OK");
  } catch (error) {
    console.error("Error handling telegram update:", error);
    res.status(500).send("Error");
  }
});
