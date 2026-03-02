import { Telegraf, Markup, Context } from "telegraf";
import * as admin from "firebase-admin";
import {
  Expense, Category, Session, PendingDescEntry, SessionExpenseEntry,
  BulkExpenseEntry,
} from "../types/index";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const AUTHORIZED_USER_ID = process.env.AUTHORIZED_USER_ID || "";

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

const CATEGORIES_PER_PAGE = 4;
const MAX_BULK_LINES = 50;

function getDb() {
  return admin.firestore();
}

function isAuthorizedUser(telegramUserId?: number): boolean {
  return telegramUserId?.toString() === AUTHORIZED_USER_ID;
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

// Session helpers
async function getSession(telegramUserId: string): Promise<Session | null> {
  const doc = await getDb().collection("sessions").doc(telegramUserId).get();
  return doc.exists ? (doc.data() as Session) : null;
}

async function setSession(telegramUserId: string, session: Session)
  : Promise<void> {
  await getDb().collection("sessions").doc(telegramUserId).set(session);
}

async function clearSession(telegramUserId: string): Promise<void> {
  await getDb().collection("sessions").doc(telegramUserId).delete();
}

// Category helpers
async function fetchExpenseCategories(): Promise<Category[]> {
  const snapshot = await getDb()
    .collection("categories")
    .where("type", "in", ["expense", "both"])
    .get();

  const categories = snapshot.docs
    .map((doc) => doc.data() as Category)
    .sort((a, b) => a.name.localeCompare(b.name));

  return categories;
}

function buildCategoryKeyboard(categories: Category[], page: number) {
  const start = page * CATEGORIES_PER_PAGE;
  const pageCategories = categories.slice(start, start + CATEGORIES_PER_PAGE);
  const hasNext = start + CATEGORIES_PER_PAGE < categories.length;
  const hasPrev = page > 0;

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [];

  for (let i = 0; i < pageCategories.length; i += 2) {
    const row: ReturnType<typeof Markup.button.callback>[] = [];
    row.push(Markup.button.callback(pageCategories[i].name,
      `cat_sel:${pageCategories[i].id}`));
    if (i + 1 < pageCategories.length) {
      row.push(Markup.button.callback(pageCategories[i + 1].name,
        `cat_sel:${pageCategories[i + 1].id}`));
    }
    buttons.push(row);
  }

  const navRow: ReturnType<typeof Markup.button.callback>[] = [];
  if (hasPrev) {
    navRow.push(Markup.button.callback("← Anterior", `cat_pg:${page - 1}`));
  }
  if (hasNext) {
    navRow.push(Markup.button.callback("Más categorías →", `cat_pg:${page + 1}`));
  }
  if (navRow.length > 0) {
    buttons.push(navRow);
  }

  buttons.push([
    Markup.button.callback("+ Agregar categoría", "cat_new"),
  ]);

  return Markup.inlineKeyboard(buttons);
}

function buildExpensePromptText(
  displayName: string,
  totalAmount: number,
  current: number,
  total: number
): string {
  return (
    `*${displayName}* ${formatARS(totalAmount)} (${current} de ${total})\n` +
    "• Elegí una categoría o creá una nueva\n" +
    "• Enviá \"omitir\" para saltar\n" +
    "• Enviá \"cancelar\" para salir"
  );
}

// Flow helpers
async function assignCategoryToDesc(
  telegramUserId: string,
  normalizedDesc: string,
  displayName: string,
  categoryId: string,
  categoryName: string,
  session: Session
): Promise<Session> {
  const db = getDb();

  const expensesSnapshot = await db
    .collection("expenses")
    .where("telegramUserId", "==", telegramUserId)
    .where("normalizedDesc", "==", normalizedDesc)
    .where("categoryId", "==", null)
    .get();

  const batch = db.batch();

  let totalAmount = 0;
  expensesSnapshot.docs.forEach((doc) => {
    const expenseData = doc.data() as Expense;
    totalAmount += expenseData.amount;
    batch.update(doc.ref, { categoryId });
  });

  const mappingId = `${telegramUserId}_${normalizedDesc}`;
  batch.set(
    db.collection("subcategory_mappings").doc(mappingId),
    {
      normalizedDesc,
      displayName,
      categoryId,
      telegramUserId,
      createdAt: admin.firestore.Timestamp.now(),
    }
  );

  await batch.commit();

  const newEntry: SessionExpenseEntry = {
    desc: normalizedDesc,
    displayName,
    amount: totalAmount,
    categoryName,
  };

  const nextPendingDescs = session.pendingDescs.slice(1);
  const nextDesc = nextPendingDescs.length > 0 ?
    nextPendingDescs[0].normalizedDesc :
    "";
  const nextDisplayName = nextPendingDescs.length > 0 ?
    nextPendingDescs[0].displayName :
    "";
  const nextTotalAmount = nextPendingDescs.length > 0 ?
    nextPendingDescs[0].totalAmount :
    0;

  const updatedSession: Session = {
    ...session,
    pendingDescs: nextPendingDescs,
    currentDesc: nextDesc,
    currentDisplayName: nextDisplayName,
    currentTotalAmount: nextTotalAmount,
    currentPage: 0,
    sessionExpenses: [...session.sessionExpenses, newEntry],
  };

  await setSession(telegramUserId, updatedSession);
  return updatedSession;
}

async function advanceOrFinish(
  ctx: Context,
  session: Session
): Promise<void> {
  if (session.pendingDescs.length === 0) {
    await finishCategorizingFlow(ctx, session);
    return;
  }

  const categories = await fetchExpenseCategories();
  const keyboard = buildCategoryKeyboard(categories, 0);
  const total = session.sessionExpenses.length + session.pendingDescs.length + 1;
  const current = session.sessionExpenses.length + 1;

  const messageText = buildExpensePromptText(
    session.currentDisplayName,
    session.currentTotalAmount,
    current,
    total
  );

  await ctx.telegram.editMessageText(
    session.chatId,
    session.messageId,
    undefined,
    messageText,
    { ...keyboard, parse_mode: "Markdown" }
  );
}

async function finishCategorizingFlow(
  ctx: Context,
  session: Session
): Promise<void> {
  const telegramUserId = session.telegramUserId;

  const uncategorizedSnapshot = await getDb()
    .collection("expenses")
    .where("telegramUserId", "==", telegramUserId)
    .where("categoryId", "==", null)
    .get();

  if (!uncategorizedSnapshot.empty) {
    const groupedDescs: Record<
      string,
      { displayName: string; totalAmount: number }
    > = {};

    uncategorizedSnapshot.docs.forEach((doc) => {
      const expenseData = doc.data() as Expense;
      const key = expenseData.normalizedDesc;
      if (!groupedDescs[key]) {
        groupedDescs[key] = {
          displayName: expenseData.description,
          totalAmount: 0,
        };
      }
      groupedDescs[key].totalAmount += expenseData.amount;
    });

    const pendingDescsKeys = Object.keys(groupedDescs);
    if (pendingDescsKeys.length > 0) {
      const firstDescKey = pendingDescsKeys[0];
      const firstDescData = groupedDescs[firstDescKey];

      const pendingDescsData: PendingDescEntry[] = pendingDescsKeys.slice(1)
        .map((key) => ({
          normalizedDesc: key,
          displayName: groupedDescs[key].displayName,
          totalAmount: groupedDescs[key].totalAmount,
        }));

      const categories = await fetchExpenseCategories();
      const keyboard = buildCategoryKeyboard(categories, 0);
      const total = pendingDescsKeys.length;
      const messageText = buildExpensePromptText(
        firstDescData.displayName,
        firstDescData.totalAmount,
        1,
        total
      );

      const newSession: Session = {
        telegramUserId,
        state: "categorizing",
        pendingDescs: pendingDescsData,
        currentDesc: firstDescKey,
        currentDisplayName: firstDescData.displayName,
        currentTotalAmount: firstDescData.totalAmount,
        currentPage: 0,
        messageId: session.messageId,
        chatId: session.chatId,
        sessionExpenses: session.sessionExpenses,
      };

      await setSession(telegramUserId, newSession);
      await ctx.telegram.editMessageText(
        session.chatId,
        session.messageId,
        undefined,
        messageText,
        { ...keyboard, parse_mode: "Markdown" }
      );
      return;
    }
  }

  await clearSession(telegramUserId);

  const summaryLines = ["✅ ¡Listo! Categorización completada\n"];

  const grouped: Record<
    string,
    { displayName: string; amount: number }[]
  > = {};

  for (const entry of session.sessionExpenses) {
    if (!grouped[entry.categoryName]) {
      grouped[entry.categoryName] = [];
    }
    grouped[entry.categoryName].push({
      displayName: entry.displayName,
      amount: entry.amount,
    });
  }

  let grandTotal = 0;

  for (const [categoryName, entries] of Object.entries(grouped)) {
    const categoryTotal = entries.reduce((sum, e) => sum + e.amount, 0);
    grandTotal += categoryTotal;

    summaryLines.push(`\n${categoryName.toUpperCase()} ${formatARS(categoryTotal)}`);
    entries.forEach((entry) => {
      summaryLines.push(`  - ${entry.displayName}: ${formatARS(entry.amount)}`);
    });
  }

  summaryLines.push(`\nTotal: ${formatARS(grandTotal)}`);

  await ctx.telegram.editMessageText(
    session.chatId,
    session.messageId,
    undefined,
    summaryLines.join("\n")
  );
}

function emptySessionForPartial(telegramUserId: string): Session {
  return {
    telegramUserId,
    state: "awaiting_amount",
    pendingDescs: [],
    currentDesc: "",
    currentDisplayName: "",
    currentTotalAmount: 0,
    currentPage: 0,
    messageId: 0,
    chatId: 0,
    sessionExpenses: [],
  };
}

function stripLinePrefix(line: string): string {
  return line.replace(/^[\d.\-\s]*/, "").trim();
}

function isBulkMessage(text: string): boolean {
  const nonEmptyLines = text.split("\n")
    .filter((l) => l.trim().length > 0);
  return nonEmptyLines.length >= 2;
}

function parseBulkLines(
  text: string
): { parsed: BulkExpenseEntry[]; failedLines: string[] } {
  const lines = text.split("\n")
    .filter((l) => l.trim().length > 0);
  const parsed: BulkExpenseEntry[] = [];
  const failedLines: string[] = [];

  for (const line of lines) {
    const cleanedLine = stripLinePrefix(line);
    const result = parseExpenseMessage(cleanedLine);
    if (result) {
      parsed.push({
        description: result.description,
        amount: result.amount,
      });
    } else {
      failedLines.push(line.trim());
    }
  }

  return { parsed, failedLines };
}

function buildBulkConfirmText(expenses: BulkExpenseEntry[]): string {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  return `¿Deseas registrar ${expenses.length} gastos` +
    ` por un total de ${formatARS(total)}?`;
}

function buildBulkSummaryText(expenses: BulkExpenseEntry[]): string {
  const lines = [
    `✅ Registrados ${expenses.length} gastos:`,
  ];
  for (const expense of expenses) {
    lines.push(`• ${expense.description} ${formatARS(expense.amount)}`);
  }
  return lines.join("\n");
}

async function handleNewCategoryInput(
  ctx: Context,
  session: Session,
  categoryName: string
): Promise<void> {
  const newCategoryId = categoryName.toLowerCase().replace(/\s+/g, "_");

  const newCategory: Category = {
    id: newCategoryId,
    name: categoryName,
    type: "expense",
  };

  await getDb().collection("categories").doc(newCategoryId).set(newCategory);

  try {
    await ctx.deleteMessage();
  } catch (_e) {
    // ignore if can't delete
  }

  const updatedSession = await assignCategoryToDesc(
    session.telegramUserId,
    session.currentDesc,
    session.currentDisplayName,
    newCategoryId,
    categoryName,
    session
  );

  await advanceOrFinish(ctx, updatedSession);
}

telegramBot.start(async (ctx) => {
  if (!isAuthorizedUser(ctx.from?.id)) return;

  const firstName = ctx.from?.first_name || "Usuario";
  await ctx.reply(
    `Hola ${firstName}! Bienvenido a KakeBot.\n\n` +
    "Envia un mensaje con descripcion y monto para registrar un gasto:\n" +
    "Ej: Panaderia 5000\n" +
    "Ej: Carrefour express 14.819\n\n" +
    "Comandos:\n" +
    "/menu - Ver opciones\n" +
    "/reporte - Resumen del mes actual\n" +
    "/categorizar - Asignar categorías a gastos sin categorizar"
  );
});

telegramBot.command("menu", async (ctx) => {
  if (!isAuthorizedUser(ctx.from?.id)) return;

  await ctx.reply(
    "¿Qué querés hacer?",
    Markup.inlineKeyboard([
      [Markup.button.callback("Reporte", "menu_reporte")],
      [Markup.button.callback("Categorizar gastos", "menu_categorizar")],
    ])
  );
});

telegramBot.action("menu_reporte", async (ctx) => {
  if (!isAuthorizedUser(ctx.from?.id)) {
    await ctx.answerCbQuery();
    return;
  }

  await ctx.answerCbQuery();
  await ctx.deleteMessage();

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
    `*Reporte ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}*\n`
  );

  for (const [categoryId, subcategories] of
    Object.entries(groupedByCategory)) {
    const categoryTotal = Object.values(subcategories)
      .reduce((sum, subcategory) => sum + subcategory.total, 0);
    const categoryLabel = categoryId === "sin_categoria" ?
      "SIN CATEGORIA" :
      categoryId.toUpperCase();

    reportLines.push(`*${categoryLabel}* ${formatARS(categoryTotal)}`);

    for (const subcategory of Object.values(subcategories)) {
      reportLines.push(
        `  • ${subcategory.displayName}  ${formatARS(subcategory.total)}`
      );
    }
    reportLines.push("");
  }

  reportLines.push(`*Gasto total*  ${formatARS(grandTotal)}`);

  await ctx.reply(reportLines.join("\n"), { parse_mode: "Markdown" });
});

