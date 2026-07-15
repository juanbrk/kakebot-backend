import { Scenes } from "telegraf";
import { KakebotContext, CardCreateWizardState } from "../../types/telegraf-context.types";
import { CreditCardProcessor } from "../../types/index";
import { log } from "../../helpers/logger";
import { editOrReply } from "../../helpers/telegram";
import { getMessageText } from "../../helpers/wizard";
import {
  buildCardProcessorKeyboard,
  buildCardConfirmText,
  buildCardConfirmKeyboard,
  buildCardStmtAfterCreateKeyboard,
} from "../keyboards/card";
import { createCard } from "../../services/card.service";

export const CARD_CREATE_SCENE_ID = "card-create-wizard";

const CANCEL_REGEX = /^\s*(salir|cancelar|terminar|stop)\s*$/i;

/** Step index of the digits prompt — target for selectStep after processor selection. */
const DIGITS_STEP = 3;

/**
 * Step 0: entry point — prompts for bank name and advances to step 1.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepInit(ctx: KakebotContext): Promise<void> {
  await ctx.reply(
    "*¿A qué banco pertenece la tarjeta?*\n_Ejemplo: Galicia, BBVA, etc._",
    { parse_mode: "Markdown" },
  );
  ctx.wizard.next();
}

/**
 * Step 1: validates bank name text and shows processor keyboard.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepHandleBank(ctx: KakebotContext): Promise<void> {
  const bank = getMessageText(ctx);
  if (!bank || bank.length === 0) {
    await ctx.reply("El nombre del banco no puede estar vacío.");
    return;
  }
  (ctx.wizard.state as CardCreateWizardState).bank = bank;
  await ctx.reply("*Seleccioná el procesador:*", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: buildCardProcessorKeyboard().reply_markup as any,
  });
  ctx.wizard.next();
}

/**
 * Step 2: guard — fires when user sends text instead of tapping a processor button.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardProcessor(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Elegí el procesador del teclado, o escribí \"cancelar\" para anular.");
  await ctx.reply("*Seleccioná el procesador:*", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: buildCardProcessorKeyboard().reply_markup as any,
  });
}

/**
 * Step 3: validates the last four digits of the card.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepHandleDigits(ctx: KakebotContext): Promise<void> {
  const digits = getMessageText(ctx);
  const isValidDigits = digits ? /^\d{4}$/.test(digits) : false;
  if (!isValidDigits) {
    await ctx.reply("Los dígitos deben ser exactamente 4 números (Ej: 5477).");
    return;
  }
  (ctx.wizard.state as CardCreateWizardState).lastFourDigits = digits!;
  await ctx.reply(
    "*Ingresá la fecha de vencimiento de la tarjeta*\n_Formato MM/AA (Ej: 03/28)_",
    { parse_mode: "Markdown" },
  );
  ctx.wizard.next();
}

/**
 * Step 4: validates expiry date, stores parsed month/year, shows confirm keyboard.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepHandleExpiry(ctx: KakebotContext): Promise<void> {
  const expiry = getMessageText(ctx);
  const isValidExpiry = expiry ? /^(0[1-9]|1[0-2])\/(\d{2})$/.test(expiry) : false;
  if (!isValidExpiry) {
    await ctx.reply("Formato inválido. Ingresá el vencimiento como MM/AA (Ej: 03/28)");
    return;
  }
  const [mmStr, yyStr] = expiry!.split("/");
  const state = ctx.wizard.state as CardCreateWizardState;
  state.expiryMonth = parseInt(mmStr, 10);
  state.expiryYear = 2000 + parseInt(yyStr, 10);

  const bank = state.bank ?? "";
  const lastFourDigits = state.lastFourDigits ?? "";
  const processor: CreditCardProcessor = state.processor ?? "VISA";
  await ctx.reply(buildCardConfirmText({ digits: lastFourDigits, bank, processor, expiry: expiry! }), {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: buildCardConfirmKeyboard().reply_markup as any,
  });
  ctx.wizard.next();
}

/**
 * Step 5: guard — fires when user sends text instead of tapping confirm/cancel.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardConfirm(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as CardCreateWizardState;
  const bank = state.bank ?? "";
  const lastFourDigits = state.lastFourDigits ?? "";
  const processor: CreditCardProcessor = state.processor ?? "VISA";
  const expiryMonth = state.expiryMonth;
  const expiryYear = state.expiryYear;
  const expiryStr = expiryMonth && expiryYear
    ? `${String(expiryMonth).padStart(2, "0")}/${String(expiryYear).slice(-2)}`
    : "";
  await ctx.reply("Confirmá o cancelá la tarjeta usando los botones.");
  await ctx.reply(buildCardConfirmText({ digits: lastFourDigits, bank, processor, expiry: expiryStr }), {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: buildCardConfirmKeyboard().reply_markup as any,
  });
}

/**
 * Callback: processor button tapped — stores processor, prompts for digits, jumps to step 3.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleProcessorSelected(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processor = ((ctx as any).match as string[])[1] as CreditCardProcessor;
  (ctx.wizard.state as CardCreateWizardState).processor = processor;

  const processorLabel = processor === "VISA" ? "Visa" : "MasterCard";
  await ctx.editMessageText(`*Procesador seleccionado: ${processorLabel}*`, {
    parse_mode: "Markdown",
  });
  await ctx.reply(
    "*Ingresá los últimos 4 dígitos de la tarjeta*",
    { parse_mode: "Markdown" },
  );
  ctx.wizard.selectStep(DIGITS_STEP);
}

/**
 * Callback: confirm button tapped — creates the card in Firestore and offers to add a statement.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleConfirm(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() ?? "";
  const state = ctx.wizard.state as CardCreateWizardState;

  const hasCardData =
    state.bank &&
    state.lastFourDigits &&
    state.processor &&
    state.expiryMonth &&
    state.expiryYear;

  if (!hasCardData) {
    await ctx.reply("Error: datos de la tarjeta incompletos.");
    await ctx.scene.leave();
    return;
  }

  let cardId: string;
  try {
    cardId = await createCard({
      telegramUserId,
      lastFourDigits: state.lastFourDigits!,
      bank: state.bank!,
      processor: state.processor!,
      expiryMonth: state.expiryMonth!,
      expiryYear: state.expiryYear!,
    });
  } catch (error) {
    log.error("Error creating card", error, { module: "card-create.scene", userId: telegramUserId });
    await ctx.reply("Error al guardar la tarjeta. Intentá de nuevo.");
    return;
  }

  const processorLabel = state.processor === "VISA" ? "Visa" : "Master";
  const cardLabel = `${processorLabel} ${state.lastFourDigits} - ${state.bank}`;

  await editOrReply(ctx, `✅ Tarjeta *${cardLabel}* registrada.`, {
    parse_mode: "Markdown",
  });
  await ctx.scene.leave();
  await ctx.reply("¿Deseas añadir un resumen mensual?", buildCardStmtAfterCreateKeyboard(cardId));
}

/**
 * Callback: cancel button tapped — discards wizard state and leaves the scene.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleCancel(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await ctx.editMessageText("Operación cancelada.");
  await ctx.scene.leave();
}

/**
 * Re-presents the current step's prompt when an unexpected file arrives.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function repromptCurrentStep(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as CardCreateWizardState;
  await ctx.reply("No esperaba un archivo aquí.");

  switch (ctx.wizard.cursor) {
  case 0:
  case 1:
    await ctx.reply(
      "*¿A qué banco pertenece la tarjeta?*\n_Ejemplo: Galicia, BBVA, etc._",
      { parse_mode: "Markdown" },
    );
    break;
  case 2:
    await ctx.reply("*Seleccioná el procesador:*", {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: buildCardProcessorKeyboard().reply_markup as any,
    });
    break;
  case 3:
    await ctx.reply(
      "*Ingresá los últimos 4 dígitos de la tarjeta*",
      { parse_mode: "Markdown" },
    );
    break;
  case 4:
    await ctx.reply(
      "*Ingresá la fecha de vencimiento de la tarjeta*\n_Formato MM/AA (Ej: 03/28)_",
      { parse_mode: "Markdown" },
    );
    break;
  case 5: {
    const bank = state.bank ?? "";
    const lastFourDigits = state.lastFourDigits ?? "";
    const processor: CreditCardProcessor = state.processor ?? "VISA";
    const expiryMonth = state.expiryMonth;
    const expiryYear = state.expiryYear;
    const expiryStr = expiryMonth && expiryYear
      ? `${String(expiryMonth).padStart(2, "0")}/${String(expiryYear).slice(-2)}`
      : "";
    await ctx.reply(buildCardConfirmText({ digits: lastFourDigits, bank, processor, expiry: expiryStr }), {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: buildCardConfirmKeyboard().reply_markup as any,
    });
    break;
  }
  default:
    break;
  }
}

/**
 * Cancel word handler — fires for "cancelar", "salir", "terminar", "stop" at any step.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleCancelWord(ctx: KakebotContext): Promise<void> {
  await ctx.scene.leave();
  await ctx.reply("Operación cancelada.");
}

export const cardCreateScene = new Scenes.WizardScene<KakebotContext>(
  CARD_CREATE_SCENE_ID,
  stepInit,
  stepHandleBank,
  stepGuardProcessor,
  stepHandleDigits,
  stepHandleExpiry,
  stepGuardConfirm,
);

cardCreateScene.hears(CANCEL_REGEX, handleCancelWord);
cardCreateScene.action(/^card_proc:(VISA|MASTERCARD)$/, handleProcessorSelected);
cardCreateScene.action("card_confirm", handleConfirm);
cardCreateScene.action("card_cancel", handleCancel);
cardCreateScene.on("photo", repromptCurrentStep);
cardCreateScene.on("document", repromptCurrentStep);
