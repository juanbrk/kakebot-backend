import { Telegraf, Markup, Context } from "telegraf";
import { KakebotContext, TaxWizardState } from "../../types/telegraf-context.types";
import { ServicePaymentMethod } from "../../types/service.types";
import { formatARS, MONTH_NAMES } from "../../helpers/format";
import { TAX_SCENE_ID } from "../scenes/tax.scene";
import { buildBreadcrumb } from "../../helpers/breadcrumb";
import { replyOrEdit } from "../../helpers/telegram";
import { log } from "../../helpers/logger";
import {
  buildPaymentMethodKeyboard,
  formatServicePaymentMethod,
} from "../../helpers/payment-method";
import {
  getTaxesByUser,
  getTaxById,
  getTaxInstallment,
  getTaxInstallmentById,
  getTaxInstallmentsByTaxId,
  markTaxInstallmentAsPaid,
  updateTaxPaymentMethod,
} from "../../services/tax.service";
import { downloadFromUrl } from "../../services/storage.service";
import {
  buildTaxesSubmenuKeyboard,
  buildTaxMisImpuestosKeyboard,
  buildTaxListKeyboard,
  buildTaxActionKeyboard,
  buildTaxEditOptionsKeyboard,
  buildTaxReceiptPromptKeyboard,
  buildTaxInstallmentHistoryKeyboard,
  buildTaxInstallmentDetailKeyboard,
  buildTaxInstallmentDetailText,
} from "../keyboards/tax";

/**
 * Registers all tax-related Telegraf handlers.
 *
 * @param {Telegraf<Context>} bot - Telegraf bot instance
 * @return {void}
 */
export function registerTaxHandler(bot: Telegraf<KakebotContext>): void {
  bot.command("impuestos", openTaxesMenu);
  bot.action("menu_impuestos", openTaxesMenu);
  bot.action("menu_mis_impuestos", handleMisImpuestos);
  bot.action("tax_add", handleAddTax);
  bot.action("tax_view", handleViewTaxes);
  bot.action("tax_list", handleListTaxes);
  bot.action(/^tax_pick:(.+)$/, handlePickTaxForAction);
  bot.action(/^tax_reg:(.+)$/, handleRegisterInstallment);
  bot.action(/^tax_pay:(.+)$/, handleMarkAsPaid);
  bot.action(/^tax_paid_no:(.+)$/, handlePaidNo);
  bot.action(/^tax_paid_yes:(.+)$/, handlePaidYes);
  bot.action(/^tax_attach:(.+)$/, handleAttachReceipt);
  bot.action("tax_skip_receipt", handleSkipReceipt);
  bot.action(/^tax_pg:(\d+)$/, handlePagination);
  bot.action(/^tax_hist:(.+)$/, handleTaxHistory);
  bot.action(/^tax_hist_pg:(.+):(\d+)$/, handleTaxHistoryPagination);
  bot.action(/^tax_inst:(.+)$/, handleTaxInstallmentDetail);
  bot.action(/^tax_dl_rec:(.+)$/, handleDownloadTaxReceipt);
  bot.action(/^tax_back_tax:(.+)$/, handleBackToTaxAction);
  bot.action(/^tax_back_hist:(.+)$/, handleBackToTaxHistory);
  bot.action(/^tax_edit_pm:(.+)$/, handleEditPaymentMethod);
  bot.action(/^tax_chg_pm:(.+)$/, handleChangePaymentMethod);
  bot.action(/^tax_update_pm:(.+):(credit_card|auto_debit|manual)$/, async (ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const match = (ctx as any).match as string[];
    const taxId = match[1];
    const method = match[2] as ServicePaymentMethod;
    await handleUpdatePaymentMethod(ctx, taxId, method);
  });
}


async function openTaxesMenu(ctx: Context): Promise<void> {
  await ctx.answerCbQuery?.();
  const text = buildBreadcrumb(["Impuestos"]) + "*¿Qué querés hacer?*";
  await replyOrEdit(ctx, text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: buildTaxesSubmenuKeyboard().reply_markup as any,
  });
}

async function handleMisImpuestos(ctx: Context): Promise<void> {
  await ctx.answerCbQuery?.();
  const text =
    buildBreadcrumb(["Impuestos", "Mis impuestos"]) + "*¿Qué querés hacer?*";
  await replyOrEdit(ctx, text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: buildTaxMisImpuestosKeyboard().reply_markup as any,
  });
}