telegramBot.action("menu_categorizar", async (ctx) => {
  if (!isAuthorizedUser(ctx.from?.id)) {
    await ctx.answerCbQuery();
    return;
  }

  await ctx.answerCbQuery();
  await ctx.deleteMessage();

  const telegramUserId = ctx.from?.id.toString() || "";

  const uncategorizedSnapshot = await getDb()
    .collection("expenses")
    .where("telegramUserId", "==", telegramUserId)
    .where("categoryId", "==", null)
    .get();

  if (uncategorizedSnapshot.empty) {
    await ctx.reply("No tenés gastos sin categorizar. 🎉");
    return;
  }

  const groupedDescs: Record<
    string,
    { displayName: string; totalAmount: number }
  > = {};

  uncategorizedSnapshot.docs.forEach((doc) => {
    const expenseData = doc.data() as Expense;
    const key = expenseData.normalizedDesc;
    if (!groupedDescs[key]) {
      groupedDescs[key] = {
        displayName: expenseData.description,
        totalAmount: 0,
      };
    }
    groupedDescs[key].totalAmount += expenseData.amount;
  });

  const pendingDescsKeys = Object.keys(groupedDescs);
  const firstDescKey = pendingDescsKeys[0];
  const firstDescData = groupedDescs[firstDescKey];

  const pendingDescsData: PendingDescEntry[] = pendingDescsKeys.slice(1)
    .map((key) => ({
      normalizedDesc: key,
      displayName: groupedDescs[key].displayName,
      totalAmount: groupedDescs[key].totalAmount,
    }));

  const categories = await fetchExpenseCategories();
  const keyboard = buildCategoryKeyboard(categories, 0);
  const total = pendingDescsKeys.length;
  const messageText = buildExpensePromptText(
    firstDescData.displayName,
    firstDescData.totalAmount,
    1,
    total
  );

  const sentMessage = await ctx.reply(messageText, {
    ...keyboard,
    parse_mode: "Markdown",
  });

  const newSession: Session = {
    telegramUserId,
    state: "categorizing",
    pendingDescs: pendingDescsData,
    currentDesc: firstDescKey,
    currentDisplayName: firstDescData.displayName,
    currentTotalAmount: firstDescData.totalAmount,
    currentPage: 0,
    messageId: sentMessage.message_id,
    chatId: ctx.chat?.id || 0,
    sessionExpenses: [],
  };

  await setSession(telegramUserId, newSession);
});

