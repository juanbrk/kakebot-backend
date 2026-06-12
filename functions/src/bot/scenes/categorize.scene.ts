import { Scenes, Markup } from "telegraf";
import { KakebotContext, CategorizeWizardState } from "../../types/telegraf-context.types";
import { PendingDescEntry } from "../../types/index";
import { Expense } from "../../types/expense.types";
import { getDb } from "../../services/db";
import {
  fetchExpenseCategories,
  assignCategoryToDesc,
  advanceOrFinish,
  handleNewCategoryInput,
} from "../../services/category.service";
import {
  buildCategoryKeyboard,
  buildExpensePromptText,
} from "../keyboards/category";
import { getMessageText } from "../../helpers/wizard";
import { formatARS } from "../../helpers/format";
import { log } from "../../helpers/logger";

export const CATEGORIZE_SCENE_ID = "categorize-wizard";

const CANCEL_REGEX = /^\s*(salir|cancelar|terminar|stop)\s*$/i;
const GUARD_STEP = 1;
const NEW_CATEGORY_STEP = 2;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Loads uncategorized expenses grouped by normalizedDesc.
 * Returns null if none exist.
 *
 * @param {string} telegramUserId - Telegram user ID.
 * @return {Promise<object|null>} Grouped expense data keyed by normalizedDesc, or null.
 */
async function loadUncategorizedGroups(
  telegramUserId: string,
): Promise<Record<string, { displayName: string; totalAmount: number }> | null> {
  const snapshot = await getDb()
    .collection("expenses")
    .where("telegramUserId", "==", telegramUserId)
    .where("categoryId", "==", null)
    .get();

  if (snapshot.empty) return null;

  const groupedDescs: Record<string, { displayName: string; totalAmount: number }> = {};
  snapshot.docs.forEach((doc) => {
    const expenseData = doc.data() as Expense;
    const key = expenseData.normalizedDesc;
    if (!groupedDescs[key]) {
      groupedDescs[key] = { displayName: expenseData.description, totalAmount: 0 };
    }
    groupedDescs[key].totalAmount += expenseData.amount;
  });

  return groupedDescs;
}

// ─── Steps ───────────────────────────────────────────────────────────────────

/**
 * Step 0: Loads uncategorized expenses, sends the category picker, advances to step 1.
 *
 * @param {KakebotContext} ctx - Telegraf context.
 */
async function stepInit(ctx: KakebotContext): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() ?? "";

  let groupedDescs: Record<string, { displayName: string; totalAmount: number }> | null = null;
  try {
    groupedDescs = await loadUncategorizedGroups(telegramUserId);
  } catch (error) {
    log.error("Error loading uncategorized expenses", error, {
      module: "categorize.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al cargar los gastos. Intentá de nuevo.");
    await ctx.scene.leave();
    return;
  }

  if (!groupedDescs) {
    await ctx.reply("No tenés gastos sin categorizar.");
    await ctx.scene.leave();
    return;
  }

  const pendingDescsKeys = Object.keys(groupedDescs);
  const firstDescKey = pendingDescsKeys[0];
  const firstDescData = groupedDescs[firstDescKey];

  const pendingDescsData: PendingDescEntry[] = pendingDescsKeys
    .slice(1)
    .map((key) => ({
      normalizedDesc: key,
      displayName: groupedDescs![key].displayName,
      totalAmount: groupedDescs![key].totalAmount,
    }));

  const [categories] = await Promise.all([fetchExpenseCategories()]);
  const keyboard = buildCategoryKeyboard(categories, 0);
  const total = pendingDescsKeys.length;
  const messageText = buildExpensePromptText({
    displayName: firstDescData.displayName,
    totalAmount: firstDescData.totalAmount,
    current: 1,
    total,
  });

  const sentMessage = await ctx.reply(messageText, {
    ...keyboard,
    parse_mode: "Markdown",
  });

  const state = ctx.wizard.state as CategorizeWizardState;
  state.pendingDescs = pendingDescsData;
  state.currentDesc = firstDescKey;
  state.currentDisplayName = firstDescData.displayName;
  state.currentTotalAmount = firstDescData.totalAmount;
  state.currentPage = 0;
  state.messageId = sentMessage.message_id;
  state.chatId = ctx.chat?.id || 0;
  state.sessionExpenses = [];

  ctx.wizard.next();
}

