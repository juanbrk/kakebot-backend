import { Scenes } from "telegraf";
import { KakebotContext, TaxWizardState } from "../../types/telegraf-context.types";
import { getMessageText } from "../../helpers/wizard";
import { ServicePaymentMethod } from "../../types/service.types";
import { parseArgentineAmount } from "../../helpers/parse-amount";
import { formatARS, getDaysInMonth, MONTH_NAMES } from "../../helpers/format";
import { buildBreadcrumb } from "../../helpers/breadcrumb";
import { log } from "../../helpers/logger";
import { buildPaymentMethodKeyboard } from "../../helpers/payment-method";
import {
  buildFilteredTaxMonthKeyboard,
  buildTaxPaidPromptKeyboard,
  buildTaxReceiptPromptKeyboard,
  buildTaxInstallmentDetailText,
} from "../keyboards/tax";
import {
  createTax,
  getTaxById,
  getTaxInstallmentById,
  getTaxInstallmentsByTaxId,
  saveTaxInstallment,
  markTaxInstallmentAsPaid,
  saveTaxReceiptUrl,
} from "../../services/tax.service";
import { uploadTaxReceipt } from "../../services/storage.service";
import { downloadFile } from "../handlers/photo";

export const TAX_SCENE_ID = "tax-wizard";

const CANCEL_REGEX = /^\s*(salir|cancelar|terminar|stop)\s*$/i;

// Direct-jump targets used with ctx.wizard.selectStep().
const AMOUNT_STEP = 5;
const RECEIPT_GUARD_STEP = 7;


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
 * - Installment-month entry (taxId set, no selectedMonth): shows month selector, parks at cursor 0.
 * - Installment-only entry (taxId + selectedMonth already set): shows amount prompt, parks at AMOUNT_STEP.
 * - Full creation entry: shows intro + name prompt, advances to NAME_STEP.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepInit(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as TaxWizardState;

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
      buildBreadcrumb(["Impuestos", state.taxName ?? "", "Nueva cuota"])
        + "*¿A qué mes corresponde la cuota?*",
      {
        parse_mode: "Markdown",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: keyboard.reply_markup as any,
      },
    );
    return;
  }

  await ctx.reply(
    buildBreadcrumb(["Impuestos", "Registrar impuesto"])
      + "*Vas a registrar un nuevo impuesto*\n\n_Escribí cancelar en cualquier momento para salir._",
    { parse_mode: "Markdown" },
  );
  await ctx.reply(
    "*¿Cómo se llama el impuesto?*\n_Ej: Monotributo, AFIP, Rentas Automotor_",
    { parse_mode: "Markdown" },
  );
  ctx.wizard.next();
}

