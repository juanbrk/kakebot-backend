import { Scenes } from "telegraf";
import { KakebotContext, TaxReceiptWizardState } from "../../types/telegraf-context.types";
import { Tax, TaxInstallment } from "../../types/tax.types";
import { getMonthLabel } from "../../helpers/format";
import { log } from "../../helpers/logger";
import { replyOrEdit } from "../../helpers/telegram";
import {
  buildTaxReceiptTaxPickerKeyboard,
  buildTaxReceiptInstallmentPickerKeyboard,
} from "../keyboards/tax";
import {
  getTaxById,
  getTaxesByUser,
  getTaxInstallmentById,
  getUnpaidTaxInstallmentsByUser,
  markTaxInstallmentAsPaid,
  saveTaxReceiptUrl,
} from "../../services/tax.service";
import { uploadTaxReceipt } from "../../services/storage.service";
import { downloadFile } from "../handlers/photo";

export const TAX_RECEIPT_SCENE_ID = "tax-receipt-wizard";

const CANCEL_REGEX = /^\s*(salir|cancelar|terminar|stop)\s*$/i;

// Cursor positions of the two selector guards.
const TAX_GUARD_STEP = 1;
const INSTALLMENT_GUARD_STEP = 2;

const TAX_PROMPT = "*¿A qué impuesto corresponde el comprobante?*";

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Loads everything the selectors need: the user's taxes and every unpaid installment
 * across all of them. Installment documents carry `taxName`, so one query feeds both.
 *
 * @param {string} telegramUserId - User's Telegram ID
 * @return {Promise<{taxes: Tax[], pendingInstallments: TaxInstallment[]}>} Taxes and unpaid installments
 */
async function getTaxReceiptCandidates(
  telegramUserId: string,
): Promise<{ taxes: Tax[]; pendingInstallments: TaxInstallment[] }> {
  const [taxes, pendingInstallments] = await Promise.all([
    getTaxesByUser(telegramUserId),
    getUnpaidTaxInstallmentsByUser(telegramUserId),
  ]);
  return { taxes, pendingInstallments };
}

/**
 * Narrows a tax list to those with at least one unpaid installment, so the selector never
 * offers a tax that would lead to an empty installment selector.
 *
 * @param {Tax[]} taxes - All of the user's taxes
 * @param {TaxInstallment[]} pendingInstallments - All of the user's unpaid installments
 * @return {Tax[]} Taxes that have pending installments
 */
function getSelectableTaxes(taxes: Tax[], pendingInstallments: TaxInstallment[]): Tax[] {
  const taxIdsWithPending = new Set(pendingInstallments.map((installment) => installment.taxId));
  return taxes.filter((tax) => taxIdsWithPending.has(tax.id ?? ""));
}

/**
 * Returns the unpaid installments of a single tax, oldest first.
 *
 * @param {string} telegramUserId - User's Telegram ID
 * @param {string} taxId - Tax document ID
 * @return {Promise<TaxInstallment[]>} Unpaid installments of that tax
 */
async function getPendingInstallmentsForTax(
  telegramUserId: string,
  taxId: string,
): Promise<TaxInstallment[]> {
  const pendingInstallments = await getUnpaidTaxInstallmentsByUser(telegramUserId);
  return pendingInstallments.filter((installment) => installment.taxId === taxId);
}

/**
 * Builds the installment-selector prompt for a given tax.
 *
 * @param {string} taxName - Tax display name
 * @return {string} Markdown prompt
 */
function buildInstallmentPrompt(taxName: string): string {
  return `*¿A qué cuota de ${taxName} corresponde el comprobante?*`;
}

