import { Telegraf, Markup, Context } from "telegraf";
import { Session } from "../../types/index";
import {
  getSession,
  setSession,
  clearSession,
  emptySessionForPartial,
} from "../../services/session.service";
import { parseArgentineAmount } from "../../helpers/parse-amount";
import { formatARS, MONTH_NAMES, getDaysInMonth } from "../../helpers/format";
import { buildBreadcrumb } from "../../helpers/breadcrumb";
import { replyOrEdit } from "../../helpers/telegram";
import {
  createTax,
  getTaxesByUser,
  getTaxById,
  getTaxInstallment,
  getTaxInstallmentById,
  getTaxInstallmentsByTaxId,
  saveTaxInstallment,
  markTaxInstallmentAsPaid,
} from "../../services/tax.service";
import { downloadFromUrl } from "../../services/storage.service";
import {
  buildTaxesSubmenuKeyboard,
  buildTaxMisImpuestosKeyboard,
  buildTaxListKeyboard,
  buildTaxActionKeyboard,
  buildTaxMonthKeyboard,
  buildTaxPaidPromptKeyboard,
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
export function registerTaxHandler(bot: Telegraf<Context>): void {
  bot.command("impuestos", openTaxesMenu);
  bot.action("menu_impuestos", openTaxesMenu);
  bot.action("menu_mis_impuestos", handleMisImpuestos);
  bot.action("tax_add", handleAddTax);
  bot.action("tax_view", handleViewTaxes);
  bot.action("tax_list", handleListTaxes);
  bot.action(/^tax_pick:(.+)$/, handlePickTaxForAction);
  bot.action(/^tax_reg:(.+)$/, handleRegisterInstallment);
  bot.action(/^tax_month:(.+):(\d{4}-\d{2})$/, handleTaxMonthSelected);
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

async function handleAddTax(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "tax_awaiting_name",
  });
  await ctx.reply(
    buildBreadcrumb(["Impuestos", "Registrar impuesto"]) +
      "*Vas a Registrar un nuevo impuesto*\n\n" +
      "_Escribí cancelar en cualquier momento para salir._",
    { parse_mode: "Markdown" },
  );
  await ctx.reply(
    "¿*Cómo se llama el impuesto*?\n_Ej: Monotributo, AFIP, Rentas Automotor_",
    { parse_mode: "Markdown" },
  );
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
        "*No tenés impuestos registrados. Usá \"Registrar impuesto\" para crear uno.*",
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
  const telegramUserId = ctx.from?.id.toString() || "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taxId = ((ctx as any).match as string[])[1];
  await showTaxActionView(ctx, telegramUserId, taxId);
}

async function handleRegisterInstallment(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taxId = ((ctx as any).match as string[])[1];

  const session = await getSession(telegramUserId);
  const taxName = session?.taxName || "";

  const text =
    buildBreadcrumb(["Impuestos", taxName, "Nueva cuota"]) +
    "*¿A qué mes corresponde la cuota?*";
  const keyboard = buildTaxMonthKeyboard(taxId);
  await replyOrEdit(ctx, text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

async function handleTaxMonthSelected(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (ctx as any).match as string[];
  const taxId = match[1];
  const dueMonth = match[2];

  const currentSession = await getSession(telegramUserId);
  const taxName = currentSession?.taxName || "";
  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "tax_awaiting_amount",
    taxId,
    taxName,
    selectedMonth: dueMonth,
  });

  const [year, month] = dueMonth.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Impuestos", taxName, "Nueva cuota"])
      + `Vas a registrar una nueva cuota para *${taxName}*\nMes: *${monthLabel}*`,
    { parse_mode: "Markdown" },
  );

  await ctx.reply(
    `*¿Cuál es el monto de la cuota para ${monthLabel}?*\n` +
      "_Ej: 53136 o 53.136,74_",
    { parse_mode: "Markdown" },
  );
}

async function handlePaidNo(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
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

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    taxId: installment.taxId,
    taxName: installment.taxName,
  });

  const keyboard = buildTaxActionKeyboard({
    taxId: installment.taxId,
    hasInstallment: true,
    isPaid: false,
    installmentId: installment.id,
  });
  await ctx.reply(
    buildBreadcrumb(["Impuestos", installment.taxName]) + "*¿Qué querés hacer?*",
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

  await ctx.editMessageText("✅ Cuota marcada como pagada.", { parse_mode: "Markdown" });

  const keyboard = buildTaxReceiptPromptKeyboard(installmentId);
  await ctx.reply(
    "*¿Deseás adjuntar un comprobante?*",
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    },
  );
}

