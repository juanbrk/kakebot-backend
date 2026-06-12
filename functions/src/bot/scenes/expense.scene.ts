import { Scenes, Markup } from "telegraf";
import { KakebotContext, ExpenseWizardState } from "../../types/telegraf-context.types";
import { saveExpense } from "../../services/expense.service";
import { parseArgentineAmount, parseExpenseMessage } from "../../helpers/parse-amount";
import { formatARS, buildBackdatedTimestamp, MONTH_NAMES } from "../../helpers/format";
import { getMessageText } from "../../helpers/wizard";
import { log } from "../../helpers/logger";

export const EXPENSE_SCENE_ID = "expense-wizard";

const CANCEL_REGEX = /^\s*(salir|cancelar|terminar|stop)\s*$/i;
const CONFIRM_GUARD_STEP = 2;

/**
 * Builds the confirmation text for a pending expense.
 * Includes the target month label when registering retroactively.
 *
 * @param {string} description - Expense description
 * @param {number} amount - Expense amount
 * @param {string} [reportMonth] - YYYY-MM string for retroactive registration
 * @return {string} Formatted confirmation text
 */
function buildExpenseConfirmText(description: string, amount: number, reportMonth?: string): string {
  if (reportMonth) {
    const [year, month] = reportMonth.split("-");
    const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
    return `Registrar gasto en ${monthLabel}?\n${description}  ${formatARS(amount)}`;
  }
  return `Registrar gasto?\n${description}  ${formatARS(amount)}`;
}

/**
 * Builds the confirm/cancel keyboard for expense registration.
 *
 * @return {object} Telegraf inline keyboard markup
 */
function buildExpenseConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Cancelar", "expense_cancel"),
      Markup.button.callback("Confirmar", "expense_confirm"),
    ],
  ]);
}