/**
 * Step 1: Guard — receives text while waiting for category selection.
 * Handles "omitir" to skip the current desc; nudges on any other text.
 *
 * @param {KakebotContext} ctx - Telegraf context.
 */
async function stepGuardCategorizing(ctx: KakebotContext): Promise<void> {
  const messageText = getMessageText(ctx);

  if (!messageText) return;

  if (messageText.toLowerCase() === "omitir") {
    await skipCurrentItem(ctx);
    return;
  }

  await ctx.reply(
    "Tenés una sesión de categorización activa. Elegí una categoría del teclado, o escribí \"cancelar\" para salir.",
  );
}

/**
 * Step 2: Handles the new category name input after the user pressed "Agregar categoría".
 *
 * @param {KakebotContext} ctx - Telegraf context.
 */
async function stepHandleNewCategoryName(ctx: KakebotContext): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() ?? "";
  const categoryName = getMessageText(ctx)?.trim();

  if (!categoryName) {
    await ctx.reply("El nombre no puede estar vacío. Escribí el nombre de la nueva categoría.");
    return;
  }

  const state = ctx.wizard.state as CategorizeWizardState;
  const categorizedDisplayName = state.currentDisplayName;
  const categorizedAmount = state.currentTotalAmount;

  let result: "continue" | "done";
  try {
    result = await handleNewCategoryInput(ctx, state, categoryName);
  } catch (error) {
    log.error("Error creating new category", error, {
      module: "categorize.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al crear la categoría. Intentá de nuevo.");
    return;
  }

  await ctx.reply(
    `✅ Agregaste *${categorizedDisplayName}* ${formatARS(categorizedAmount)} a *${categoryName}*.`,
    { parse_mode: "Markdown" },
  );

  if (result === "done") {
    await ctx.scene.leave();
  } else {
    ctx.wizard.selectStep(GUARD_STEP);
  }
}

// ─── Action handlers ─────────────────────────────────────────────────────────

/**
 * Assigns the selected category to the current expense description.
 *
 * @param {KakebotContext} ctx - Telegraf context.
 */
async function handleCatSel(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();

  const telegramUserId = ctx.from?.id.toString() ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const categoryId = ((ctx as any).match as string[])[1];

  const state = ctx.wizard.state as CategorizeWizardState;

  const categoryDoc = await getDb().collection("categories").doc(categoryId).get();
  const categoryName = categoryDoc.exists
    ? (categoryDoc.data()?.name as string)
    : categoryId;

  try {
    await assignCategoryToDesc({
      telegramUserId,
      normalizedDesc: state.currentDesc,
      displayName: state.currentDisplayName,
      categoryId,
      categoryName,
      wizardState: state,
    });
  } catch (error) {
    log.error("Error assigning category", error, {
      module: "categorize.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al asignar la categoría. Intentá de nuevo.");
    return;
  }

  const result = await advanceOrFinish(ctx, state);
  if (result === "done") {
    await ctx.scene.leave();
  } else {
    ctx.wizard.selectStep(GUARD_STEP);
  }
}

/**
 * Changes the page of the category keyboard.
 *
 * @param {KakebotContext} ctx - Telegraf context.
 */
async function handleCatPg(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = parseInt(((ctx as any).match as string[])[1], 10);

  const state = ctx.wizard.state as CategorizeWizardState;
  state.currentPage = page;

  const categories = await fetchExpenseCategories();
  const keyboard = buildCategoryKeyboard(categories, page);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ctx.editMessageReplyMarkup(keyboard.reply_markup as any);
}

/**
 * Prompts for a new category name and jumps to step 2.
 *
 * @param {KakebotContext} ctx - Telegraf context.
 */
async function handleCatNew(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();

  const state = ctx.wizard.state as CategorizeWizardState;

  const promptKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback("← Volver al listado", "cat_back_to_list")],
  ]);
  await ctx.editMessageText(
    `*Nueva categoría para "${state.currentDisplayName}"*:\n\n` +
    "Escribí el nombre de la nueva categoría.\n" +
    "_Escribí \"cancelar\" para salir._",
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: promptKeyboard.reply_markup as any,
    },
  );

  ctx.wizard.selectStep(NEW_CATEGORY_STEP);
}

/**
 * Cancels the categorization flow.
 *
 * @param {KakebotContext} ctx - Telegraf context.
 */
async function handleCatCancel(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await ctx.reply("Categorización cancelada. Los gastos sin categorizar quedan para después.");
  await ctx.scene.leave();
}