telegramBot.command("reporte", async (ctx) => {
  if (!isAuthorizedUser(ctx.from?.id)) return;

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
    `*Reporte ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}*\n`
  );

  for (const [categoryId, subcategories] of
    Object.entries(groupedByCategory)) {
    const categoryTotal = Object.values(subcategories)
      .reduce((sum, subcategory) => sum + subcategory.total, 0);
    const categoryLabel = categoryId === "sin_categoria" ?
      "SIN CATEGORIA" :
      categoryId.toUpperCase();

    reportLines.push(`*${categoryLabel}* ${formatARS(categoryTotal)}`);

    for (const subcategory of Object.values(subcategories)) {
      reportLines.push(
        `  • ${subcategory.displayName}  ${formatARS(subcategory.total)}`
      );
    }
    reportLines.push("");
  }

  reportLines.push(`*Gasto total*  ${formatARS(grandTotal)}`);

  await ctx.reply(reportLines.join("\n"), { parse_mode: "Markdown" });
});

telegramBot.command("categorizar", async (ctx) => {
  if (!isAuthorizedUser(ctx.from?.id)) return;

  const telegramUserId = ctx.from?.id.toString() || "";

  const uncategorizedSnapshot = await getDb()
    .collection("expenses")
    .where("telegramUserId", "==", telegramUserId)
    .where("categoryId", "==", null)
    .get();

  if (uncategorizedSnapshot.empty) {
    await ctx.reply("No tenés gastos sin categorizar. 🎉");
    return;
  }

  const groupedDescs: Record<
    string,
    { displayName: string; totalAmount: number }
  > = {};

  uncategorizedSnapshot.docs.forEach((doc) => {
    const expenseData = doc.data() as Expense;
    const key = expenseData.normalizedDesc;
    if (!groupedDescs[key]) {
      groupedDescs[key] = {
        displayName: expenseData.description,
        totalAmount: 0,
      };
    }
    groupedDescs[key].totalAmount += expenseData.amount;
  });

  const pendingDescsKeys = Object.keys(groupedDescs);
  const firstDescKey = pendingDescsKeys[0];
  const firstDescData = groupedDescs[firstDescKey];

  const pendingDescsData: PendingDescEntry[] = pendingDescsKeys.slice(1)
    .map((key) => ({
      normalizedDesc: key,
      displayName: groupedDescs[key].displayName,
      totalAmount: groupedDescs[key].totalAmount,
    }));

  const categories = await fetchExpenseCategories();
  const keyboard = buildCategoryKeyboard(categories, 0);
  const total = pendingDescsKeys.length;
  const messageText = buildExpensePromptText(
    firstDescData.displayName,
    firstDescData.totalAmount,
    1,
    total
  );

  const sentMessage = await ctx.reply(messageText, {
    ...keyboard,
    parse_mode: "Markdown",
  });

  const newSession: Session = {
    telegramUserId,
    state: "categorizing",
    pendingDescs: pendingDescsData,
    currentDesc: firstDescKey,
    currentDisplayName: firstDescData.displayName,
    currentTotalAmount: firstDescData.totalAmount,
    currentPage: 0,
    messageId: sentMessage.message_id,
    chatId: ctx.chat?.id || 0,
    sessionExpenses: [],
  };

  await setSession(telegramUserId, newSession);
});

