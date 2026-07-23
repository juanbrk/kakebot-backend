import { Scenes } from "telegraf";
import { KakebotContext, TaxWizardState } from "../../types/telegraf-context.types";
import { getMessageText } from "../../helpers/wizard";
import { ServicePaymentMethod } from "../../types/service.types";
import { parseArgentineAmount } from "../../helpers/parse-amount";
import { buildDueDate, formatARS, getDaysInMonth, MONTH_NAMES } from "../../helpers/format";
import { log } from "../../helpers/logger";
import { editOrReply, replyOrEdit } from "../../helpers/telegram";
import { buildPaymentMethodKeyboard } from "../../helpers/payment-method";
import {
  buildFilteredTaxMonthKeyboard,
  buildTaxPaidPromptKeyboard,
  buildTaxReceiptPromptKeyboard,
  buildTaxInstallmentDetailText,
  buildTaxInstallmentDetailPayload,
  buildUnpayReceiptDecisionKeyboard,
} from "../keyboards/tax";
import {
  createTax,
  getTaxInstallmentById,
  getTaxInstallmentsByTaxId,
  saveTaxInstallment,
  markTaxInstallmentAsPaid,
  saveTaxReceiptUrl,
  updateTaxInstallmentDueDay,
  clearTaxReceiptUrl,
} from "../../services/tax.service";
import { uploadTaxReceipt, deleteFromUrl } from "../../services/storage.service";
import { downloadFile } from "../handlers/photo";

export const TAX_SCENE_ID = "tax-wizard";

const CANCEL_REGEX = /^\s*(salir|cancelar|terminar|stop)\s*$/i;

// Direct-jump targets used with ctx.wizard.selectStep().
const AMOUNT_STEP = 4;
const RECEIPT_GUARD_STEP = 7;
const EDIT_DUE_DAY_STEP = 8;
const UNPAY_DECISION_STEP = 9;


/**
 * Returns months in YYYY-MM format within the next 3 months that have no existing installment.
 *
 * @param {string} taxId - Tax document ID
 * @return {Promise<string[]>} Available months
 */
async function getAvailableMonthsForTax(taxId: string): Promise<string[]> {
  const existingInstallments = await getTaxInstallmentsByTaxId(taxId);
  const existingMonths = new Set(existingInstallments.map((i) => i.dueMonth));
  const now = new Date();
  const available: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    available.push(`${d.getFullYear()}-${m}`);
  }
  return available.filter((mo) => !existingMonths.has(mo));
}