async function handleMarkAsPaid(ctx: Context): Promise<void> {
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
}

async function handleAttachReceipt(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "tax_awaiting_receipt",
    taxInstallmentId: installmentId,
  });

  await ctx.editMessageText("*Enviá la foto o PDF del comprobante de pago.*", {
    parse_mode: "Markdown",
  });
}

async function handleSkipReceipt(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  await clearSession(telegramUserId);
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
  const telegramUserId = ctx.from?.id.toString() || "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taxId = ((ctx as any).match as string[])[1];

  const session = await getSession(telegramUserId);
  const taxName = session?.taxName || "";

  const installments = await getTaxInstallmentsByTaxId(taxId);
  if (installments.length === 0) {
    await replyOrEdit(
      ctx,
      buildBreadcrumb(["Impuestos", taxName, "Historial"])
        + "No hay cuotas registradas para este impuesto.",
      {
        parse_mode: "Markdown",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: buildTaxInstallmentHistoryKeyboard(installments, 0, taxId).reply_markup as any,
      },
    );
    return;
  }

  const text =
    buildBreadcrumb(["Impuestos", taxName, "Historial"])
    + "*Seleccioná una cuota:*";
  await replyOrEdit(ctx, text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: buildTaxInstallmentHistoryKeyboard(installments, 0, taxId).reply_markup as any,
  });
}

/**
 * Handles pagination for the tax installment history view.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleTaxHistoryPagination(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (ctx as any).match as string[];
  const taxId = match[1];
  const page = parseInt(match[2], 10);

  const session = await getSession(telegramUserId);
  const taxName = session?.taxName || "";

  const installments = await getTaxInstallmentsByTaxId(taxId);
  const text =
    buildBreadcrumb(["Impuestos", taxName, "Historial"])
    + "*Seleccioná una cuota:*";
  await replyOrEdit(ctx, text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: buildTaxInstallmentHistoryKeyboard(installments, page, taxId).reply_markup as any,
  });
}

/**
 * Shows the detail view for a single tax installment from the history.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleTaxInstallmentDetail(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];

  const installment = await getTaxInstallmentById(installmentId);
  if (!installment) {
    await ctx.reply("Cuota no encontrada.");
    return;
  }

  const session = await getSession(telegramUserId);
  const taxName = session?.taxName || installment.taxName;
  const [year, month] = installment.dueMonth.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  const text =
    buildBreadcrumb(["Impuestos", taxName, "Historial", monthLabel])
    + buildTaxInstallmentDetailText(installment);
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
    console.error("[handleDownloadTaxReceipt] Error:", error);
    await ctx.reply("❌ No se pudo descargar el comprobante. Intentá de nuevo.");
  }
}

/**
 * Returns to the tax action view from the installment history.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleBackToTaxAction(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taxId = ((ctx as any).match as string[])[1];
  await showTaxActionView(ctx, telegramUserId, taxId);
}

/**
 * Returns to the installment history list from the installment detail view.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleBackToTaxHistory(ctx: Context): Promise<void> {
  await ctx.answerCbQuery?.();
  const telegramUserId = ctx.from?.id.toString() || "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taxId = ((ctx as any).match as string[])[1];

  const session = await getSession(telegramUserId);
  const taxName = session?.taxName || "";

  const installments = await getTaxInstallmentsByTaxId(taxId);
  const text =
    buildBreadcrumb(["Impuestos", taxName, "Historial"])
    + (installments.length > 0 ? "*Seleccioná una cuota:*" : "No hay cuotas registradas.");
  await replyOrEdit(ctx, text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: buildTaxInstallmentHistoryKeyboard(installments, 0, taxId).reply_markup as any,
  });
}

/**
 * Renders the action view for a given tax, showing the current month's installment status.
 * Stores taxId and taxName in session for downstream handlers.
 *
 * @param {Context} ctx - Telegraf context
 * @param {string} telegramUserId - User's Telegram ID
 * @param {string} taxId - Tax document ID
 */
