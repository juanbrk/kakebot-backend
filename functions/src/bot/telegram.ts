import { Telegraf, Context } from "telegraf";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ||
  functions.config().telegram?.token || "";

export const telegramBot = new Telegraf(BOT_TOKEN);

const db = admin.firestore();

// Comando /start
telegramBot.start(async (ctx: Context) => {
  const userId = ctx.from?.id;
  const username = ctx.from?.username || ctx.from?.first_name || "Usuario";

  await ctx.reply(
    `¡Hola ${username}! 👋\n\n` +
    "Bienvenido al bot de Finanzas Hogareñas.\n\n" +
    "Comandos disponibles:\n" +
    "/gasto <monto> <categoria> <descripción> - Registrar un gasto\n" +
    "/ingreso <monto> <descripción> - Registrar un ingreso\n" +
    "/resumen - Ver resumen del mes\n" +
    "/categorias - Ver categorías disponibles\n" +
    "/ayuda - Ver ayuda completa"
  );
});

// Comando /gasto
telegramBot.command("gasto", async (ctx: Context) => {
  try {
    const text = ctx.message?.text || "";
    const parts = text.split(" ").slice(1); // Remover "/gasto"

    if (parts.length < 3) {
      return ctx.reply(
        "Formato incorrecto. Usa:\n" +
        "/gasto <monto> <categoria> <descripción>\n\n" +
        "Ejemplo: /gasto 5000 comida Almuerzo en restaurante"
      );
    }

    const amount = parseFloat(parts[0]);
    const category = parts[1].toLowerCase();
    const description = parts.slice(2).join(" ");

    if (isNaN(amount)) {
      return ctx.reply("El monto debe ser un número válido");
    }

    const userId = ctx.from?.id.toString();
    const userName = ctx.from?.first_name || "Usuario";

    // TODO: Vincular telegramId con usuario en Firestore
    // Por ahora, asumimos que el usuario ya está registrado

    const transactionData = {
      type: "expense",
      amount,
      currency: "ARS",
      category,
      description,
      date: new Date(),
      createdBy: userId,
      telegramUser: userName,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("transactions").add(transactionData);

    await ctx.reply(
      `✅ Gasto registrado:\n` +
      `💰 Monto: $${amount.toLocaleString("es-AR")}\n` +
      `📁 Categoría: ${category}\n` +
      `📝 Descripción: ${description}`
    );
  } catch (error) {
    console.error("Error registering expense:", error);
    await ctx.reply("❌ Error al registrar el gasto. Intenta nuevamente.");
  }
});

// Comando /ingreso
telegramBot.command("ingreso", async (ctx: Context) => {
  try {
    const text = ctx.message?.text || "";
    const parts = text.split(" ").slice(1);

    if (parts.length < 2) {
      return ctx.reply(
        "Formato incorrecto. Usa:\n" +
        "/ingreso <monto> <descripción>\n\n" +
        "Ejemplo: /ingreso 500000 Sueldo mensual"
      );
    }

    const amount = parseFloat(parts[0]);
    const description = parts.slice(1).join(" ");

    if (isNaN(amount)) {
      return ctx.reply("El monto debe ser un número válido");
    }

    const userId = ctx.from?.id.toString();
    const userName = ctx.from?.first_name || "Usuario";

    const transactionData = {
      type: "income",
      amount,
      currency: "ARS",
      category: "ingreso",
      description,
      date: new Date(),
      createdBy: userId,
      telegramUser: userName,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("transactions").add(transactionData);

    await ctx.reply(
      `✅ Ingreso registrado:\n` +
      `💰 Monto: $${amount.toLocaleString("es-AR")}\n` +
      `📝 Descripción: ${description}`
    );
  } catch (error) {
    console.error("Error registering income:", error);
    await ctx.reply("❌ Error al registrar el ingreso. Intenta nuevamente.");
  }
});

// Comando /resumen
telegramBot.command("resumen", async (ctx: Context) => {
  try {
    const userId = ctx.from?.id.toString();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // TODO: Filtrar por familyId del usuario
    const snapshot = await db.collection("transactions")
      .where("createdBy", "==", userId)
      .where("date", ">=", startOfMonth)
      .get();

    let totalIncome = 0;
    let totalExpense = 0;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.type === "income") {
        totalIncome += data.amount;
      } else {
        totalExpense += data.amount;
      }
    });

    const balance = totalIncome - totalExpense;

    await ctx.reply(
      `📊 Resumen del mes:\n\n` +
      `💰 Ingresos: $${totalIncome.toLocaleString("es-AR")}\n` +
      `💸 Egresos: $${totalExpense.toLocaleString("es-AR")}\n` +
      `📈 Balance: $${balance.toLocaleString("es-AR")}\n\n` +
      `📝 Total transacciones: ${snapshot.size}`
    );
  } catch (error) {
    console.error("Error generating summary:", error);
    await ctx.reply("❌ Error al generar el resumen.");
  }
});

// Comando /categorias
telegramBot.command("categorias", async (ctx: Context) => {
  const categories = [
    "comida",
    "transporte",
    "salud",
    "esparcimiento",
    "servicios",
    "educacion",
    "limpieza",
    "tarjetas",
    "impuestos",
    "extra",
  ];

  await ctx.reply(
    "📁 Categorías disponibles:\n\n" +
    categories.map((cat) => `• ${cat}`).join("\n")
  );
});

// Comando /ayuda
telegramBot.command("ayuda", async (ctx: Context) => {
  await ctx.reply(
    "📖 Ayuda - Finanzas Hogareñas\n\n" +
    "Comandos disponibles:\n\n" +
    "💸 GASTOS:\n" +
    "/gasto <monto> <categoria> <descripción>\n" +
    "Ejemplo: /gasto 5000 comida Pizza delivery\n\n" +
    "💰 INGRESOS:\n" +
    "/ingreso <monto> <descripción>\n" +
    "Ejemplo: /ingreso 500000 Sueldo mensual\n\n" +
    "📊 CONSULTAS:\n" +
    "/resumen - Ver resumen del mes\n" +
    "/categorias - Ver categorías disponibles\n\n" +
    "❓ AYUDA:\n" +
    "/ayuda - Ver esta ayuda\n" +
    "/start - Mensaje de bienvenida"
  );
});

// Manejo de errores
telegramBot.catch((err: any, ctx: Context) => {
  console.error("Bot error:", err);
  ctx.reply("❌ Ocurrió un error. Por favor intenta nuevamente.");
});

export default telegramBot;