/**
 * Step 0: routes the scene based on entry args.
 * Handles four entry paths: full expense, partial description, partial amount, retroactive.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepInit(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as ExpenseWizardState;

  if (state.description && state.amount) {
    await ctx.reply(
      buildExpenseConfirmText(state.description, state.amount, state.reportMonth),
      buildExpenseConfirmKeyboard(),
    );
    ctx.wizard.selectStep(CONFIRM_GUARD_STEP);
    return;
  }

  if (state.description) {
    await ctx.reply(
      `*¿Cuánto gastaste en ${state.description}?*\n_Escribí cancelar para salir._`,
      { parse_mode: "Markdown" },
    );
    ctx.wizard.next();
    return;
  }

  if (state.amount) {
    await ctx.reply(
      `*¿En qué gastaste ${formatARS(state.amount)}?*\n_Escribí cancelar para salir._`,
      { parse_mode: "Markdown" },
    );
    ctx.wizard.next();
    return;
  }

  await ctx.reply(
    "*Ingresá descripción y monto en un solo mensaje.*\n_Ej: Panaderia 5000_\n_Escribí cancelar para salir._",
    { parse_mode: "Markdown" },
  );
  ctx.wizard.next();
}

/**
 * Step 1: processes text input for the missing piece (amount, description, or combined).
 * Inspects the current state to determine what the user is expected to provide.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepHandleInput(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as ExpenseWizardState;
  const messageText = getMessageText(ctx);

  if (!messageText) {
    await ctx.reply("Enviá un mensaje de texto.");
    return;
  }

  if (state.description && !state.amount) {
    const amount = parseArgentineAmount(messageText);
    const isValidAmount = amount !== null && amount > 0;
    if (!isValidAmount) {
      await ctx.reply(
        "No entendí el monto. Ingresá solo el número:\nEj: 5000 o 14.819,50",
      );
      return;
    }
    state.amount = amount;
    await ctx.reply(
      buildExpenseConfirmText(state.description, state.amount, state.reportMonth),
      buildExpenseConfirmKeyboard(),
    );
    ctx.wizard.next();
    return;
  }

  if (state.amount && !state.description) {
    const description = messageText.trim();
    const isEmptyDescription = description.length === 0;
    if (isEmptyDescription) {
      await ctx.reply("La descripción no puede estar vacía.");
      return;
    }
    state.description = description;
    await ctx.reply(
      buildExpenseConfirmText(state.description, state.amount, state.reportMonth),
      buildExpenseConfirmKeyboard(),
    );
    ctx.wizard.next();
    return;
  }

  const expense = parseExpenseMessage(messageText);
  if (!expense) {
    await ctx.reply(
      "No pude interpretar el mensaje. Necesito descripción y monto juntos.\nEj: Panaderia 5000",
    );
    return;
  }
  state.description = expense.description;
  state.amount = expense.amount;
  await ctx.reply(
    buildExpenseConfirmText(state.description, state.amount, state.reportMonth),
    buildExpenseConfirmKeyboard(),
  );
  ctx.wizard.next();
}

/**
 * Step 2: cursor guard — fires when user sends text while the confirm keyboard is showing.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepGuardConfirm(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as ExpenseWizardState;
  await ctx.reply("Usá los botones para confirmar o cancelar.");
  await ctx.reply(
    buildExpenseConfirmText(state.description ?? "", state.amount ?? 0, state.reportMonth),
    buildExpenseConfirmKeyboard(),
  );
}

/**
 * Saves the expense and leaves the scene, applying a backdated timestamp when retroactive.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleConfirm(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as ExpenseWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";

  const hasRequiredData = state.description && state.amount;
  if (!hasRequiredData) {
    await ctx.reply("Error: datos de sesión incompletos.");
    await ctx.scene.leave();
    return;
  }

  const description = state.description as string;
  const amount = state.amount as number;
  const expenseDate = state.reportMonth ? buildBackdatedTimestamp(state.reportMonth) : undefined;

  try {
    const categoryId = await saveExpense({ telegramUserId, description, amount, date: expenseDate });
    const categoryLabel = categoryId ? ` (${categoryId})` : "";
    await ctx.reply(`✅ Gasto registrado: ${description}  ${formatARS(amount)}${categoryLabel}`);
    await ctx.scene.leave();
  } catch (error) {
    log.error("Error saving expense", error, { module: "expense.scene", userId: telegramUserId });
    await ctx.reply("Error al guardar el gasto. Intentá de nuevo.");
  }
}

/**
 * Cancels the expense flow from the confirmation keyboard.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleCancel(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await ctx.reply("Gasto anulado.");
  await ctx.scene.leave();
}

/**
 * Re-presents the prompt for the current wizard step when an unexpected file is received.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function repromptCurrentStep(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as ExpenseWizardState;
  await ctx.reply("No esperaba un archivo aquí.");
  switch (ctx.wizard.cursor) {
  case 1:
    if (state.description && !state.amount) {
      await ctx.reply(
        `*¿Cuánto gastaste en ${state.description}?*\n_Escribí cancelar para salir._`,
        { parse_mode: "Markdown" },
      );
    } else if (state.amount && !state.description) {
      await ctx.reply(
        `*¿En qué gastaste ${formatARS(state.amount)}?*\n_Escribí cancelar para salir._`,
        { parse_mode: "Markdown" },
      );
    } else {
      await ctx.reply(
        "*Ingresá descripción y monto en un solo mensaje.*\n_Ej: Panaderia 5000_\n_Escribí cancelar para salir._",
        { parse_mode: "Markdown" },
      );
    }
    break;
  case 2:
    await ctx.reply("Usá los botones para confirmar o cancelar.");
    await ctx.reply(
      buildExpenseConfirmText(state.description ?? "", state.amount ?? 0, state.reportMonth),
      buildExpenseConfirmKeyboard(),
    );
    break;
  default:
    break;
  }
}

/**
 * Cancels the expense flow when the user types a cancel word at any step.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleCancelWord(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Operación cancelada.");
  await ctx.scene.leave();
}

export const expenseScene = new Scenes.WizardScene<KakebotContext>(
  EXPENSE_SCENE_ID,
  stepInit,
  stepHandleInput,
  stepGuardConfirm,
);

expenseScene.hears(CANCEL_REGEX, handleCancelWord);
expenseScene.action("expense_confirm", handleConfirm);
expenseScene.action("expense_cancel", handleCancel);
expenseScene.on("photo", repromptCurrentStep);
expenseScene.on("document", repromptCurrentStep);