async function showTaxActionView(
  ctx: Context,
  telegramUserId: string,
  taxId: string,
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

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    taxId,
    taxName: tax.name,
  });

  const monthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  const hasInstallment = !!installment;
  const isPaid = installment?.isPaid ?? false;

  let statusText: string;
  if (!installment) {
    statusText = `Sin cuota registrada para ${monthLabel}.`;
  } else if (installment.isPaid) {
    statusText = `*Cuota ${monthLabel}*: ${formatARS(installment.amount)}\n*Estado*: ✅ Pagado`;
  } else {
    statusText = `*Cuota ${monthLabel}*: ${formatARS(installment.amount)}\n*Estado*: Pendiente`;
  }

  const text = buildBreadcrumb(["Impuestos", tax.name]) + statusText + "\n\n*¿Qué querés hacer?*";
  const keyboard = buildTaxActionKeyboard({
    taxId,
    hasInstallment,
    isPaid,
    installmentId: installment?.id,
  });

  await replyOrEdit(ctx, text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

// ---------------------------------------------------------------------------
// Text handlers — exported for use in bot/handlers/text.ts dispatcher
// ---------------------------------------------------------------------------

/**
 * Handles tax name input during tax creation flow (state: tax_awaiting_name).
 *
 * @param {Context} ctx - Telegraf context
 * @param {string} telegramUserId - User's Telegram ID
 * @param {string} messageText - Raw message text from the user
 */
export async function handleTaxName(
  ctx: Context,
  telegramUserId: string,
  messageText: string,
): Promise<void> {
  const name = messageText.trim();
  const hasValidName = name.length > 0;
  if (!hasValidName) {
    await ctx.reply("El nombre no puede estar vacío.");
    return;
  }

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "tax_awaiting_day",
    partialDescription: name,
  });

  await ctx.reply(
    "*¿Qué día del mes vence aproximadamente?*\n" +
      "_Ingresá un número del 1 al 31. Ej: 20_",
    { parse_mode: "Markdown" },
  );
}

/**
 * Handles estimated due day input during tax creation flow (state: tax_awaiting_day).
 * Creates the Tax document in Firestore and prompts for the first installment.
 */
export async function handleTaxDay({
  ctx,
  session,
  telegramUserId,
  messageText,
}: {
  ctx: Context;
  session: Session;
  telegramUserId: string;
  messageText: string;
}): Promise<void> {
  const dayStr = messageText.trim();
  const day = parseInt(dayStr, 10);

  const isValidDay = Number.isInteger(day) && day >= 1 && day <= 31;
  if (!isValidDay) {
    await ctx.reply("Día inválido. Ingresá un número entre 1 y 31.");
    return;
  }

  const name = session.partialDescription || "";
  const taxId = await createTax(telegramUserId, name, day);

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    taxId,
    taxName: name,
  });

  const keyboard = buildTaxMonthKeyboard(taxId);
  await ctx.reply(
    `✅ Impuesto '${name}' creado.\n*¿Para qué mes querés registrar la primera cuota?*`,
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    },
  );
}

/**
 * Handles installment amount input during registration flow (state: tax_awaiting_amount).
 * Fetches the tax to get estimatedDueDay, saves the installment, and prompts whether to mark as paid.
 */
export async function handleTaxAmount({
  ctx,
  session,
  telegramUserId,
  messageText,
}: {
  ctx: Context;
  session: Session;
  telegramUserId: string;
  messageText: string;
}): Promise<void> {
  const amount = parseArgentineAmount(messageText.trim());

  const isValidAmount = amount !== null && amount > 0;
  if (!isValidAmount) {
    await ctx.reply(
      "No entendí el monto. Ingresá solo el número:\nEj: 5000 o 53.136,74",
    );
    return;
  }

  const taxId = session.taxId || "";
  const taxName = session.taxName || "";
  const selectedMonth = session.selectedMonth || "";

  const hasRequiredSessionData = taxId && taxName && selectedMonth;
  if (!hasRequiredSessionData) {
    await ctx.reply("Error: datos de sesión incompletos.");
    return;
  }

  const tax = await getTaxById(taxId);
  if (!tax) {
    await ctx.reply("Error: impuesto no encontrado.");
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
  await clearSession(telegramUserId);

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
}
