import * as admin from "firebase-admin";
import { Context } from "telegraf";
import { Category, PendingDescEntry, SessionExpenseEntry } from "../types/index";
import { CategorizeWizardState } from "../types/telegraf-context.types";
import { Expense } from "../types/expense.types";
import { AssignCategoryParams } from "../types/category.types";
import { getDb } from "./db";
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

/**
 * Assigns a category to all expenses with a normalized description.
 * Mutates wizardState in-place to advance to the next pending description.
 */
export async function assignCategoryToDesc({
  telegramUserId,
  normalizedDesc,
  displayName,
  categoryId,
  categoryName,
  wizardState,
}: AssignCategoryParams): Promise<void> {
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

  const mappingId = `${telegramUserId}_${normalizedDesc.replace(/ /g, "_")}`;
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

  const nextPendingDescs = wizardState.pendingDescs.slice(1);
  wizardState.pendingDescs = nextPendingDescs;
  wizardState.currentDesc = nextPendingDescs.length > 0 ? nextPendingDescs[0].normalizedDesc : "";
  wizardState.currentDisplayName = nextPendingDescs.length > 0 ? nextPendingDescs[0].displayName : "";
  wizardState.currentTotalAmount = nextPendingDescs.length > 0 ? nextPendingDescs[0].totalAmount : 0;
  wizardState.currentPage = 0;
  wizardState.sessionExpenses = [...wizardState.sessionExpenses, newEntry];
}

/**
 * Advances to the next expense or finishes if none remain.
 * Returns "continue" if the flow continues, "done" if finished.
 *
 * @param {Context} ctx - Telegraf context.
 * @param {CategorizeWizardState} wizardState - Current wizard state (mutated in-place on continue).
 * @return {Promise<"continue" | "done">} Flow status.
 */
export async function advanceOrFinish(
  ctx: Context,
  wizardState: CategorizeWizardState
): Promise<"continue" | "done"> {
  if (wizardState.pendingDescs.length === 0) {
    return finishCategorizingFlow(ctx, wizardState);
  }

  const categories = await fetchExpenseCategories();
  const keyboard = buildCategoryKeyboard(categories, 0);
  const total = wizardState.sessionExpenses.length + wizardState.pendingDescs.length + 1;
  const current = wizardState.sessionExpenses.length + 1;

  const messageText = buildExpensePromptText({
    displayName: wizardState.currentDisplayName,
    totalAmount: wizardState.currentTotalAmount,
    current,
    total,
  });

  await ctx.telegram.editMessageText(
    wizardState.chatId,
    wizardState.messageId,
    undefined,
    messageText,
    { ...keyboard, parse_mode: "Markdown" }
  );

  return "continue";
}

/**
 * Checks for a new batch of uncategorized expenses; shows the summary if done.
 * Mutates wizardState with the new batch when continuing.
 *
 * @param {Context} ctx - Telegraf context.
 * @param {CategorizeWizardState} wizardState - Current wizard state.
 * @return {Promise<"continue" | "done">} Flow status.
 */
async function finishCategorizingFlow(
  ctx: Context,
  wizardState: CategorizeWizardState
): Promise<"continue" | "done"> {
  const telegramUserId = ctx.from?.id.toString() ?? "";

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

    const alreadyProcessed = new Set(wizardState.sessionExpenses.map((e) => e.desc));
    const pendingDescsKeys = Object.keys(groupedDescs).filter((key) => !alreadyProcessed.has(key));
    if (pendingDescsKeys.length > 0) {
      const firstDescKey = pendingDescsKeys[0];
      const firstDescData = groupedDescs[firstDescKey];

      const pendingDescsData: PendingDescEntry[] = pendingDescsKeys.slice(1)
        .map((key) => ({
          normalizedDesc: key,
          displayName: groupedDescs[key].displayName,
          totalAmount: groupedDescs[key].totalAmount,
        }));

      wizardState.pendingDescs = pendingDescsData;
      wizardState.currentDesc = firstDescKey;
      wizardState.currentDisplayName = firstDescData.displayName;
      wizardState.currentTotalAmount = firstDescData.totalAmount;
      wizardState.currentPage = 0;

      const categories = await fetchExpenseCategories();
      const keyboard = buildCategoryKeyboard(categories, 0);
      const total = pendingDescsKeys.length;
      const messageText = buildExpensePromptText({
        displayName: firstDescData.displayName,
        totalAmount: firstDescData.totalAmount,
        current: 1,
        total,
      });

      await ctx.telegram.editMessageText(
        wizardState.chatId,
        wizardState.messageId,
        undefined,
        messageText,
        { ...keyboard, parse_mode: "Markdown" }
      );

      return "continue";
    }
  }

  const summaryLines = ["✅ ¡Listo! Categorización completada\n"];

  const grouped: Record<
    string,
    { displayName: string; amount: number }[]
  > = {};

  for (const entry of wizardState.sessionExpenses.filter((e) => e.categoryName !== "")) {
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
    wizardState.chatId,
    wizardState.messageId,
    undefined,
    summaryLines.join("\n")
  );

  return "done";
}

/**
 * Creates a new category, assigns it to the current expense description, and advances.
 * Returns "continue" if more items remain, "done" if categorization is complete.
 *
 * @param {Context} ctx - Telegraf context.
 * @param {CategorizeWizardState} wizardState - Current wizard state (mutated in-place).
 * @param {string} categoryName - Name for the new category.
 * @return {Promise<"continue" | "done">} Flow status.
 */
export async function handleNewCategoryInput(
  ctx: Context,
  wizardState: CategorizeWizardState,
  categoryName: string
): Promise<"continue" | "done"> {
  const telegramUserId = ctx.from?.id.toString() ?? "";
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

  await assignCategoryToDesc({
    telegramUserId,
    normalizedDesc: wizardState.currentDesc,
    displayName: wizardState.currentDisplayName,
    categoryId: newCategoryId,
    categoryName,
    wizardState,
  });

  return advanceOrFinish(ctx, wizardState);
}