async function handleAddTax(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    buildBreadcrumb(["Impuestos", "Registrar impuesto"])
      + "*Vas a registrar un nuevo impuesto.*\n_Escribí cancelar para salir._",
    { parse_mode: "Markdown" },
  );
  await ctx.scene.enter(TAX_SCENE_ID);
}

async function handleListTaxes(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  const taxes = await getTaxesByUser(telegramUserId);

  let body: string;
  if (taxes.length === 0) {
    body = "No tenés impuestos registrados.";
  } else {
    const lines = taxes.map(
      (tax) => `• ${tax.name} (vence el día ${tax.estimatedDueDay})`,
    );
    body = "*Tus impuestos:*\n\n" + lines.join("\n");
  }

  const text = buildBreadcrumb(["Impuestos", "Mis impuestos", "Listar"]) + body;
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        "\u2190 Volver a Mis impuestos",
        "menu_mis_impuestos",
      ),
    ],
  ]);
  await replyOrEdit(ctx, text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

async function handleViewTaxes(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  const taxes = await getTaxesByUser(telegramUserId);

  if (taxes.length === 0) {
    await replyOrEdit(
      ctx,
      buildBreadcrumb(["Impuestos", "Mis impuestos", "Seleccionar"]) +
        "*No tenés impuestos registrados. Usá 'Registrar impuesto' para crear uno.*",
      {
        parse_mode: "Markdown",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: buildTaxMisImpuestosKeyboard().reply_markup as any,
      },
    );
    return;
  }

  const text =
    buildBreadcrumb(["Impuestos", "Mis impuestos", "Seleccionar"]) +
    "*Seleccioná un impuesto*:";
  const keyboard = buildTaxListKeyboard(taxes, 0, "tax_pick");
  await replyOrEdit(ctx, text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

async function handlePickTaxForAction(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taxId = ((ctx as any).match as string[])[1];
  await showTaxActionView(ctx, taxId);
}

async function handleRegisterInstallment(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taxId = ((ctx as any).match as string[])[1];
  const tax = await getTaxById(taxId);
  const taxName = tax?.name || "";

  await ctx.editMessageText(
    buildBreadcrumb(["Impuestos", taxName, "Nueva cuota"])
      + `*Vas a registrar una nueva cuota para ${taxName}.*\n_Escribí cancelar para salir._`,
    { parse_mode: "Markdown" },
  );
  await ctx.scene.enter(TAX_SCENE_ID, { taxId, taxName } as TaxWizardState);
}

async function handlePaidNo(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];

  const installment = await getTaxInstallmentById(installmentId);
  if (!installment) {
    await ctx.reply("Error: cuota no encontrada.");
    return;
  }

  const [year, month] = installment.dueMonth.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
  const contextText = `Acá tenés el detalle de ${installment.taxName} para ${monthLabel}`;

  await ctx.editMessageText(
    contextText + "\n\n" + buildTaxInstallmentDetailText(installment),
    { parse_mode: "Markdown" },
  );

  const keyboard = buildTaxActionKeyboard({ taxId: installment.taxId });
  await ctx.reply(
    buildBreadcrumb(["Impuestos", installment.taxName]) +
      "*¿Qué querés hacer?*",
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    },
  );
}

async function handlePaidYes(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];
  await markTaxInstallmentAsPaid(installmentId);

  await ctx.editMessageText("✅ Cuota marcada como pagada.", {
    parse_mode: "Markdown",
  });

  const keyboard = buildTaxReceiptPromptKeyboard(installmentId);
  await ctx.reply("*¿Deseás adjuntar un comprobante?*", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

async function handleMarkAsPaid(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];

  await markTaxInstallmentAsPaid(installmentId);

  await ctx.editMessageText("✅ Cuota marcada como pagada.", {
    parse_mode: "Markdown",
  });

  const keyboard = buildTaxReceiptPromptKeyboard(installmentId);
  await ctx.reply("*¿Deseás adjuntar un comprobante?*", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

async function handleAttachReceipt(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];

  await ctx.editMessageText("*Enviá la foto o PDF del comprobante de pago.*", {
    parse_mode: "Markdown",
  });
  await ctx.scene.enter(TAX_SCENE_ID, { installmentId } as TaxWizardState);
}

async function handleSkipReceipt(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "Listo. Podés adjuntar el comprobante luego desde el menú Impuestos.",
  );
}

async function handlePagination(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = parseInt(((ctx as any).match as string[])[1], 10);

  const taxes = await getTaxesByUser(telegramUserId);
  const text =
    buildBreadcrumb(["Impuestos", "Mis impuestos", "Seleccionar"]) +
    "*Seleccioná un impuesto*:";
  const keyboard = buildTaxListKeyboard(taxes, page, "tax_pick");
  await replyOrEdit(ctx, text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

/**
 * Shows paginated installment history for a tax.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleTaxHistory(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taxId = ((ctx as any).match as string[])[1];

  const tax = await getTaxById(taxId);
  const taxName = tax?.name || "";

  const installments = await getTaxInstallmentsByTaxId(taxId);
  if (installments.length === 0) {
    await replyOrEdit(
      ctx,
      buildBreadcrumb(["Impuestos", taxName, "Historial"]) +
        "No hay cuotas registradas para este impuesto.",
      {
        parse_mode: "Markdown",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: buildTaxInstallmentHistoryKeyboard(installments, 0, taxId)
          .reply_markup as any,
      },
    );
    return;
  }

  const text =
    buildBreadcrumb(["Impuestos", taxName, "Historial"]) +
    "*Seleccioná una cuota:*";
  await replyOrEdit(ctx, text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: buildTaxInstallmentHistoryKeyboard(installments, 0, taxId)
      .reply_markup as any,
  });
}

/**
 * Handles pagination for the tax installment history view.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleTaxHistoryPagination(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (ctx as any).match as string[];
  const taxId = match[1];
  const page = parseInt(match[2], 10);

  const tax = await getTaxById(taxId);
  const taxName = tax?.name || "";

  const installments = await getTaxInstallmentsByTaxId(taxId);
  const text =
    buildBreadcrumb(["Impuestos", taxName, "Historial"]) +
    "*Seleccioná una cuota:*";
  await replyOrEdit(ctx, text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: buildTaxInstallmentHistoryKeyboard(installments, page, taxId)
      .reply_markup as any,
  });
}

/**
 * Shows the detail view for a single tax installment from the history.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleTaxInstallmentDetail(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];

  const installment = await getTaxInstallmentById(installmentId);
  if (!installment) {
    await ctx.reply("Cuota no encontrada.");
    return;
  }

  const taxName = installment.taxName;
  const [year, month] = installment.dueMonth.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  const text =
    buildBreadcrumb(["Impuestos", taxName, "Historial", monthLabel]) +
    buildTaxInstallmentDetailText(installment);
  const keyboard = buildTaxInstallmentDetailKeyboard({
    installmentId,
    isPaid: installment.isPaid,
    hasReceipt: !!installment.receiptUrl,
    taxId: installment.taxId,
  });
  await replyOrEdit(ctx, text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

/**
 * Downloads and sends the receipt for a tax installment.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleDownloadTaxReceipt(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];

  const installment = await getTaxInstallmentById(installmentId);
  if (!installment?.receiptUrl) {
    await ctx.reply("No hay comprobante adjunto para esta cuota.");
    return;
  }

  try {
    const { buffer, extension } = await downloadFromUrl(installment.receiptUrl);
    const [year, month] = installment.dueMonth.split("-");
    const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
    await ctx.reply(
      `Acá tenés el comprobante de pago de ${monthLabel} para ${installment.taxName}`,
    );
    const filename = `${installment.dueMonth}-comprobante-${installment.taxName}.${extension}`;
    await ctx.replyWithDocument({ source: buffer, filename });
  } catch (error) {
    log.error("Error downloading tax receipt", error, { module: "tax", action: "handleDownloadTaxReceipt" });
    await ctx.reply(
      "❌ No se pudo descargar el comprobante. Intentá de nuevo.",
    );
  }
}

/**
 * Returns to the tax action view from the installment history.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleBackToTaxAction(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taxId = ((ctx as any).match as string[])[1];
  await showTaxActionView(ctx, taxId);
}

/**
 * Returns to the installment history list from the installment detail view.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleBackToTaxHistory(ctx: Context): Promise<void> {
  await ctx.answerCbQuery?.();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taxId = ((ctx as any).match as string[])[1];

  const tax = await getTaxById(taxId);
  const taxName = tax?.name || "";

  const installments = await getTaxInstallmentsByTaxId(taxId);
  const text =
    buildBreadcrumb(["Impuestos", taxName, "Historial"]) +
    (installments.length > 0
      ? "*Seleccioná una cuota:*"
      : "No hay cuotas registradas.");
  await replyOrEdit(ctx, text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: buildTaxInstallmentHistoryKeyboard(installments, 0, taxId)
      .reply_markup as any,
  });
}

/**
 * Renders the action view for a given tax, showing the current month's installment status.
 *
 * @param {Context} ctx - Telegraf context
 * @param {string} taxId - Tax document ID
 */
async function showTaxActionView(ctx: Context, taxId: string): Promise<void> {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [tax, installment] = await Promise.all([
    getTaxById(taxId),
    getTaxInstallment(taxId, currentMonth),
  ]);

  if (!tax) {
    await ctx.reply("Impuesto no encontrado.");
    return;
  }

  const monthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;

  const dueLine = `• *Vencimiento estimado*: día ${tax.estimatedDueDay}`;
  const pmLabel = tax.paymentMethod
    ? formatServicePaymentMethod(tax.paymentMethod)
    : "No registrado";

  let cuotaLine: string;
  let estadoLine: string | null;
  if (!installment) {
    cuotaLine = `• *Cuota ${monthLabel}*: Sin registrar`;
    estadoLine = null;
  } else if (installment.isPaid) {
    cuotaLine = `• *Cuota ${monthLabel}*: ${formatARS(installment.amount)}`;
    estadoLine = "• *Estado*: ✅ Pagado";
  } else {
    cuotaLine = `• *Cuota ${monthLabel}*: ${formatARS(installment.amount)}`;
    estadoLine = "• *Estado*: Pendiente";
  }

  const details = [
    dueLine,
    cuotaLine,
    estadoLine,
    `• *Medio de pago*: ${pmLabel}`,
  ]
    .filter(Boolean)
    .join("\n");

  const text =
    buildBreadcrumb(["Impuestos", tax.name]) +
    details +
    "\n\n*¿Qué querés hacer?*";
  const keyboard = buildTaxActionKeyboard({ taxId });

  await replyOrEdit(ctx, text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}


/**
 * Shows the edit options screen for a selected tax (intermediate step before editing specific fields).
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleEditPaymentMethod(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taxId = ((ctx as any).match as string[])[1];
  const tax = await getTaxById(taxId);
  const taxName = tax?.name || "";

  const keyboard = buildTaxEditOptionsKeyboard(taxId);
  await ctx.editMessageText(
    buildBreadcrumb(["Impuestos", taxName, "Modificar"]) +
      "*¿Qué querés modificar?*",
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    },
  );
}

/**
 * Shows the payment method selection keyboard for a tax being edited.
 * Sends a context message first, then the payment method keyboard as a new message.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleChangePaymentMethod(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taxId = ((ctx as any).match as string[])[1];
  const tax = await getTaxById(taxId);
  const taxName = tax?.name || "";

  const breadcrumb = buildBreadcrumb([
    "Impuestos",
    taxName,
    "Modificar",
    "Método de pago",
  ]);

  await ctx.editMessageText(
    breadcrumb +
      `*Vas a modificar el método de pago para ${taxName}*\n_Escribí "cancelar" o "salir" para anular._`,
    { parse_mode: "Markdown" },
  );

  const keyboard = buildPaymentMethodKeyboard({
    callbackPrefix: `tax_update_pm:${taxId}`,
  });

  await ctx.reply("*¿Con qué medio de pago abonás este impuesto?*", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

/**
 * Updates the payment method of a tax and refreshes the action view.
 *
 * @param {Context} ctx - Telegraf context
 * @param {string} taxId - Tax document ID
 * @param {ServicePaymentMethod | undefined} paymentMethod - New value, or undefined to remove
 */
async function handleUpdatePaymentMethod(
  ctx: Context,
  taxId: string,
  paymentMethod: ServicePaymentMethod | undefined,
): Promise<void> {
  await ctx.answerCbQuery();
  await updateTaxPaymentMethod({ taxId, paymentMethod });
  await showTaxActionView(ctx, taxId);
}