/**
 * Shared skip logic: advances past the current desc without categorizing it.
 * Adds a blank-category entry to sessionExpenses so the counter stays consistent.
 *
 * @param {KakebotContext} ctx - Telegraf context.
 */
async function skipCurrentItem(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as CategorizeWizardState;

  const nextPendingDescs = state.pendingDescs.slice(1);
  state.sessionExpenses = [
    ...state.sessionExpenses,
    {
      desc: state.currentDesc,
      displayName: state.currentDisplayName,
      amount: state.currentTotalAmount,
      categoryName: "",
    },
  ];
  state.pendingDescs = nextPendingDescs;
  state.currentDesc = nextPendingDescs.length > 0 ? nextPendingDescs[0].normalizedDesc : "";
  state.currentDisplayName = nextPendingDescs.length > 0 ? nextPendingDescs[0].displayName : "";
  state.currentTotalAmount = nextPendingDescs.length > 0 ? nextPendingDescs[0].totalAmount : 0;
  state.currentPage = 0;

  const result = await advanceOrFinish(ctx, state);
  if (result === "done") {
    await ctx.scene.leave();
  } else {
    ctx.wizard.selectStep(GUARD_STEP);
  }
}

/**
 * Skips the current expense description without assigning a category.
 *
 * @param {KakebotContext} ctx - Telegraf context.
 */
async function handleCatSkip(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await skipCurrentItem(ctx);
}

/**
 * Returns from the "Nueva categoría" prompt back to the category picker.
 *
 * @param {KakebotContext} ctx - Telegraf context.
 */
async function handleCatBackToList(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();

  const state = ctx.wizard.state as CategorizeWizardState;

  const categories = await fetchExpenseCategories();
  const keyboard = buildCategoryKeyboard(categories, state.currentPage ?? 0);
  const total = state.pendingDescs.length + state.sessionExpenses.length + 1;
  const current = state.sessionExpenses.length + 1;
  const messageText = buildExpensePromptText({
    displayName: state.currentDisplayName,
    totalAmount: state.currentTotalAmount,
    current,
    total,
  });

  await ctx.editMessageText(messageText, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });

  ctx.wizard.selectStep(GUARD_STEP);
}

// ─── repromptCurrentStep ─────────────────────────────────────────────────────

/**
 * Re-presents the current step prompt when an unexpected file is received.
 *
 * @param {KakebotContext} ctx - Telegraf context.
 */
async function repromptCurrentStep(ctx: KakebotContext): Promise<void> {
  await ctx.reply("No esperaba un archivo aquí.");

  switch (ctx.wizard.cursor) {
  case 1:
    await ctx.reply(
      "Tenés una sesión de categorización activa. Elegí una categoría del teclado, o escribí \"cancelar\" para salir.",
    );
    break;
  case 2: {
    const state = ctx.wizard.state as CategorizeWizardState;
    await ctx.reply(
      `*Nueva categoría para "${state.currentDisplayName}"*:\n\n` +
      "Escribí el nombre de la nueva categoría.",
      { parse_mode: "Markdown" },
    );
    break;
  }
  default:
    break;
  }
}

// ─── handleCancelWord ─────────────────────────────────────────────────────────

/**
 * Handles the cancel word ("cancelar", "salir", etc.) from any step.
 *
 * @param {KakebotContext} ctx - Telegraf context.
 */
async function handleCancelWord(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Categorización cancelada. Los gastos sin categorizar quedan para después.");
  await ctx.scene.leave();
}

// ─── Export ───────────────────────────────────────────────────────────────────

export const categorizeScene = new Scenes.WizardScene<KakebotContext>(
  CATEGORIZE_SCENE_ID,
  stepInit,
  stepGuardCategorizing,
  stepHandleNewCategoryName,
);

categorizeScene.hears(CANCEL_REGEX, handleCancelWord);
categorizeScene.action(/^cat_sel:(.+)$/, handleCatSel);
categorizeScene.action(/^cat_pg:(\d+)$/, handleCatPg);
categorizeScene.action("cat_new", handleCatNew);
categorizeScene.action("cat_skip", handleCatSkip);
categorizeScene.action("cat_back_to_list", handleCatBackToList);
categorizeScene.action("cat_cancel", handleCatCancel);
categorizeScene.on("photo", repromptCurrentStep);
categorizeScene.on("document", repromptCurrentStep);
