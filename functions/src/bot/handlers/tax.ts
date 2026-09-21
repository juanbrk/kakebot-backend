import { Telegraf, Context } from "telegraf";
import { KakebotContext, TaxWizardState } from "../../types/telegraf-context.types";
import { ServicePaymentMethod } from "../../types/service.types";
import { TaxInstallment } from "../../types/tax.types";
import {
  buildNameListText,
  escapeHtml,
  formatARS,
  formatDueDateDayMonth,
  getDaysInMonth,
  MONTH_NAMES,
} from "../../helpers/format";
import { TAX_SCENE_ID } from "../scenes/tax.scene";
import { buildBreadcrumb } from "../../helpers/breadcrumb";
import { editOrReply, replyOrEdit } from "../../helpers/telegram";
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
  unmarkTaxInstallmentAsPaid,
  updateTaxPaymentMethod,
} from "../../services/tax.service";
import { downloadFromUrl } from "../../services/storage.service";
import {
  buildTaxesSubmenuKeyboard,
  buildTaxesEmptyStateKeyboard,
  buildTaxListKeyboard,
  buildTaxActionKeyboard,
  buildTaxEditOptionsKeyboard,
  buildTaxReceiptPromptKeyboard,
  buildTaxInstallmentHistoryKeyboard,
  buildTaxInstallmentDetailText,
  buildTaxInstallmentDetailPayload,
  buildUnpayReceiptDecisionKeyboard,
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
  bot.action("tax_add", handleAddTax);
  bot.action("tax_view", handleViewTaxes);
  bot.action(/^tax_pick:(.+)$/, handlePickTaxForAction);
  bot.action(/^tax_reg:(.+)$/, handleRegisterInstallment);
  bot.action(/^tax_pay:(.+)$/, handleMarkAsPaid);
  bot.action(/^tax_unpay:(.+)$/, handleUnmarkAsPaid);
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
  bot.action(/^tax_edit_due:(.+)$/, handleEditInstallmentDueDay);
  bot.action(/^tax_update_pm:(.+):(credit_card|auto_debit|manual)$/, async (ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const match = (ctx as any).match as string[];
    const taxId = match[1];
    const method = match[2] as ServicePaymentMethod;
    await handleUpdatePaymentMethod(ctx, taxId, method);
  });
}


async function openTaxesMenu(ctx: Context): Promise<void> {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  const taxes = await getTaxesByUser(telegramUserId);
  const breadcrumb = buildBreadcrumb(["Impuestos"]);

  if (taxes.length === 0) {
    await replyOrEdit(ctx, breadcrumb + "No tenés ningún impuesto registrado.\n\n<b>¿Qué querés hacer?</b>", {
      parse_mode: "HTML",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: buildTaxesEmptyStateKeyboard().reply_markup as any,
    });
    return;
  }

  const taxList = buildNameListText(taxes.map((tax) => tax.name));
  await replyOrEdit(ctx, breadcrumb + taxList + "\n\n<b>¿Qué querés hacer?</b>", {
    parse_mode: "HTML",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: buildTaxesSubmenuKeyboard().reply_markup as any,
  });
}

async function handleAddTax(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Impuestos", "Registrar impuesto"])
      + "<b>Vas a registrar un nuevo impuesto.</b>\n<i>Escribí cancelar para salir.</i>",
    { parse_mode: "HTML" },
  );
  await ctx.scene.enter(TAX_SCENE_ID);
}

