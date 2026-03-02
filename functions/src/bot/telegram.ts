import { Telegraf, Markup } from "telegraf";
import * as admin from "firebase-admin";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
export const telegramBot = new Telegraf(BOT_TOKEN);

const AMOUNT_PATTERN =
  /([\d]+(?:\.[\d]{3})*(?:,[\d]{1,2})?|[\d]+(?:\.[\d]{1,2})?)/;
const AMOUNT_AT_END =
  new RegExp(`^(.+?)\\s+${AMOUNT_PATTERN.source}$`);
const AMOUNT_AT_START =
  new RegExp(`^${AMOUNT_PATTERN.source}\\s+(.+)$`);

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre",
  "Diciembre",
];

function getDb() {
  return admin.firestore();
}

function toFloatOrNull(value: string): number | null {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parses Argentine-format amount strings into numbers.
 * Handles thousands separator (dot) and decimal separator (comma).
 *
 * @param {string} input - e.g. "238.130,00", "9.444,32", "238130", "8.50"
 * @return {number | null} Parsed number or null if invalid
 */
function parseArgentineAmount(input: string): number | null {
  if (input.includes(",")) {
    const withoutThousands = input.replace(/\./g, "");
    const withDotDecimal = withoutThousands.replace(",", ".");
    return toFloatOrNull(withDotDecimal);
  }

  if (input.includes(".")) {
    const dotSegments = input.split(".");
    const decimalPart = dotSegments[dotSegments.length - 1];
    const looksLikeDecimal =
      dotSegments.length === 2 && decimalPart.length <= 2;

    if (looksLikeDecimal) {
      return toFloatOrNull(input);
    }

    const withoutThousands = input.replace(/\./g, "");
    return toFloatOrNull(withoutThousands);
  }

  return toFloatOrNull(input);
}

function parseExpenseMessage(
  text: string
): { description: string; amount: number } | null {
  const trimmed = text.trim();

  const amountAtEnd = trimmed.match(AMOUNT_AT_END);
  if (amountAtEnd) {
    const amount = parseArgentineAmount(amountAtEnd[2]);
    if (amount !== null && amount > 0) {
      return { description: amountAtEnd[1].trim(), amount };
    }
  }

  const amountAtStart = trimmed.match(AMOUNT_AT_START);
  if (amountAtStart) {
    const amount = parseArgentineAmount(amountAtStart[1]);
    if (amount !== null && amount > 0) {
      return { description: amountAtStart[2].trim(), amount };
    }
  }

  return null;
}

function formatARS(amount: number): string {
  return "$ " + amount.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

telegramBot.start(async (ctx) => {
  const firstName = ctx.from?.first_name || "Usuario";
  await ctx.reply(
    `Hola ${firstName}! Bienvenido a KakeBot.\n\n` +
    "Envia un mensaje con descripcion y monto para registrar un gasto:\n" +
    "Ej: Panaderia 5000\n" +
    "Ej: Carrefour express 14.819\n\n" +
    "Comandos:\n" +
    "/reporte - Resumen del mes actual"
  );
});

telegramBot.on("text", async (ctx) => {
  const messageText = ctx.message.text;

  if (messageText.startsWith("/")) return;

  const expense = parseExpenseMessage(messageText);
  if (!expense) {
    await ctx.reply(
      "No pude interpretar el mensaje.\n" +
      "Formato: <descripcion> <monto>\n" +
      "Ej: Panaderia 5000"
    );
    return;
  }

  await ctx.reply(
    `Registrar gasto?\n${expense.description} ${formatARS(expense.amount)}`,
    Markup.inlineKeyboard([
      Markup.button.callback(
        "Confirmar",
        `confirm:${expense.description}:${expense.amount}`
      ),
      Markup.button.callback("Cancelar", "cancel"),
    ])
  );
});

telegramBot.action(/^confirm:(.+):(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const description = ctx.match[1];
  const amount = parseFloat(ctx.match[2]);
  const telegramUserId = ctx.from?.id.toString() || "";
  const normalizedDesc = description.toLowerCase().trim();

  const existingMapping = await getDb()
    .collection("subcategory_mappings")
    .where("normalizedDesc", "==", normalizedDesc)
    .where("telegramUserId", "==", telegramUserId)
    .limit(1)
    .get();

  const categoryId = existingMapping.empty ?
    null :
    existingMapping.docs[0].data().categoryId;

  await getDb().collection("expenses").add({
    telegramUserId,
    description,
    normalizedDesc,
    amount,
    categoryId,
    date: admin.firestore.Timestamp.now(),
    createdAt: admin.firestore.Timestamp.now(),
  });

  const categoryLabel = categoryId ?
    ` (${categoryId})` :
    "";

  await ctx.editMessageText(
    `Gasto registrado: ${description} ${formatARS(amount)}${categoryLabel}`
  );
});

telegramBot.action("cancel", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText("Gasto anulado.");
});

telegramBot.command("reporte", async (ctx) => {
  const telegramUserId = ctx.from?.id.toString() || "";
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(
    now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59
  );

  const expensesSnapshot = await getDb()
    .collection("expenses")
    .where("telegramUserId", "==", telegramUserId)
    .where("date", ">=", admin.firestore.Timestamp.fromDate(startOfMonth))
    .where("date", "<=", admin.firestore.Timestamp.fromDate(endOfMonth))
    .get();

  if (expensesSnapshot.empty) {
    await ctx.reply("No hay gastos registrados este mes.");
    return;
  }

  const groupedByCategory: Record<string, Record<string, {
    displayName: string;
    total: number;
  }>> = {};

  let grandTotal = 0;

  expensesSnapshot.docs.forEach((doc) => {
    const expenseData = doc.data();
    const categoryKey = expenseData.categoryId || "sin_categoria";
    const subcategoryKey = expenseData.normalizedDesc as string;

    if (!groupedByCategory[categoryKey]) {
      groupedByCategory[categoryKey] = {};
    }
    if (!groupedByCategory[categoryKey][subcategoryKey]) {
      groupedByCategory[categoryKey][subcategoryKey] = {
        displayName: expenseData.description,
        total: 0,
      };
    }
    groupedByCategory[categoryKey][subcategoryKey].total +=
      expenseData.amount;
    grandTotal += expenseData.amount;
  });

  const reportLines: string[] = [];
  reportLines.push(
    `Reporte ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`
  );
  reportLines.push(`Total: ${formatARS(grandTotal)}\n`);

  for (const [categoryId, subcategories] of
    Object.entries(groupedByCategory)) {
    const categoryTotal = Object.values(subcategories)
      .reduce((sum, subcategory) => sum + subcategory.total, 0);
    const categoryLabel = categoryId === "sin_categoria" ?
      "SIN CATEGORIA" :
      categoryId.toUpperCase();

    reportLines.push(`${categoryLabel} ${formatARS(categoryTotal)}`);

    for (const subcategory of Object.values(subcategories)) {
      reportLines.push(
        `  - ${subcategory.displayName}  ${formatARS(subcategory.total)}`
      );
    }
    reportLines.push("");
  }

  await ctx.reply(reportLines.join("\n"));
});

telegramBot.catch((err: unknown) => {
  console.error("Bot error:", err);
});