telegramBot.action(/^cat_sel:(.+)$/, async (ctx) => {
  if (!isAuthorizedUser(ctx.from?.id)) {
    await ctx.answerCbQuery();
    return;
  }

  await ctx.answerCbQuery();

  const categoryId = ctx.match[1];
  const telegramUserId = ctx.from?.id.toString() || "";

  const session = await getSession(telegramUserId);
  if (!session) {
    await ctx.editMessageText(
      "Esta sesión ya no está activa. Usá /categorizar para empezar."
    );
    return;
  }

  const categoryDoc = await getDb()
    .collection("categories")
    .doc(categoryId)
    .get();
  const categoryName = categoryDoc.exists ?
    (categoryDoc.data()?.name as string) :
    categoryId;

  const updatedSession = await assignCategoryToDesc(
    telegramUserId,
    session.currentDesc,
    session.currentDisplayName,
    categoryId,
    categoryName,
    session
  );

  await advanceOrFinish(ctx, updatedSession);
});

telegramBot.action(/^cat_pg:(\d+)$/, async (ctx) => {
  if (!isAuthorizedUser(ctx.from?.id)) {
    await ctx.answerCbQuery();
    return;
  }

  await ctx.answerCbQuery();

  const page = parseInt(ctx.match[1], 10);
  const telegramUserId = ctx.from?.id.toString() || "";

  const session = await getSession(telegramUserId);
  if (!session) {
    await ctx.editMessageText(
      "Esta sesión ya no está activa. Usá /categorizar para empezar."
    );
    return;
  }

  const categories = await fetchExpenseCategories();
  const keyboard = buildCategoryKeyboard(categories, page);

  await setSession(telegramUserId, { ...session, currentPage: page });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ctx.editMessageReplyMarkup(keyboard.reply_markup as any);
});

