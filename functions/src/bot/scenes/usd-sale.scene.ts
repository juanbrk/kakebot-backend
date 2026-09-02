import { Scenes } from "telegraf";
import { KakebotContext, UsdSaleWizardState } from "../../types/telegraf-context.types";
import { getMessageText } from "../../helpers/wizard";
import { parseArgentineAmount } from "../../helpers/parse-amount";
import { formatARS, formatUSD } from "../../helpers/format";
import { log } from "../../helpers/logger";
import { buildUsdSaleConfirmKeyboard, buildUsdSaleConfirmText } from "../keyboards/usd-sale";
import { saveUsdSale } from "../../services/usd-sale.service";
import { editOrReply, replyOrEdit } from "../../helpers/telegram";

export const USD_SALE_SCENE_ID = "usd-sale-wizard";

const CANCEL_REGEX = /^\s*(salir|cancelar|terminar|stop)\s*$/i;

const CONFIRM_STEP = 3;

/**
 * Floor below which an entered exchange rate is rejected as implausible.
 * `parseArgentineAmount` treats a lone dot as a decimal separator (documented
 * rule: "1.400" → 1,4), so the natural way to type a thousands-formatted rate
 * silently persists a value ~1000x too small and poisons the monthly weighted
 * average. Real USD/ARS rates are always well above this floor.
 */
const MIN_PLAUSIBLE_EXCHANGE_RATE = 100;

const AMOUNT_USD_PROMPT
  = "*Ingresá el monto en dólares a vender*\n"
  + "_Ingresá el número sin puntos de mil. Ej: 500 o 1250,50_\n"
  + "_Escribí cancelar o salir para anular._";

const EXCHANGE_RATE_PROMPT
  = "*¿A qué cotización vendiste?*\n_Ingresá el número sin puntos de mil. Ej: 1400 o 1400,50_";

/**
 * Step 0: prompts for the USD amount to sell. Runs on scene entry.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepInit(ctx: KakebotContext): Promise<void> {
  await ctx.reply(AMOUNT_USD_PROMPT, { parse_mode: "Markdown" });
  ctx.wizard.next();
}

/**
 * Step 1: validates the USD amount and prompts for the exchange rate.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepHandleAmountUSD(ctx: KakebotContext): Promise<void> {
  const messageText = getMessageText(ctx);
  const amountUSD = messageText ? parseArgentineAmount(messageText) : null;

  const isValidAmount = amountUSD !== null && amountUSD > 0;
  if (!isValidAmount) {
    await ctx.reply(
      "*No entendí el monto.*\nIngresá solo el número sin puntos de mil:\n_Ej: 500 o 1250,50_",
      { parse_mode: "Markdown" }
    );
    return;
  }

  const state = ctx.wizard.state as UsdSaleWizardState;
  state.amountUSD = amountUSD;

  await ctx.reply(EXCHANGE_RATE_PROMPT, { parse_mode: "Markdown" });
  ctx.wizard.next();
}

/**
 * Step 2: validates the exchange rate — including a plausibility floor — and
 * shows the confirmation keyboard.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepHandleExchangeRate(ctx: KakebotContext): Promise<void> {
  const messageText = getMessageText(ctx);
  const exchangeRate = messageText ? parseArgentineAmount(messageText) : null;

  const isValidRate = exchangeRate !== null && exchangeRate > 0;
  if (!isValidRate) {
    await ctx.reply(
      "*No entendí la cotización.*\nIngresá solo el número:\n_Ej: 1400 o 1400,50_",
      { parse_mode: "Markdown" }
    );
    return;
  }

  const isRateImplausiblyLow = exchangeRate < MIN_PLAUSIBLE_EXCHANGE_RATE;
  if (isRateImplausiblyLow) {
    await ctx.reply(
      "*La cotización parece demasiado baja.*\nIngresala sin puntos de mil.\n_Ej: 1400 o 1400,50_",
      { parse_mode: "Markdown" }
    );
    return;
  }

  const state = ctx.wizard.state as UsdSaleWizardState;
  state.exchangeRate = exchangeRate;

  await ctx.reply(buildUsdSaleConfirmText(state.amountUSD ?? 0, exchangeRate), {
    parse_mode: "Markdown",
    ...buildUsdSaleConfirmKeyboard(),
  });
  ctx.wizard.next();
}

/**
 * Step 3: cursor guard — fires when user sends text while the confirm keyboard is showing.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepGuardConfirm(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as UsdSaleWizardState;
  await ctx.reply("Usá los botones para confirmar o cancelar.");
  await ctx.reply(buildUsdSaleConfirmText(state.amountUSD ?? 0, state.exchangeRate ?? 0), {
    parse_mode: "Markdown",
    ...buildUsdSaleConfirmKeyboard(),
  });
}

/**
 * Confirms and saves the USD sale.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleConfirm(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as UsdSaleWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";

  const hasRequiredData = state.amountUSD && state.exchangeRate;
  if (!hasRequiredData) {
    await replyOrEdit(ctx, "Error: datos de sesión incompletos.");
    await ctx.scene.leave();
    return;
  }

  const amountUSD = state.amountUSD as number;
  const exchangeRate = state.exchangeRate as number;

  try {
    await saveUsdSale({ telegramUserId, amountUSD, exchangeRate });
    const amountARS = amountUSD * exchangeRate;
    await editOrReply(
      ctx,
      `✅ *Venta registrada*: ${formatUSD(amountUSD)} → ${formatARS(amountARS)}`,
      { parse_mode: "Markdown" }
    );
    await ctx.scene.leave();
  } catch (error) {
    log.error("Error saving USD sale", error, { module: "usd-sale.scene", userId: telegramUserId });
    await ctx.reply("Error al guardar la venta. Intentá de nuevo.");
  }
}

/**
 * Cancels the USD sale flow from the confirmation keyboard.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleCancel(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await replyOrEdit(ctx, "Venta anulada.");
  await ctx.scene.leave();
}

/**
 * Re-presents the prompt for the current wizard step when an unexpected file is received.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function repromptCurrentStep(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as UsdSaleWizardState;
  await ctx.reply("No esperaba un archivo aquí.");
  switch (ctx.wizard.cursor) {
  case 1:
    await ctx.reply(AMOUNT_USD_PROMPT, { parse_mode: "Markdown" });
    break;
  case 2:
    await ctx.reply(EXCHANGE_RATE_PROMPT, { parse_mode: "Markdown" });
    break;
  case CONFIRM_STEP:
    await ctx.reply(buildUsdSaleConfirmText(state.amountUSD ?? 0, state.exchangeRate ?? 0), {
      parse_mode: "Markdown",
      ...buildUsdSaleConfirmKeyboard(),
    });
    break;
  default:
    break;
  }
}

/**
 * Cancels the USD sale flow when the user types a cancel word at any step.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleCancelWord(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Operación cancelada.");
  await ctx.scene.leave();
}

export const usdSaleScene = new Scenes.WizardScene<KakebotContext>(
  USD_SALE_SCENE_ID,
  stepInit, // 0
  stepHandleAmountUSD, // 1
  stepHandleExchangeRate, // 2
  stepGuardConfirm, // 3 = CONFIRM_STEP
);

usdSaleScene.hears(CANCEL_REGEX, handleCancelWord);
usdSaleScene.action("sale_confirm", handleConfirm);
usdSaleScene.action("sale_cancel", handleCancel);
usdSaleScene.on("photo", repromptCurrentStep);
usdSaleScene.on("document", repromptCurrentStep);