/**
 * Step 1: validates the tax name and prompts for the estimated due day.
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

  await ctx.reply(
    "*¿Qué día del mes vence aproximadamente?*\n_Ingresá un número del 1 al 31. Ej: 20_",
    { parse_mode: "Markdown" },
  );
  ctx.wizard.next();
}

/**
 * Step 2: validates the estimated due day and shows the payment method keyboard.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepHandleDay(ctx: KakebotContext): Promise<void> {
  const dayStr = getMessageText(ctx);
  const day = parseInt(dayStr ?? "", 10);

  const isValidDay = Number.isInteger(day) && day >= 1 && day <= 31;
  if (!isValidDay) {
    await ctx.reply("Día inválido. Ingresá un número entre 1 y 31.");
    return;
  }

  (ctx.wizard.state as TaxWizardState).estimatedDueDay = day;

  const keyboard = buildPaymentMethodKeyboard({ callbackPrefix: "tax_pm" });
  await ctx.reply("*Seleccioná el método de pago*", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
  ctx.wizard.next();
}

/**
 * Step 3: cursor guard — fires when user sends text while the payment method keyboard is showing.
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
 * Step 4: cursor guard — fires when user sends text while the month keyboard is showing.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function stepGuardMonth(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as TaxWizardState;
  const taxId = state.taxId ?? "";
  const taxName = state.taxName ?? "";

  await ctx.reply(
    "Elegí el mes del teclado, o escribí \"cancelar\" para anular.",
  );

  const availableMonths = await getAvailableMonthsForTax(taxId);
  const keyboard = buildFilteredTaxMonthKeyboard(availableMonths, taxId);
  await ctx.reply(
    buildBreadcrumb(["Impuestos", taxName, "Nueva cuota"]) + "*¿A qué mes corresponde la cuota?*",
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    },
  );
}

/**
 * Step 5: validates the installment amount, saves it, and shows the "mark as paid?" prompt.
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

  const taxId = state.taxId ?? "";
  const taxName = state.taxName ?? "";
  const selectedMonth = state.selectedMonth ?? "";
  const telegramUserId = ctx.from?.id.toString() ?? "";

  const hasRequiredData = taxId && taxName && selectedMonth;
  if (!hasRequiredData) {
    await ctx.reply("Error: datos de sesión incompletos.");
    await ctx.scene.leave();
    return;
  }

  const tax = await getTaxById(taxId);
  if (!tax) {
    await ctx.reply("Error: impuesto no encontrado.");
    await ctx.scene.leave();
    return;
  }

  const [year, month] = selectedMonth.split("-");
  const maxDay = getDaysInMonth(selectedMonth);
  const dueDay = Math.min(tax.estimatedDueDay, maxDay);
  const dueDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, dueDay);

  const installmentId = await saveTaxInstallment({
    telegramUserId,
    taxId,
    taxName,
    amount,
    dueDate,
    dueMonth: selectedMonth,
  });

  state.installmentId = installmentId;

  const day = String(dueDate.getDate()).padStart(2, "0");
  const mo = String(dueDate.getMonth() + 1).padStart(2, "0");
  await ctx.reply(
    `✅ *Cuota registrada*: ${taxName} ${formatARS(amount)} (vence ${day}/${mo})`,
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
  const day = state.estimatedDueDay;

  const hasRequiredData = name && typeof day === "number" && day >= 1;
  if (!hasRequiredData) {
    await ctx.reply("Error: datos de sesión incompletos.");
    await ctx.scene.leave();
    return;
  }

  const taxId = await createTax({
    telegramUserId,
    name,
    estimatedDueDay: day as number,
    paymentMethod: method,
  });

  state.taxId = taxId;
  state.paymentMethod = method;

  await ctx.editMessageText(`✅ Impuesto '${name}' creado.`);

  const availableMonths = await getAvailableMonthsForTax(taxId);

  const keyboard = buildFilteredTaxMonthKeyboard(availableMonths, taxId);
  await ctx.reply(
    buildBreadcrumb(["Impuestos", name, "Nueva cuota"]) + "*¿A qué mes corresponde la cuota?*",
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    },
  );
  ctx.wizard.next();
}

/**
 * Handles month selection during tax creation (scene step 4 → 5).
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

  await ctx.editMessageText(
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
  await ctx.editMessageText("✅ Cuota marcada como pagada.", { parse_mode: "Markdown" });

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
    await ctx.editMessageText(
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
  await ctx.editMessageText("*Enviá la foto o PDF del comprobante de pago.*", {
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
  await ctx.editMessageText(
    "Listo. Podés adjuntar el comprobante luego desde el menú Impuestos.",
  );
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
    if (state.taxId && !state.selectedMonth) {
      const availableMonths = await getAvailableMonthsForTax(state.taxId);
      const monthKeyboard = buildFilteredTaxMonthKeyboard(availableMonths, state.taxId);
      await ctx.reply(
        buildBreadcrumb(["Impuestos", state.taxName ?? "", "Nueva cuota"])
          + "*¿A qué mes corresponde la cuota?*",
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
  case 2:
    await ctx.reply(
      "*¿Qué día del mes vence aproximadamente?*\n_Ingresá un número del 1 al 31. Ej: 20_",
      { parse_mode: "Markdown" },
    );
    break;
  case 3: {
    const pmKeyboard = buildPaymentMethodKeyboard({ callbackPrefix: "tax_pm" });
    await ctx.reply("*Seleccioná el método de pago*", {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: pmKeyboard.reply_markup as any,
    });
    break;
  }
  case 4:
    await stepGuardMonth(ctx);
    break;
  case 5: {
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

  // Accept photo at step 7 (normal post-paid flow) OR on receipt-only entry
  // (Flujo 3: installmentId pre-set, no taxId/selectedMonth — cursor stays at 0
  // because selectStep(7) in stepInit doesn't persist across updates reliably).
  const isReceiptOnlyEntry = !!installmentId && !state.taxId && !state.selectedMonth;
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
  const isReceiptOnlyEntry = !!installmentId && !state.taxId && !state.selectedMonth;
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
  stepHandleDay,
  stepGuardPaymentMethod,
  stepGuardMonth,
  stepHandleAmount,
  stepGuardPaidDecision,
  stepGuardReceipt,
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
taxScene.on("photo", handleReceiptPhoto);
taxScene.on("document", handleReceiptDocument);
