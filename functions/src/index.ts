import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import express from "express";
import cors from "cors";
import { apiRouter } from "./routes";
import { telegramBot } from "./bot/telegram";

// Inicializar Firebase Admin
admin.initializeApp();

// Configurar Express
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Finance Platform API",
    version: "0.1.0",
  });
});

// API Routes
app.use("/api", apiRouter);

// Exportar función HTTP para API
export const api = functions.https.onRequest(app);

// Exportar función para Telegram Bot
export const bot = functions.https.onRequest(async (req, res) => {
  try {
    await telegramBot.handleUpdate(req.body);
    res.status(200).send("OK");
  } catch (error) {
    console.error("Error handling telegram update:", error);
    res.status(500).send("Error");
  }
});

// Cloud Function para generar reportes mensuales automáticamente
export const generateMonthlyReport = functions.pubsub
  .schedule("0 0 1 * *") // Primer día de cada mes a medianoche
  .timeZone("America/Argentina/Buenos_Aires")
  .onRun(async (context) => {
    const db = admin.firestore();
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    console.log(`Generating monthly reports for ${lastMonth.toISOString()}`);

    // TODO: Implementar lógica de generación de reportes
    // 1. Obtener todas las familias
    // 2. Para cada familia, calcular totales del mes anterior
    // 3. Guardar reporte en Firestore

    return null;
  });

// Cloud Function para backup automático
export const dailyBackup = functions.pubsub
  .schedule("0 2 * * *") // Todos los días a las 2 AM
  .timeZone("America/Argentina/Buenos_Aires")
  .onRun(async (context) => {
    console.log("Running daily backup");
    // TODO: Implementar backup de Firestore
    return null;
  });