telegramBot.action("cat_new", async (ctx) => {
  if (!isAuthorizedUser(ctx.from?.id)) {
    await ctx.answerCbQuery();
    return;
  }

  await ctx.answerCbQuery();

  const telegramUserId = ctx.from?.id.toString() || "";
  const session = await getSession(telegramUserId);

  if (!session) {
    await ctx.editMessageText(
      "Esta sesión ya no está activa. Usá /categorizar para empezar."
    );
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "awaiting_new_category_name",
  });

  await ctx.editMessageText(
    `Nueva categoría para "${session.currentDisplayName}":\n\n` +
    "Escribí el nombre de la nueva categoría.",
    Markup.inlineKeyboard([[Markup.button.callback("Cancelar", "cat_cancel")]])
  );
});


telegramBot.action("cat_cancel", async (ctx) => {
  if (!isAuthorizedUser(ctx.from?.id)) {
    await ctx.answerCbQuery();
    return;
  }

  await ctx.answerCbQuery();

  const telegramUserId = ctx.from?.id.toString() || "";
  await clearSession(telegramUserId);

  await ctx.editMessageText(
    "Categorización cancelada. Los gastos sin categorizar quedan para después."
  );
});

telegramBot.action("bulk_confirm", async (ctx) => {
  if (!isAuthorizedUser(ctx.from?.id)) {
    await ctx.answerCbQuery();
    return;
  }

  await ctx.answerCbQuery();

  const telegramUserId = ctx.from?.id.toString() || "";
  const session = await getSession(telegramUserId);

  if (!session || session.state !== "bulk_pending" || !session.bulkExpenses) {
    await ctx.editMessageText("La sesión expiró. Enviá los gastos de nuevo.");
    return;
  }

  const mappingsSnapshot = await getDb()
    .collection("subcategory_mappings")
    .where("telegramUserId", "==", telegramUserId)
    .get();

  const categoryByDesc = new Map<string, string>();
  for (const doc of mappingsSnapshot.docs) {
    const mapping = doc.data();
    categoryByDesc.set(mapping.normalizedDesc, mapping.categoryId);
  }

  const batch = getDb().batch();
  const expensesRef = getDb().collection("expenses");
  const now = admin.firestore.Timestamp.now();

  for (const entry of session.bulkExpenses) {
    const normalizedDesc = entry.description.toLowerCase().trim();
    const categoryId = categoryByDesc.get(normalizedDesc) || null;

    batch.set(expensesRef.doc(), {
      telegramUserId,
      description: entry.description,
      normalizedDesc,
      amount: entry.amount,
      categoryId,
      date: now,
      createdAt: now,
    });
  }

  await batch.commit();
  await clearSession(telegramUserId);
  await ctx.editMessageText(buildBulkSummaryText(session.bulkExpenses));
});