/**
 * Step 0: routes the wizard depending on entry path.
 * - Edit-installment-due-day entry (installmentId + editDueDay): jumps to EDIT_DUE_DAY_STEP
 *   (prompt sent by the handler).
 * - Receipt-only entry (installmentId, no selectedMonth): jumps to RECEIPT_GUARD_STEP.
 * - Installment-month entry (taxId set, no selectedMonth): shows month selector, parks at cursor 0.
 * - Full creation entry: shows intro + name prompt, advances to step 1.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepInit(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as TaxWizardState;

  if (state.editDueDay && state.installmentId) {
    // Edit-installment-due-day entry from the installment detail view.
    // The prompt is sent by handleEditInstallmentDueDay before entering; just park at the edit step.
    ctx.wizard.selectStep(EDIT_DUE_DAY_STEP);
    return;
  }

  if (state.unpayDecision && state.installmentId) {
    // Receipt keep/delete decision entry from handleUnmarkAsPaid — the Conservar/Borrar
    // keyboard was already shown by the handler before entering; just park here.
    ctx.wizard.selectStep(UNPAY_DECISION_STEP);
    return;
  }

  if (state.installmentId && !state.selectedMonth) {
    // Receipt-only entry from the installment detail view.
    ctx.wizard.selectStep(RECEIPT_GUARD_STEP);
    return;
  }

  if (state.taxId && !state.selectedMonth && !state.installmentId) {
    // Installment-month entry: enter via "Nueva cuota" with taxId pre-set.
    // Show month selector and wait for tax_month: callback (cursor stays at 0).
    const availableMonths = await getAvailableMonthsForTax(state.taxId);
    if (availableMonths.length === 0) {
      await ctx.reply("Todos los meses disponibles ya tienen cuota registrada.");
      await ctx.scene.leave();
      return;
    }
    const keyboard = buildFilteredTaxMonthKeyboard(availableMonths, state.taxId);
    await ctx.reply(
      "*¿A qué mes corresponde la cuota?*",
      {
        parse_mode: "Markdown",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: keyboard.reply_markup as any,
      },
    );
    return;
  }

  await ctx.reply(
    "*¿Cómo se llama el impuesto?*\n_Ej: Monotributo, AFIP, Rentas Automotor_",
    { parse_mode: "Markdown" },
  );
  ctx.wizard.next();
}

/**
 * Step 1: validates the tax name and shows the payment method keyboard.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepHandleName(ctx: KakebotContext): Promise<void> {
  const name = getMessageText(ctx);
  if (!name || name.length === 0) {
    await ctx.reply("El nombre no puede estar vacío.");
    return;
  }

  (ctx.wizard.state as TaxWizardState).taxName = name;

  const keyboard = buildPaymentMethodKeyboard({ callbackPrefix: "tax_pm" });
  await ctx.reply("*Seleccioná el método de pago*", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
  ctx.wizard.next();
}

/**
 * Step 2: cursor guard — fires when user sends text while the payment method keyboard is showing.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepGuardPaymentMethod(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Elegí un método de pago del teclado, o escribí \"cancelar\" para anular.");
  const keyboard = buildPaymentMethodKeyboard({ callbackPrefix: "tax_pm" });
  await ctx.reply("*Seleccioná el método de pago*", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

/**
 * Step 3: cursor guard — fires when user sends text while the month keyboard is showing.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepGuardMonth(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as TaxWizardState;
  const taxId = state.taxId ?? "";

  await ctx.reply(
    "Elegí el mes del teclado, o escribí \"cancelar\" para anular.",
  );

  const availableMonths = await getAvailableMonthsForTax(taxId);
  const keyboard = buildFilteredTaxMonthKeyboard(availableMonths, taxId);
  await ctx.reply(
    "*¿A qué mes corresponde la cuota?*",
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    },
  );
}

/**
 * Step 4: validates the installment amount and prompts for the installment due day.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepHandleAmount(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as TaxWizardState;
  const messageText = getMessageText(ctx);
  const amount = messageText ? parseArgentineAmount(messageText) : null;

  const isValidAmount = amount !== null && amount > 0;
  if (!isValidAmount) {
    await ctx.reply(
      "No entendí el monto. Ingresá solo el número:\nEj: 5000 o 53.136,74",
    );
    return;
  }

  const selectedMonth = state.selectedMonth ?? "";
  if (!selectedMonth) {
    await ctx.reply("Error: datos de sesión incompletos.");
    await ctx.scene.leave();
    return;
  }

  state.amount = amount;

  const maxDay = getDaysInMonth(selectedMonth);
  await ctx.reply(
    `*¿Cuál es el día de vencimiento de esta cuota? (1-${maxDay})*`,
    { parse_mode: "Markdown" },
  );
  ctx.wizard.next();
}

/**
 * Step 5: validates the installment due day, saves the installment, and shows the "mark as paid?" prompt.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepHandleInstallmentDueDay(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as TaxWizardState;
  const selectedMonth = state.selectedMonth ?? "";
  const maxDay = selectedMonth ? getDaysInMonth(selectedMonth) : 31;

  const dayStr = getMessageText(ctx);
  const day = parseInt(dayStr ?? "", 10);

  const isValidDay = Number.isInteger(day) && day >= 1 && day <= maxDay;
  if (!isValidDay) {
    await ctx.reply(`Día inválido. Ingresá un número entre 1 y ${maxDay}.`);
    return;
  }

  const taxId = state.taxId ?? "";
  const taxName = state.taxName ?? "";
  const amount = state.amount;
  const telegramUserId = ctx.from?.id.toString() ?? "";

  const hasRequiredData = taxId && taxName && selectedMonth && amount != null;
  if (!hasRequiredData) {
    await ctx.reply("Error: datos de sesión incompletos.");
    await ctx.scene.leave();
    return;
  }

  const [year, month] = selectedMonth.split("-");
  const dueDate = buildDueDate(parseInt(year, 10), parseInt(month, 10), day);

  const installmentId = await saveTaxInstallment({
    telegramUserId,
    taxId,
    taxName,
    amount: amount as number,
    dueDate,
    dueMonth: selectedMonth,
  });

  state.installmentId = installmentId;

  const dayLabel = String(dueDate.getDate()).padStart(2, "0");
  const moLabel = String(dueDate.getMonth() + 1).padStart(2, "0");
  await ctx.reply(
    `✅ *Cuota registrada*: ${taxName} ${formatARS(amount as number)} (vence ${dayLabel}/${moLabel})`,
    { parse_mode: "Markdown" },
  );

  const keyboard = buildTaxPaidPromptKeyboard(installmentId);
  await ctx.reply("*¿Deseás marcar la cuota como pagada?*", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
  ctx.wizard.next();
}

/**
 * Step 6: cursor guard — fires when user sends text while the "mark as paid?" keyboard is showing.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepGuardPaidDecision(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as TaxWizardState;
  const installmentId = state.installmentId ?? "";

  await ctx.reply("Usá los botones para indicar si la cuota está pagada.");
  const keyboard = buildTaxPaidPromptKeyboard(installmentId);
  await ctx.reply("*¿Deseás marcar la cuota como pagada?*", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

/**
 * Step 7: cursor guard — fires when user sends text while waiting for a receipt photo/document.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepGuardReceipt(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as TaxWizardState;
  const installmentId = state.installmentId ?? "";
  await ctx.reply("Enviá la foto o PDF del comprobante, o usá los botones.");
  const keyboard = buildTaxReceiptPromptKeyboard(installmentId);
  await ctx.reply("*¿Deseás adjuntar un comprobante?*", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

/**
 * Step 8: validates and persists a new due day for an existing tax installment, then leaves the scene.
 * Entered via the installment detail view's "Cambiar vencimiento" button. Validates the day against
 * the installment's own month (via getDaysInMonth), not a fixed 1-31 range.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepHandleEditInstallmentDueDay(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as TaxWizardState;
  const selectedMonth = state.selectedMonth ?? "";
  const maxDay = selectedMonth ? getDaysInMonth(selectedMonth) : 31;

  const dayStr = getMessageText(ctx);
  const day = parseInt(dayStr ?? "", 10);

  const isValidDay = Number.isInteger(day) && day >= 1 && day <= maxDay;
  if (!isValidDay) {
    await ctx.reply(`Día inválido. Ingresá un número entre 1 y ${maxDay}.`);
    return;
  }

  const taxName = state.taxName ?? "";
  const installmentId = state.installmentId ?? "";
  const telegramUserId = ctx.from?.id.toString() ?? "";

  const hasRequiredData = taxName && installmentId && selectedMonth;
  if (!hasRequiredData) {
    await ctx.reply("Error: datos de sesión incompletos.");
    await ctx.scene.leave();
    return;
  }

  const [year, month] = selectedMonth.split("-");
  const dueDate = buildDueDate(parseInt(year, 10), parseInt(month, 10), day);
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  try {
    await updateTaxInstallmentDueDay(installmentId, dueDate);
    await ctx.reply(
      `✅ Modificaste la fecha de vencimiento de ${taxName} para la cuota de ${monthLabel}.`,
    );
    await ctx.scene.leave();
  } catch (error) {
    log.error("Error updating tax installment due day", error, {
      module: "tax.scene",
      userId: telegramUserId,
    });
    await ctx.reply("Error al actualizar el día de vencimiento. Intentá de nuevo.");
  }
}

/**
 * Step 9: cursor guard — fires when user sends text while the receipt keep/delete
 * keyboard is showing.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepGuardUnpayDecision(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as TaxWizardState;
  const installmentId = state.installmentId ?? "";
  await ctx.reply("Usá los botones para indicar qué hacer con el comprobante.");
  const keyboard = buildUnpayReceiptDecisionKeyboard(installmentId);
  await ctx.reply(
    "El impuesto figuraba como pagado con un comprobante de pago\n*¿Qué deseas hacer con el comprobante?*",
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    },
  );
}

// ---------------------------------------------------------------------------
// Action handlers (independent of step cursor)
// ---------------------------------------------------------------------------

/**
 * Handles payment method selection during tax creation.
 * Creates the tax entity, then shows the month selector.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handlePaymentMethod(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as TaxWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const method = ((ctx as any).match as string[])[1] as ServicePaymentMethod;
  const name = state.taxName ?? "";

  if (!name) {
    await ctx.reply("Error: datos de sesión incompletos.");
    await ctx.scene.leave();
    return;
  }

  const taxId = await createTax({
    telegramUserId,
    name,
    paymentMethod: method,
  });

  state.taxId = taxId;
  state.paymentMethod = method;

  await editOrReply(ctx, `✅ Impuesto '${name}' creado.`);

  const availableMonths = await getAvailableMonthsForTax(taxId);

  const keyboard = buildFilteredTaxMonthKeyboard(availableMonths, taxId);
  await ctx.reply(
    "*¿A qué mes corresponde la cuota?*",
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    },
  );
  ctx.wizard.next();
}

/**
 * Handles month selection during tax creation.
 * Sets selectedMonth in state and shows the amount prompt.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleMonthSelected(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as TaxWizardState;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (ctx as any).match as string[];
  const taxId = match[1];
  const dueMonth = match[2];

  state.taxId = taxId;
  state.selectedMonth = dueMonth;

  const [year, month] = dueMonth.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  await replyOrEdit(
    ctx,
    `*Vas a registrar la cuota para ${monthLabel}*`,
    { parse_mode: "Markdown" },
  );

  await ctx.reply(
    `*¿Cuál es el monto de la cuota para ${monthLabel}?*\n_Ej: 53136 o 53.136,74_`,
    { parse_mode: "Markdown" },
  );
  ctx.wizard.selectStep(AMOUNT_STEP);
}

/**
 * Handles "Sí" on the "mark as paid?" prompt.
 * Marks the installment as paid and shows the receipt prompt.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handlePaidYes(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];

  await markTaxInstallmentAsPaid(installmentId);
  await editOrReply(ctx, "✅ Cuota marcada como pagada.", { parse_mode: "Markdown" });

  const keyboard = buildTaxReceiptPromptKeyboard(installmentId);
  await ctx.reply("*¿Deseás adjuntar un comprobante?*", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
  ctx.wizard.next();
}

/**
 * Handles "No" on the "mark as paid?" prompt.
 * Shows the installment detail and leaves the scene.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handlePaidNo(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];

  const installment = await getTaxInstallmentById(installmentId);
  if (installment) {
    const [year, month] = installment.dueMonth.split("-");
    const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
    await replyOrEdit(
      ctx,
      `Acá tenés el detalle de ${installment.taxName} para ${monthLabel}\n\n`
        + buildTaxInstallmentDetailText(installment),
      { parse_mode: "Markdown" },
    );
  }

  await ctx.scene.leave();
}

/**
 * Handles "Adjuntar" on the receipt prompt.
 * Prompts the user to send the file; photo/document handlers will process it.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleAttachReceipt(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await replyOrEdit(ctx, "*Enviá la foto o PDF del comprobante de pago.*", {
    parse_mode: "Markdown",
  });
}

/**
 * Handles "Omitir" on the receipt prompt. Leaves the scene.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleSkipReceipt(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await replyOrEdit(
    ctx,
    "Listo. Podés adjuntar el comprobante luego desde el menú Impuestos.",
  );
  await ctx.scene.leave();
}

/**
 * Keeps the receipt after unmarking, confirms, and re-renders the installment detail.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleUnpayKeepReceipt(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];

  const installment = await getTaxInstallmentById(installmentId);
  if (!installment) {
    await ctx.reply("Cuota no encontrada.");
    await ctx.scene.leave();
    return;
  }

  const [year, month] = installment.dueMonth.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
  await editOrReply(
    ctx,
    `Marcaste la cuota del mes de ${monthLabel} para ${installment.taxName} como no pagada. `
    + "Conservaste el comprobante existente.",
    { parse_mode: "Markdown" },
  );

  const { text, extra } = buildTaxInstallmentDetailPayload(installment);
  await ctx.reply(text, extra);
  await ctx.scene.leave();
}

/**
 * Deletes the receipt (GCS object + Firestore field) after unmarking, confirms, and
 * re-renders the installment detail. On failure the receipt is kept and the user is
 * notified, but the flow still confirms and re-renders.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleUnpayDeleteReceipt(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];

  const installment = await getTaxInstallmentById(installmentId);
  if (!installment) {
    await ctx.reply("Cuota no encontrada.");
    await ctx.scene.leave();
    return;
  }

  let receiptDeleted = false;
  if (installment.receiptUrl) {
    try {
      await deleteFromUrl(installment.receiptUrl);
      await clearTaxReceiptUrl(installmentId);
      installment.receiptUrl = undefined;
      receiptDeleted = true;
    } catch (error) {
      log.error("Error deleting tax receipt", error, {
        module: "tax.scene",
        userId: ctx.from?.id.toString() ?? "",
      });
      await ctx.reply("❌ No se pudo borrar el comprobante. Intentá de nuevo.");
    }
  }

  const [year, month] = installment.dueMonth.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
  const receiptNote = receiptDeleted
    ? "Borraste el comprobante existente."
    : "Conservaste el comprobante existente.";
  await editOrReply(
    ctx,
    `Marcaste la cuota del mes de ${monthLabel} para ${installment.taxName} como no pagada. `
    + receiptNote,
    { parse_mode: "Markdown" },
  );

  const { text, extra } = buildTaxInstallmentDetailPayload(installment);
  await ctx.reply(text, extra);
  await ctx.scene.leave();
}

/**
 * Re-presents the prompt for the current wizard step when an unexpected file is received.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function repromptCurrentStep(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as TaxWizardState;
  await ctx.reply("No esperaba un archivo aquí.");

  switch (ctx.wizard.cursor) {
  case 0: {
    if (state.unpayDecision && state.installmentId) {
      const keyboard = buildUnpayReceiptDecisionKeyboard(state.installmentId);
      await ctx.reply(
        "El impuesto figuraba como pagado con un comprobante de pago\n*¿Qué deseas hacer con el comprobante?*",
        {
          parse_mode: "Markdown",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          reply_markup: keyboard.reply_markup as any,
        },
      );
    } else if (state.taxId && !state.selectedMonth) {
      const availableMonths = await getAvailableMonthsForTax(state.taxId);
      const monthKeyboard = buildFilteredTaxMonthKeyboard(availableMonths, state.taxId);
      await ctx.reply(
        "*¿A qué mes corresponde la cuota?*",
        {
          parse_mode: "Markdown",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          reply_markup: monthKeyboard.reply_markup as any,
        },
      );
    }
    break;
  }
  case 1:
    await ctx.reply(
      "*¿Cómo se llama el impuesto?*\n_Ej: Monotributo, AFIP, Rentas Automotor_",
      { parse_mode: "Markdown" },
    );
    break;
  case 2: {
    const pmKeyboard = buildPaymentMethodKeyboard({ callbackPrefix: "tax_pm" });
    await ctx.reply("*Seleccioná el método de pago*", {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: pmKeyboard.reply_markup as any,
    });
    break;
  }
  case 3:
    await stepGuardMonth(ctx);
    break;
  case 4: {
    const [year, month] = (state.selectedMonth ?? "").split("-");
    const monthLabel = month
      ? `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`
      : "el mes seleccionado";
    await ctx.reply(
      `*¿Cuál es el monto de la cuota para ${monthLabel}?*\n_Ej: 53136 o 53.136,74_`,
      { parse_mode: "Markdown" },
    );
    break;
  }
  case 5: {
    const selectedMonth = state.selectedMonth ?? "";
    const maxDay = selectedMonth ? getDaysInMonth(selectedMonth) : 31;
    await ctx.reply(
      `*¿Cuál es el día de vencimiento de esta cuota? (1-${maxDay})*`,
      { parse_mode: "Markdown" },
    );
    break;
  }
  case 6: {
    const installmentId = state.installmentId ?? "";
    const paidKeyboard = buildTaxPaidPromptKeyboard(installmentId);
    await ctx.reply("*¿Deseás marcar la cuota como pagada?*", {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: paidKeyboard.reply_markup as any,
    });
    break;
  }
  case EDIT_DUE_DAY_STEP: {
    const selectedMonth = state.selectedMonth ?? "";
    const maxDay = selectedMonth ? getDaysInMonth(selectedMonth) : 31;
    await ctx.reply(
      `*¿Cuál es el nuevo día de vencimiento de esta cuota? (1-${maxDay})*`,
      { parse_mode: "Markdown" },
    );
    break;
  }
  case UNPAY_DECISION_STEP: {
    const installmentId = state.installmentId ?? "";
    const keyboard = buildUnpayReceiptDecisionKeyboard(installmentId);
    await ctx.reply(
      "El impuesto figuraba como pagado con un comprobante de pago\n*¿Qué deseas hacer con el comprobante?*",
      {
        parse_mode: "Markdown",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: keyboard.reply_markup as any,
      },
    );
    break;
  }
  default:
    break;
  }
}

/**
 * Handles tax receipt photo upload while inside the tax scene.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleReceiptPhoto(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as TaxWizardState;
  const installmentId = state.installmentId ?? "";

  // Accept photo at RECEIPT_GUARD_STEP (normal post-paid flow) OR on receipt-only entry
  // (Flujo 3: installmentId pre-set, no taxId/selectedMonth — cursor stays at 0
  // because selectStep(RECEIPT_GUARD_STEP) in stepInit doesn't persist across updates reliably).
  const isReceiptOnlyEntry = !!installmentId && !state.taxId && !state.selectedMonth && !state.unpayDecision;
  if (ctx.wizard.cursor !== RECEIPT_GUARD_STEP && !isReceiptOnlyEntry) {
    await repromptCurrentStep(ctx);
    return;
  }
  const telegramUserId = ctx.from?.id.toString() ?? "";

  if (!installmentId) {
    await ctx.reply("Error: datos de sesión incompletos.");
    await ctx.scene.leave();
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const photos = (ctx.message as any).photo as Array<{ file_id: string }>;
  if (!photos || photos.length === 0) {
    await ctx.reply("No se pudo procesar la foto. Intentá de nuevo.");
    return;
  }

  const largestPhoto = photos[photos.length - 1];

  try {
    const fileLink = await ctx.telegram.getFileLink(largestPhoto.file_id);
    const fileBuffer = await downloadFile(fileLink.href);
    const mimeType = fileLink.href.includes(".png") ? "image/png" : "image/jpeg";
    const receiptUrl = await uploadTaxReceipt({ telegramUserId, installmentId, fileBuffer, mimeType });
    await saveTaxReceiptUrl(installmentId, receiptUrl);
    await ctx.reply("✅ Comprobante guardado.");
    await ctx.scene.leave();
  } catch (error) {
    log.error("Error uploading tax receipt", error, { module: "tax.scene", userId: telegramUserId });
    await ctx.reply("Error al guardar el comprobante. Intentá de nuevo.");
  }
}

/**
 * Handles tax receipt PDF/document upload while inside the tax scene.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleReceiptDocument(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as TaxWizardState;
  const installmentId = state.installmentId ?? "";

  // Same receipt-only entry check as handleReceiptPhoto.
  const isReceiptOnlyEntry = !!installmentId && !state.taxId && !state.selectedMonth && !state.unpayDecision;
  if (ctx.wizard.cursor !== RECEIPT_GUARD_STEP && !isReceiptOnlyEntry) {
    await repromptCurrentStep(ctx);
    return;
  }
  const telegramUserId = ctx.from?.id.toString() ?? "";

  if (!installmentId) {
    await ctx.reply("Error: datos de sesión incompletos.");
    await ctx.scene.leave();
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const document = (ctx.message as any).document as { file_id: string } | undefined;
  if (!document) {
    await ctx.reply("No se pudo procesar el archivo. Intentá de nuevo.");
    return;
  }

  try {
    const fileLink = await ctx.telegram.getFileLink(document.file_id);
    const fileBuffer = await downloadFile(fileLink.href);
    const receiptUrl = await uploadTaxReceipt({
      telegramUserId,
      installmentId,
      fileBuffer,
      mimeType: "application/pdf",
    });
    await saveTaxReceiptUrl(installmentId, receiptUrl);
    await ctx.reply("✅ Comprobante guardado.");
    await ctx.scene.leave();
  } catch (error) {
    log.error("Error uploading tax receipt PDF", error, { module: "tax.scene", userId: telegramUserId });
    await ctx.reply("Error al guardar el comprobante. Intentá de nuevo.");
  }
}

/**
 * Handles cancel word typed at any step of the tax wizard.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleCancelWord(ctx: KakebotContext): Promise<void> {
  await ctx.scene.leave();
  await ctx.reply("Operación cancelada.");
}

export const taxScene = new Scenes.WizardScene<KakebotContext>(
  TAX_SCENE_ID,
  stepInit,
  stepHandleName,
  stepGuardPaymentMethod,
  stepGuardMonth,
  stepHandleAmount,
  stepHandleInstallmentDueDay,
  stepGuardPaidDecision,
  stepGuardReceipt,
  stepHandleEditInstallmentDueDay,
  stepGuardUnpayDecision,
);

taxScene.hears(CANCEL_REGEX, handleCancelWord);
taxScene.action(/^tax_back_tax:(.+)$/, async (ctx, next) => {
  await ctx.scene.leave();
  return next();
});
taxScene.action(/^tax_pm:(credit_card|auto_debit|manual)$/, handlePaymentMethod);
taxScene.action(/^tax_month:(.+):(\d{4}-\d{2})$/, handleMonthSelected);
taxScene.action(/^tax_paid_yes:(.+)$/, handlePaidYes);
taxScene.action(/^tax_paid_no:(.+)$/, handlePaidNo);
taxScene.action(/^tax_attach:(.+)$/, handleAttachReceipt);
taxScene.action("tax_skip_receipt", handleSkipReceipt);
taxScene.action(/^tax_unpay_keep:(.+)$/, handleUnpayKeepReceipt);
taxScene.action(/^tax_unpay_del:(.+)$/, handleUnpayDeleteReceipt);
taxScene.on("photo", handleReceiptPhoto);
taxScene.on("document", handleReceiptDocument);
