import { Scenes } from "telegraf";
import { KakebotContext, IncomeWizardState } from "../../types/telegraf-context.types";
import { parseArgentineAmount } from "../../helpers/parse-amount";
import { formatARS, buildBackdatedTimestamp } from "../../helpers/format";
import { buildIncomeConfirmKeyboard, buildIncomeConfirmText } from "../keyboards/income";
import { saveIncome } from "../../services/income.service";
import { replyOrEdit } from "../../helpers/telegram";

export const INCOME_SCENE_ID = "income-wizard";

const CANCEL_REGEX = /^\s*(salir|cancelar|terminar|stop)\s*$/i;

/**
 * Extracts the trimmed text of the incoming message, if any.
 *
 * @param {KakebotContext} ctx - Telegraf context
 * @return {string | undefined} The message text, or undefined for non-text updates.
 */
function getMessageText(ctx: KakebotContext): string | undefined {
  const message = ctx.message;
  if (message && "text" in message) {
    return message.text.trim();
  }
  return undefined;
}

/**
 * Step 0: prompts for the income amount. Runs on scene entry; the triggering
 * command/callback is ignored here, only the prompt is sent.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function promptAmount(ctx: KakebotContext): Promise<void> {
  await ctx.reply(
    "*Ingresá el monto percibido*\n_Escribí cancelar o salir para anular._",
    { parse_mode: "Markdown" },
  );
  ctx.wizard.next();
}

/**
 * Step 1: validates the amount and prompts for the reason.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleAmount(ctx: KakebotContext): Promise<void> {
  const messageText = getMessageText(ctx);
  const amount = messageText ? parseArgentineAmount(messageText) : null;

  const isValidAmount = amount !== null && amount > 0;
  if (!isValidAmount) {
    await ctx.reply(
      "No entendí el monto. Ingresá solo el número:\nEj: 5000 o 14.819,50",
    );
    return;
  }

  const state = ctx.wizard.state as IncomeWizardState;
  state.amount = amount;

  await ctx.reply(
    "*Ingresá el motivo (30 caracteres max)*\n_Escribí cancelar o salir para anular._",
    { parse_mode: "Markdown" },
  );
  ctx.wizard.next();
}

/**
 * Step 2: validates the reason and shows the confirmation keyboard.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleReason(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as IncomeWizardState;

  // Reason already set → confirmation keyboard is showing; text input is not valid here.
  if (state.reason) {
    await ctx.reply("Usá los botones para confirmar o cancelar.");
    await ctx.reply(
      buildIncomeConfirmText(state.amount || 0, state.reason),
      buildIncomeConfirmKeyboard(),
    );
    return;
  }

  const reason = getMessageText(ctx);

  const isReasonEmpty = !reason || reason.length === 0;
  if (isReasonEmpty) {
    await ctx.reply("El motivo no puede estar vacío.");
    return;
  }

  const isReasonTooLong = reason.length > 30;
  if (isReasonTooLong) {
    await ctx.reply(
      "El motivo no puede superar los 30 caracteres. Ingresalo de nuevo.",
    );
    return;
  }

  state.reason = reason;

  const amount = state.amount || 0;
  await ctx.reply(buildIncomeConfirmText(amount, reason), buildIncomeConfirmKeyboard());
}

/**
 * Confirms and saves the income, backdating it when a reportMonth is present.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleConfirm(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as IncomeWizardState;
  const telegramUserId = ctx.from?.id.toString() || "";

  const hasRequiredData = state.amount && state.reason;
  if (!hasRequiredData) {
    await replyOrEdit(ctx, "Error: datos de sesión incompletos.");
    await ctx.scene.leave();
    return;
  }

  const amount = state.amount as number;
  const reason = state.reason as string;
  const incomeDate = state.reportMonth ? buildBackdatedTimestamp(state.reportMonth) : undefined;

  await saveIncome({ telegramUserId, amount, reason, date: incomeDate });
  await ctx.scene.leave();

  await replyOrEdit(ctx, `✅ *Ingreso registrado*: ${reason}  ${formatARS(amount)}`, { parse_mode: "Markdown" });
}

/**
 * Cancels the income flow from the confirmation keyboard.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleCancel(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await ctx.scene.leave();
  await replyOrEdit(ctx, "Ingreso anulado.");
}

/**
 * Cancels the income flow when the user types a cancel word at any step.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleCancelWord(ctx: KakebotContext): Promise<void> {
  await ctx.scene.leave();
  await ctx.reply("Operación cancelada.");
}

export const incomeScene = new Scenes.WizardScene<KakebotContext>(
  INCOME_SCENE_ID,
  promptAmount,
  handleAmount,
  handleReason,
);

incomeScene.hears(CANCEL_REGEX, handleCancelWord);
incomeScene.action("inc_confirm", handleConfirm);
incomeScene.action("inc_cancel", handleCancel);