telegramBot.action("bulk_cancel", async (ctx) => {
  if (!isAuthorizedUser(ctx.from?.id)) {
    await ctx.answerCbQuery();
    return;
  }

  await ctx.answerCbQuery();

  const telegramUserId = ctx.from?.id.toString() || "";
  await clearSession(telegramUserId);
  await ctx.editMessageText("Carga masiva cancelada.");
});

telegramBot.action(/^confirm:(.+):(.+)$/, async (ctx) => {
  if (!isAuthorizedUser(ctx.from?.id)) {
    await ctx.answerCbQuery();
    return;
  }

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
  if (!isAuthorizedUser(ctx.from?.id)) {
    await ctx.answerCbQuery();
    return;
  }

  await ctx.answerCbQuery();
  await ctx.editMessageText("Gasto anulado.");
});

telegramBot.on("text", async (ctx) => {
  if (!isAuthorizedUser(ctx.from?.id)) return;

  const messageText = ctx.message.text;
  const telegramUserId = ctx.from?.id.toString() || "";

  if (messageText.startsWith("/")) return;

  const session = await getSession(telegramUserId);

  if (session?.state === "awaiting_new_category_name") {
    await handleNewCategoryInput(ctx, session, messageText.trim());
    return;
  }

  if (session?.state === "awaiting_amount") {
    const amount = parseArgentineAmount(messageText.trim());
    if (amount !== null && amount > 0) {
      await clearSession(telegramUserId);
      const description = session.partialDescription || "";
      await ctx.reply(
        `Registrar gasto?\n${description} ${formatARS(amount)}`,
        Markup.inlineKeyboard([
          Markup.button.callback("Cancelar", "cancel"),
          Markup.button.callback(
            "Confirmar",
            `confirm:${description}:${amount}`
          ),
        ])
      );
    } else {
      await ctx.reply(
        "No entendí el monto. Ingresá solo el número:\n" +
        "Ej: 5000 o 14.819,50"
      );
    }
    return;
  }

  if (session?.state === "awaiting_description") {
    await clearSession(telegramUserId);
    const amount = session.partialAmount || 0;
    const description = messageText.trim();
    await ctx.reply(
      `Registrar gasto?\n${description} ${formatARS(amount)}`,
      Markup.inlineKeyboard([
        Markup.button.callback("Cancelar", "cancel"),
        Markup.button.callback(
          "Confirmar",
          `confirm:${description}:${amount}`
        ),
      ])
    );
    return;
  }

  if (session?.state === "categorizing") {
    const lowerText = messageText.trim().toLowerCase();

    if (lowerText === "cancelar") {
      await clearSession(telegramUserId);
      await ctx.reply("Categorización cancelada.");
      return;
    }

    if (lowerText === "omitir") {
      const nextPendingDescs = session.pendingDescs.slice(1);
      const nextDesc = nextPendingDescs.length > 0 ?
        nextPendingDescs[0].normalizedDesc :
        "";
      const nextDisplayName = nextPendingDescs.length > 0 ?
        nextPendingDescs[0].displayName :
        "";
      const nextTotalAmount = nextPendingDescs.length > 0 ?
        nextPendingDescs[0].totalAmount :
        0;

      const updatedSession: Session = {
        ...session,
        pendingDescs: nextPendingDescs,
        currentDesc: nextDesc,
        currentDisplayName: nextDisplayName,
        currentTotalAmount: nextTotalAmount,
        currentPage: 0,
      };

      await setSession(telegramUserId, updatedSession);
      await advanceOrFinish(ctx, updatedSession);
      return;
    }

    await ctx.reply(
      "Tenés una sesión de categorización activa." +
      " Elegí una categoría, o enviá \"omitir\" o \"cancelar\"."
    );
    return;
  }

  if (isBulkMessage(messageText)) {
    const nonEmptyLines = messageText.split("\n")
      .filter((l) => l.trim().length > 0);

    if (nonEmptyLines.length > MAX_BULK_LINES) {
      await ctx.reply(
        `El mensaje tiene ${nonEmptyLines.length} líneas.` +
        ` El máximo es ${MAX_BULK_LINES}.`
      );
      return;
    }

    const { parsed, failedLines } = parseBulkLines(messageText);

    if (failedLines.length > 0) {
      const errorLines = failedLines
        .map((line) => `• ${line}`);
      await ctx.reply(
        `No pude interpretar ${failedLines.length} línea(s):\n\n` +
        errorLines.join("\n") +
        "\n\nRevisá el formato: descripcion monto"
      );
      return;
    }

    await setSession(telegramUserId, {
      ...emptySessionForPartial(telegramUserId),
      state: "bulk_pending",
      bulkExpenses: parsed,
    });

    await ctx.reply(
      buildBulkConfirmText(parsed),
      Markup.inlineKeyboard([
        Markup.button.callback("Cancelar", "bulk_cancel"),
        Markup.button.callback("Confirmar", "bulk_confirm"),
      ])
    );
    return;
  }

  const expense = parseExpenseMessage(messageText);

  if (expense) {
    await ctx.reply(
      `Registrar gasto?\n${expense.description} ${formatARS(expense.amount)}`,
      Markup.inlineKeyboard([
        Markup.button.callback("Cancelar", "cancel"),
        Markup.button.callback(
          "Confirmar",
          `confirm:${expense.description}:${expense.amount}`
        ),
      ])
    );
    return;
  }

  const trimmed = messageText.trim();

  const isJustAmount = /^[\d.,]+$/.test(trimmed);
  if (isJustAmount) {
    const amount = parseArgentineAmount(trimmed);
    if (amount !== null && amount > 0) {
      await setSession(telegramUserId, {
        ...emptySessionForPartial(telegramUserId),
        state: "awaiting_description",
        partialAmount: amount,
      });
      await ctx.reply(`¿En qué gastaste ${formatARS(amount)}?`);
      return;
    }
  }

  const isJustText = !/\d/.test(trimmed);
  if (isJustText) {
    await setSession(telegramUserId, {
      ...emptySessionForPartial(telegramUserId),
      state: "awaiting_amount",
      partialDescription: trimmed,
    });
    await ctx.reply(`¿Cuánto gastaste en ${trimmed}?`);
    return;
  }

  await ctx.reply(
    "No pude interpretar el mensaje.\n" +
    "Formato: <descripcion> <monto>\n" +
    "Ej: Panaderia 5000"
  );
});

telegramBot.catch((err: unknown) => {
  console.error("Bot error:", err);
});
