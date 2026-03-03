import * as admin from "firebase-admin";
import { Context } from "telegraf";
import {
  Category, Expense, Session, PendingDescEntry, SessionExpenseEntry,
} from "../types/index";
import { getDb } from "./db";
import { setSession, clearSession } from "./session.service";
import { formatARS } from "../helpers/format";
import {
  buildCategoryKeyboard, buildExpensePromptText,
} from "../bot/keyboards/category";

export async function fetchExpenseCategories(): Promise<Category[]> {
  const snapshot = await getDb()
    .collection("categories")
    .where("type", "in", ["expense", "both"])
    .get();

  const categories = snapshot.docs
    .map((doc) => doc.data() as Category)
    .sort((a, b) => a.name.localeCompare(b.name));

  return categories;
}

export async function assignCategoryToDesc(
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

export async function advanceOrFinish(
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

    summaryLines.push(
      `\n${categoryName.toUpperCase()} ${formatARS(categoryTotal)}`
    );
    entries.forEach((entry) => {
      summaryLines.push(
        `  - ${entry.displayName}: ${formatARS(entry.amount)}`
      );
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

export async function handleNewCategoryInput(
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