/**
 * Sends the tax selector as a new message. Used by the cursor guard, the file reprompt and
 * the retry path — never to consume a button (those edit the message instead).
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function repromptTaxPicker(ctx: KakebotContext): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() ?? "";
  try {
    const { taxes, pendingInstallments } = await getTaxReceiptCandidates(telegramUserId);
    const keyboard = buildTaxReceiptTaxPickerKeyboard(
      getSelectableTaxes(taxes, pendingInstallments),
      0,
    );
    await ctx.reply(TAX_PROMPT, {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    });
  } catch (error) {
    log.error("Error rebuilding tax picker", error, {
      module: "tax-receipt.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al cargar los impuestos. Intentá de nuevo.");
  }
}

/**
 * Sends the installment selector of the tax held in state as a new message.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function repromptInstallmentPicker(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as TaxReceiptWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";
  const taxId = state.taxId ?? "";
  try {
    const installments = await getPendingInstallmentsForTax(telegramUserId, taxId);
    const keyboard = buildTaxReceiptInstallmentPickerKeyboard(installments, 0, taxId);
    await ctx.reply(buildInstallmentPrompt(state.taxName ?? ""), {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    });
  } catch (error) {
    log.error("Error rebuilding installment picker", error, {
      module: "tax-receipt.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al cargar las cuotas. Intentá de nuevo.");
  }
}

// ─── steps ────────────────────────────────────────────────────────────────────

/**
 * Step 0: entered from the doc-router with the file already captured.
 * Shows the tax selector, or explains why there is nothing to pick and leaves.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepInit(ctx: KakebotContext): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() ?? "";

  try {
    const { taxes, pendingInstallments } = await getTaxReceiptCandidates(telegramUserId);

    if (taxes.length === 0) {
      await ctx.reply(
        "No tenés ningún impuesto registrado. Registralo desde el menú Impuestos y volvé a enviar el comprobante.",
      );
      await ctx.scene.leave();
      return;
    }

    if (pendingInstallments.length === 0) {
      await ctx.reply(
        "No tenés cuotas de impuesto pendientes de pago. "
        + "Registrá la cuota desde el menú Impuestos y volvé a enviar el comprobante.",
      );
      await ctx.scene.leave();
      return;
    }

    const keyboard = buildTaxReceiptTaxPickerKeyboard(
      getSelectableTaxes(taxes, pendingInstallments),
      0,
    );
    await ctx.reply(TAX_PROMPT, {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    });
    ctx.wizard.selectStep(TAX_GUARD_STEP);
  } catch (error) {
    log.error("Error loading taxes in tax-receipt scene", error, {
      module: "tax-receipt.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al cargar los impuestos. Intentá de nuevo.");
    await ctx.scene.leave();
  }
}

/**
 * Step 1: cursor guard — fires when the user types while the tax selector is showing.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepGuardTaxPicker(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Elegí un impuesto del teclado, o escribí \"cancelar\" para anular.");
  await repromptTaxPicker(ctx);
}

/**
 * Step 2: cursor guard — fires when the user types while the installment selector is showing.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepGuardInstallmentPicker(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Elegí una cuota del teclado, o escribí \"cancelar\" para anular.");
  await repromptInstallmentPicker(ctx);
}

// ─── action handlers ──────────────────────────────────────────────────────────

/**
 * Handles tax selection: stores the tax in state and shows its pending installments.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handlePickTax(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as TaxReceiptWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taxId = ((ctx as any).match as string[])[1];

  try {
    const [tax, installments] = await Promise.all([
      getTaxById(taxId),
      getPendingInstallmentsForTax(telegramUserId, taxId),
    ]);

    state.taxId = taxId;
    state.taxName = tax?.name ?? "";

    if (installments.length === 0) {
      await replyOrEdit(ctx, `Ya no quedan cuotas pendientes para ${state.taxName}.`);
      await ctx.scene.leave();
      return;
    }

    const keyboard = buildTaxReceiptInstallmentPickerKeyboard(installments, 0, taxId);
    await replyOrEdit(ctx, buildInstallmentPrompt(state.taxName), {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    });
    ctx.wizard.selectStep(INSTALLMENT_GUARD_STEP);
  } catch (error) {
    log.error("Error picking tax in tax-receipt scene", error, {
      module: "tax-receipt.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al cargar las cuotas. Intentá de nuevo.");
  }
}

/**
 * Handles pagination of the tax selector.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleTaxPagination(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = parseInt(((ctx as any).match as string[])[1], 10);

  try {
    const { taxes, pendingInstallments } = await getTaxReceiptCandidates(telegramUserId);
    const keyboard = buildTaxReceiptTaxPickerKeyboard(
      getSelectableTaxes(taxes, pendingInstallments),
      page,
    );
    await replyOrEdit(ctx, TAX_PROMPT, {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    });
  } catch (error) {
    log.error("Error paginating tax picker", error, {
      module: "tax-receipt.scene",
      userId: telegramUserId,
    });
  }
}

/**
 * Handles pagination of the installment selector.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleInstallmentPagination(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as TaxReceiptWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (ctx as any).match as string[];
  const taxId = match[1];
  const page = parseInt(match[2], 10);

  try {
    const installments = await getPendingInstallmentsForTax(telegramUserId, taxId);
    const keyboard = buildTaxReceiptInstallmentPickerKeyboard(installments, page, taxId);
    await replyOrEdit(ctx, buildInstallmentPrompt(state.taxName ?? ""), {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    });
  } catch (error) {
    log.error("Error paginating installment picker", error, {
      module: "tax-receipt.scene",
      userId: telegramUserId,
    });
  }
}

/**
 * Handles installment selection: uploads the pending file as that installment's receipt and
 * marks the installment as paid. On failure the selector is re-presented so the user can
 * retry without losing the file — the scene is deliberately not left.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handlePickInstallment(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as TaxReceiptWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];

  const installment = await getTaxInstallmentById(installmentId);
  if (!installment) {
    await ctx.reply("Cuota no encontrada.");
    await ctx.scene.leave();
    return;
  }

  await replyOrEdit(
    ctx,
    `Adjuntando el comprobante a la cuota de ${getMonthLabel(installment.dueMonth)} `
    + `de ${installment.taxName}...`,
  );

  try {
    const fileLink = await ctx.telegram.getFileLink(state.pendingFileId);
    const fileBuffer = await downloadFile(fileLink.href);
    const mimeType = state.pendingFileType === "pdf"
      ? "application/pdf"
      : fileLink.href.includes(".png") ? "image/png" : "image/jpeg";

    const receiptUrl = await uploadTaxReceipt({ telegramUserId, installmentId, fileBuffer, mimeType });
    await markTaxInstallmentAsPaid(installmentId);
    await saveTaxReceiptUrl(installmentId, receiptUrl);

    await ctx.reply("✅ Comprobante adjunto. Cuota marcada como pagada.");
    await ctx.scene.leave();
  } catch (error) {
    log.error("Error attaching tax receipt", error, {
      module: "tax-receipt.scene",
      userId: telegramUserId,
      installmentId,
    });
    await ctx.reply("Error al guardar el comprobante. Intentá de nuevo.");
    await repromptInstallmentPicker(ctx);
  }
}

// ─── reprompt ─────────────────────────────────────────────────────────────────

/**
 * Re-presents the current selector when the user sends another file mid-flow. The file that
 * started the flow was already captured by the doc-router, so a new one is unexpected here.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function repromptCurrentStep(ctx: KakebotContext): Promise<void> {
  await ctx.reply("No esperaba un archivo aquí.");

  switch (ctx.wizard.cursor) {
  case 0:
  case TAX_GUARD_STEP:
    await repromptTaxPicker(ctx);
    break;
  case INSTALLMENT_GUARD_STEP:
    await repromptInstallmentPicker(ctx);
    break;
  default:
    break;
  }
}

// ─── cancel word ──────────────────────────────────────────────────────────────

/**
 * Cancels the flow when the user types a cancel word.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleCancelWord(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Carga de comprobante cancelada.");
  await ctx.scene.leave();
}

// ─── scene export ─────────────────────────────────────────────────────────────

export const taxReceiptScene = new Scenes.WizardScene<KakebotContext>(
  TAX_RECEIPT_SCENE_ID,
  stepInit,
  stepGuardTaxPicker,
  stepGuardInstallmentPicker,
);

taxReceiptScene.hears(CANCEL_REGEX, handleCancelWord);
taxReceiptScene.action(/^taxr_pick:(.+)$/, handlePickTax);
taxReceiptScene.action(/^taxr_pg:(\d+)$/, handleTaxPagination);
taxReceiptScene.action(/^taxr_inst:(.+)$/, handlePickInstallment);
taxReceiptScene.action(/^taxr_inst_pg:(.+):(\d+)$/, handleInstallmentPagination);
taxReceiptScene.on("photo", repromptCurrentStep);
taxReceiptScene.on("document", repromptCurrentStep);
