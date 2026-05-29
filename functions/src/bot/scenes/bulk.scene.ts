import { Scenes, Markup } from "telegraf";
import { KakebotContext, BulkWizardState } from "../../types/telegraf-context.types";
import { BulkExpenseEntry } from "../../types/expense.types";
import { saveBulkExpenses } from "../../services/expense.service";
import { buildBulkConfirmText, buildBulkSummaryText } from "../../helpers/bulk-parse";
import { log } from "../../helpers/logger";

export const BULK_SCENE_ID = "bulk-wizard";

const CANCEL_REGEX = /^\s*(salir|cancelar|terminar|stop)\s*$/i;
const CONFIRM_GUARD_STEP = 1;

/**
 * Builds the confirm/cancel keyboard for bulk expense registration.
 *
 * @return {object} Telegraf inline keyboard markup
 */
function buildBulkConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Cancelar", "bulk_cancel"),
      Markup.button.callback("Confirmar", "bulk_confirm"),
    ],
  ]);
}

/**
 * Step 0: shows the bulk confirmation keyboard. Runs on scene entry.
 * The bulkExpenses are always pre-populated by the text handler before entering.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepInit(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as BulkWizardState;
  await ctx.reply(
    buildBulkConfirmText(state.bulkExpenses ?? []),
    buildBulkConfirmKeyboard(),
  );
  ctx.wizard.selectStep(CONFIRM_GUARD_STEP);
}

/**
 * Step 1: cursor guard — fires when user sends text while the confirm keyboard is showing.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepGuardConfirm(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as BulkWizardState;
  await ctx.reply("Usá los botones para confirmar o cancelar.");
  await ctx.reply(
    buildBulkConfirmText(state.bulkExpenses ?? []),
    buildBulkConfirmKeyboard(),
  );
}

/**
 * Saves all bulk expenses and leaves the scene.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleConfirm(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as BulkWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";

  const hasBulkExpenses = state.bulkExpenses && state.bulkExpenses.length > 0;
  if (!hasBulkExpenses) {
    await ctx.reply("Error: datos de sesión incompletos.");
    await ctx.scene.leave();
    return;
  }

  const expenses = state.bulkExpenses as BulkExpenseEntry[];

  try {
    await saveBulkExpenses(telegramUserId, expenses);
    await ctx.reply(buildBulkSummaryText(expenses));
    await ctx.scene.leave();
  } catch (error) {
    log.error("Error saving bulk expenses", error, {
      module: "bulk.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al guardar los gastos. Intentá de nuevo.");
  }
}

/**
 * Cancels the bulk flow from the confirmation keyboard.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleCancel(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await ctx.reply("Carga masiva cancelada.");
  await ctx.scene.leave();
}

/**
 * Re-presents the prompt for the current wizard step when an unexpected file is received.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function repromptCurrentStep(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as BulkWizardState;
  await ctx.reply("No esperaba un archivo aquí.");
  switch (ctx.wizard.cursor) {
  case 1:
    await ctx.reply("Usá los botones para confirmar o cancelar.");
    await ctx.reply(
      buildBulkConfirmText(state.bulkExpenses ?? []),
      buildBulkConfirmKeyboard(),
    );
    break;
  default:
    break;
  }
}

/**
 * Cancels the bulk flow when the user types a cancel word at any step.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleCancelWord(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Operación cancelada.");
  await ctx.scene.leave();
}

export const bulkScene = new Scenes.WizardScene<KakebotContext>(
  BULK_SCENE_ID,
  stepInit,
  stepGuardConfirm,
);

bulkScene.hears(CANCEL_REGEX, handleCancelWord);
bulkScene.action("bulk_confirm", handleConfirm);
bulkScene.action("bulk_cancel", handleCancel);
bulkScene.on("photo", repromptCurrentStep);
bulkScene.on("document", repromptCurrentStep);