async function handleViewTaxes(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  const taxes = await getTaxesByUser(telegramUserId);

  if (taxes.length === 0) {
    await replyOrEdit(
      ctx,
      buildBreadcrumb(["Impuestos", "Seleccionar"]) +
        "<b>No tenés impuestos registrados. Usá 'Registrar impuesto' para crear uno.</b>",
      {
        parse_mode: "HTML",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: buildTaxesEmptyStateKeyboard().reply_markup as any,
      },
    );
    return;
  }

  const text =
    buildBreadcrumb(["Impuestos", "Seleccionar"]) +
    "<b>Seleccioná un impuesto</b>:";
  const keyboard = buildTaxListKeyboard(taxes, 0, "tax_pick");
  await replyOrEdit(ctx, text, {
    parse_mode: "HTML",
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

  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Impuestos", taxName, "Nueva cuota"])
      + `<b>Vas a registrar una nueva cuota para ${escapeHtml(taxName)}.</b>\n<i>Escribí cancelar para salir.</i>`,
    { parse_mode: "HTML" },
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
  const contextText = `Acá tenés el detalle de ${escapeHtml(installment.taxName)} para ${monthLabel}`;

  await replyOrEdit(
    ctx,
    contextText + "\n\n" + buildTaxInstallmentDetailText(installment),
    { parse_mode: "HTML" },
  );

  const keyboard = buildTaxActionKeyboard({ taxId: installment.taxId });
  await ctx.reply(
    buildBreadcrumb(["Impuestos", installment.taxName]) +
      "<b>¿Qué querés hacer?</b>",
    {
      parse_mode: "HTML",
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

  await editOrReply(ctx, "✅ Cuota marcada como pagada.", {
    parse_mode: "HTML",
  });

  const keyboard = buildTaxReceiptPromptKeyboard(installmentId);
  await ctx.reply("<b>¿Deseás adjuntar un comprobante?</b>", {
    parse_mode: "HTML",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

/**
 * Marks a tax installment as paid and prompts for a receipt, unless the installment
 * already carries a receipt from a previous pay→unmark→keep cycle, in which case the
 * prompt is skipped entirely.
 * Enters the tax scene at the receipt guard step so stray text/photos are
 * validated instead of falling through to the global expense parser.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleMarkAsPaid(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];

  const installment = await getTaxInstallmentById(installmentId);
  if (!installment) {
    await ctx.reply("Cuota no encontrada.");
    return;
  }

  await markTaxInstallmentAsPaid(installmentId);

  if (installment.receiptUrl) {
    await editOrReply(
      ctx,
      "✅ Cuota marcada como pagada. Ya tenías un comprobante cargado para esta cuota.",
      { parse_mode: "HTML" },
    );
    return;
  }

  await editOrReply(ctx, "✅ Cuota marcada como pagada.", {
    parse_mode: "HTML",
  });

  const keyboard = buildTaxReceiptPromptKeyboard(installmentId);
  await ctx.reply("<b>¿Deseás adjuntar un comprobante?</b>", {
    parse_mode: "HTML",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });

  await ctx.scene.enter(TAX_SCENE_ID, { installmentId } as TaxWizardState);
}

async function handleAttachReceipt(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];

  await replyOrEdit(ctx, "<b>Enviá la foto o PDF del comprobante de pago.</b>", {
    parse_mode: "HTML",
  });
  await ctx.scene.enter(TAX_SCENE_ID, { installmentId } as TaxWizardState);
}

async function handleSkipReceipt(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  await replyOrEdit(
    ctx,
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
    buildBreadcrumb(["Impuestos", "Seleccionar"]) +
    "<b>Seleccioná un impuesto</b>:";
  const keyboard = buildTaxListKeyboard(taxes, page, "tax_pick");
  await replyOrEdit(ctx, text, {
    parse_mode: "HTML",
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
        parse_mode: "HTML",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: buildTaxInstallmentHistoryKeyboard(installments, 0, taxId)
          .reply_markup as any,
      },
    );
    return;
  }

  const text =
    buildBreadcrumb(["Impuestos", taxName, "Historial"]) +
    "<b>Seleccioná una cuota:</b>";
  await replyOrEdit(ctx, text, {
    parse_mode: "HTML",
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
    "<b>Seleccioná una cuota:</b>";
  await replyOrEdit(ctx, text, {
    parse_mode: "HTML",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: buildTaxInstallmentHistoryKeyboard(installments, page, taxId)
      .reply_markup as any,
  });
}

/**
 * Renders the single-installment detail screen (breadcrumb, status, and actions).
 * Used for plain navigation into the detail view (no preceding write).
 *
 * @param {Context} ctx - Telegraf context
 * @param {TaxInstallment} installment - The installment to display
 * @return {void}
 */
async function renderTaxInstallmentDetail(
  ctx: Context,
  installment: TaxInstallment,
): Promise<void> {
  const { text, extra } = buildTaxInstallmentDetailPayload(installment);
  await replyOrEdit(ctx, text, extra);
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

  await renderTaxInstallmentDetail(ctx, installment);
}

/**
 * Reverts a paid installment to pending. If it had a receipt, shows context about the
 * invalidated payment and enters the tax scene to decide whether to keep or delete the
 * receipt (guarding stray text/photos against the global expense parser); otherwise
 * confirms and re-renders the detail immediately.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleUnmarkAsPaid(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];

  await unmarkTaxInstallmentAsPaid(installmentId);

  const installment = await getTaxInstallmentById(installmentId);
  if (!installment) {
    await ctx.reply("Cuota no encontrada.");
    return;
  }

  const [year, month] = installment.dueMonth.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  if (!installment.receiptUrl) {
    await editOrReply(
      ctx,
      `Marcaste la cuota del mes de ${monthLabel} para ${escapeHtml(installment.taxName)} como no pagada`,
      { parse_mode: "HTML" },
    );
    const { text, extra } = buildTaxInstallmentDetailPayload(installment);
    await ctx.reply(text, extra);
    return;
  }

  await editOrReply(
    ctx,
    `Estás por invalidar el pago de la cuota del mes ${monthLabel} de ${escapeHtml(installment.taxName)}`,
    { parse_mode: "HTML" },
  );

  const keyboard = buildUnpayReceiptDecisionKeyboard(installmentId);
  await ctx.reply(
    "El impuesto figuraba como pagado con un comprobante de pago\n<b>¿Qué deseas hacer con el comprobante?</b>",
    {
      parse_mode: "HTML",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    },
  );

  await ctx.scene.enter(TAX_SCENE_ID, { installmentId, unpayDecision: true } as TaxWizardState);
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
      ? "<b>Seleccioná una cuota:</b>"
      : "No hay cuotas registradas.");
  await replyOrEdit(ctx, text, {
    parse_mode: "HTML",
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
 * @param {boolean} isWriteConfirmation - True when this render confirms a write that
 *   just happened (e.g. updating the payment method); uses `editOrReply` so a failed
 *   edit falls back to a new message instead of leaving the confirmation unseen.
 */
async function showTaxActionView(
  ctx: Context,
  taxId: string,
  isWriteConfirmation = false,
): Promise<void> {
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

  const pmLabel = tax.paymentMethod
    ? formatServicePaymentMethod(tax.paymentMethod)
    : "No registrado";

  let cuotaLine: string;
  let estadoLine: string | null;
  let dueDateLine: string;
  if (!installment) {
    cuotaLine = `• <b>Cuota ${monthLabel}</b>: Sin registrar`;
    estadoLine = null;
    dueDateLine = "• <b>Vencimiento</b>: No disponible";
  } else if (installment.isPaid) {
    cuotaLine = `• <b>Cuota ${monthLabel}</b>: ${formatARS(installment.amount)}`;
    estadoLine = "• <b>Estado</b>: ✅ Pagado";
    dueDateLine = `• <b>Vencimiento</b>: ${formatDueDateDayMonth(installment.dueDate)}`;
  } else {
    cuotaLine = `• <b>Cuota ${monthLabel}</b>: ${formatARS(installment.amount)}`;
    estadoLine = "• <b>Estado</b>: Pendiente";
    dueDateLine = `• <b>Vencimiento</b>: ${formatDueDateDayMonth(installment.dueDate)}`;
  }

  const details = [
    cuotaLine,
    estadoLine,
    dueDateLine,
    `• <b>Medio de pago</b>: ${pmLabel}`,
  ]
    .filter(Boolean)
    .join("\n");

  const text =
    buildBreadcrumb(["Impuestos", tax.name]) +
    details +
    "\n\n<b>¿Qué querés hacer?</b>";
  const payableInstallmentId =
    installment && !installment.isPaid ? installment.id : undefined;
  const keyboard = buildTaxActionKeyboard({ taxId, payableInstallmentId });

  const render = isWriteConfirmation ? editOrReply : replyOrEdit;
  await render(ctx, text, {
    parse_mode: "HTML",
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
  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Impuestos", taxName, "Modificar"]) +
      "<b>¿Qué querés modificar?</b>",
    {
      parse_mode: "HTML",
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

  await replyOrEdit(
    ctx,
    breadcrumb +
      `<b>Vas a modificar el método de pago para ${escapeHtml(taxName)}</b>\n` +
      "<i>Escribí \"cancelar\" o \"salir\" para anular.</i>",
    { parse_mode: "HTML" },
  );

  const keyboard = buildPaymentMethodKeyboard({
    callbackPrefix: `tax_update_pm:${taxId}`,
  });

  await ctx.reply("<b>¿Con qué medio de pago abonás este impuesto?</b>", {
    parse_mode: "HTML",
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
  await showTaxActionView(ctx, taxId, true);
}

/**
 * Enters the tax scene to edit a single installment's due day via free-text input.
 * Sends a context message (edit) first; the scene's stepInit prompts for the new day.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleEditInstallmentDueDay(ctx: KakebotContext): Promise<void> {
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
  const maxDay = getDaysInMonth(installment.dueMonth);

  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Impuestos", taxName, "Historial", monthLabel]) +
      `<b>Vas a modificar el vencimiento de la cuota de ${monthLabel}</b>\n<i>Escribí "cancelar" para anular.</i>`,
    { parse_mode: "HTML" },
  );
  await ctx.reply(
    `<b>¿Cuál es el nuevo día de vencimiento? (1-${maxDay})</b>`,
    { parse_mode: "HTML" },
  );

  await ctx.scene.enter(TAX_SCENE_ID, {
    taxId: installment.taxId,
    taxName,
    installmentId,
    selectedMonth: installment.dueMonth,
    editDueDay: true,
  } as TaxWizardState);
}

