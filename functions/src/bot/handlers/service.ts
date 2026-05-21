import { Telegraf, Context, Markup } from "telegraf";
import { ServiceInstallment, ServicePaymentMethod } from "../../types/service.types";
import { ShowInstallmentDetailParams, RenderInstallmentsListParams } from "../../types/handlers.types";
import {
  getSession,
  setSession,
  clearSession,
  emptySessionForPartial,
} from "../../services/session.service";
import {
  getServicesByUser,
  getServiceById,
  getInstallment,
  getInstallmentById,
  getInstallmentsByService,
  getInstallmentsForMonth,
  replaceInstallment,
  deleteService,
  markInstallmentAsPaid,
  getUpcomingUnpaidInstallments,
  updateServicePaymentMethod,
} from "../../services/service.service";
import {
  buildServicesSubmenuKeyboard,
  buildMyServicesSubmenuKeyboard,
  buildServiceListKeyboard,
  buildServiceActionKeyboard,
  buildServiceEditKeyboard,
  buildDeleteConfirmKeyboard,
  buildServiceViewText,
  buildInstallmentDetailText,
  buildInstallmentDetailKeyboard,
  buildReceiptPromptKeyboard,
  buildInstallmentListKeyboard,
  buildFilteredMonthKeyboard,
  buildPaymentMethodKeyboard,
  PAYMENT_METHOD_LABELS,
  INSTALLMENTS_PER_PAGE,
} from "../keyboards/service";
import { formatARS, getDaysInMonth, MONTH_NAMES } from "../../helpers/format";
import { replyOrEdit } from "../../helpers/telegram";
import { downloadFromUrl } from "../../services/storage.service";
import { buildBreadcrumb } from "../../helpers/breadcrumb";
import { getMonthLabel } from "./invoice";

/**
 * Gets the service name from session cache, falling back to Firestore.
 *
 * @param {string} telegramUserId - User's Telegram ID
 * @param {string} serviceId - Service document ID
 * @return {string | null} Service name, or null if not found
 */
async function getServiceNameCached(
  telegramUserId: string,
  serviceId: string,
): Promise<string | null> {
  const session = await getSession(telegramUserId);
  if (session?.serviceId === serviceId && session?.serviceName) {
    return session.serviceName;
  }
  const service = await getServiceById(serviceId);
  return service?.name || null;
}

/**
 * Renders the service action view (detail + action keyboard) for a given service.
 * Fetches service and current-month installment, then edits/replies with the result.
 *
 * @param {Context} ctx - Telegraf context
 * @param {string} serviceId - Service document ID
 */
async function showServiceActionView(
  ctx: Context,
  serviceId: string,
): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  const now = new Date();
  const monthStr = String(now.getMonth() + 1).padStart(2, "0");
  const dueMonth = `${now.getFullYear()}-${monthStr}`;

  const [service, installment] = await Promise.all([
    getServiceById(serviceId),
    getInstallment(serviceId, dueMonth),
  ]);

  if (!service) {
    await replyOrEdit(ctx, "Servicio no encontrado.");
    return;
  }

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    serviceId,
    serviceName: service.name,
  });

  let title = `*${service.name}*`;
  if (installment) {
    const dueDate = installment.dueDate.toDate();
    const day = String(dueDate.getDate()).padStart(2, "0");
    const mo = String(dueDate.getMonth() + 1).padStart(2, "0");
    const dueSuffix = installment.isPaid
      ? "(Pagado) ✅"
      : `(vence ${day}/${mo})`;
    title = `*${service.name}* ${formatARS(installment.amount)} ${dueSuffix}`;
  }
  if (service.paymentMethod) {
    title += `\n*Método de pago*: ${PAYMENT_METHOD_LABELS[service.paymentMethod]}`;
  }

  const breadcrumb = buildBreadcrumb(["Servicios", service.name]);
  const hasInstallment = installment !== null;
  const isPaid = installment?.isPaid ?? false;
  const keyboard = buildServiceActionKeyboard(
    serviceId,
    hasInstallment,
    isPaid,
  );

  await replyOrEdit(ctx, breadcrumb + title, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

export function registerServiceHandler(bot: Telegraf<Context>): void {
  bot.command("servicios", openServicesMenu);
  bot.action("menu_servicios", openServicesMenu);

  bot.action("svc_add", handleAddService);
  bot.action("svc_installment", handleRegisterInstallment);
  bot.action("svc_view", handleViewServices);
  bot.action("svc_my_services", handleMyServices);
  bot.action("svc_list", handleListServices);
  bot.action("svc_upcoming", handleShowUpcoming);
  bot.action("svc_back", handleBackToMenu);
  bot.action("svc_no_cuota", handleSkipInstallmentAfterCreate);

  bot.action(/^svc_pick:(.+)$/, handlePickServiceForInstallment);
  bot.action(/^svc_view_pick:(.+)$/, handlePickServiceForAction);
  bot.action(/^svc_month:(.+):(\d{4}-\d{2})$/, handleMonthSelected);

  bot.action("svc_skip", handleSkipDuplicate);
  bot.action(/^svc_replace:(.+)$/, handleReplaceDuplicate);

  bot.action(/^svc_edit:(.+)$/, handleEditService);
  bot.action(/^svc_reg:(.+)$/, handleRegFromEdit);
  bot.action(/^svc_edit_cuota:(.+)$/, handleEditInstallment);
  bot.action(/^svc_edit_name:(.+)$/, handleEditServiceName);
  bot.action(/^svc_delete:(.+)$/, handleDeleteService);
  bot.action(/^svc_delete_yes:(.+)$/, handleConfirmDelete);

  bot.action(/^svc_pay:(.+)$/, handleMarkAsPaid);
  bot.action(/^svc_pay_from:(.+)$/, handleMarkAsPaidFromService);

  bot.action(/^svc_attach:(.+)$/, handleAttachReceipt);
  bot.action("svc_skip_receipt", handleSkipReceipt);

  bot.action(/^svc_attach_inv:(.+)$/, handleAttachInvoice);
  bot.action("svc_skip_invoice", handleSkipInvoice);

  bot.action(/^svc_edit_amt:(.+)$/, handleEditInstallmentAmount);
  bot.action(/^svc_edit_day:(.+)$/, handleEditInstallmentDay);

  bot.action(/^svc_pg:(\d+)$/, handlePagination);

  bot.action(/^svc_cuotas:(.+)$/, handleInstallmentsList);
  bot.action(/^svc_cuotas_pg:(.+):(\d+)$/, handleInstallmentsListPagination);
  bot.action(/^svc_cuota_detail:(.+)$/, handleInstallmentDetailFromHistory);
  bot.action(/^svc_back_svc:(.+)$/, handleBackToServiceAction);

  bot.action(/^svc_pm_new:([^:]+):([^:]+)$/, handleSetPaymentMethod);
  bot.action(/^svc_edit_pm:(.+)$/, handleEditPaymentMethod);
  bot.action(/^svc_pm_edit:([^:]+):([^:]+)$/, handleUpdatePaymentMethod);

  bot.action(/^svc_dl_inv:(.+)$/, handleDownloadInvoice);
  bot.action(/^svc_dl_rec:(.+)$/, handleDownloadReceipt);
}

async function openServicesMenu(ctx: Context): Promise<void> {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  const breadcrumb = buildBreadcrumb(["Servicios"]);
  await replyOrEdit(ctx, breadcrumb + "*Selecciona una opción*", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: buildServicesSubmenuKeyboard().reply_markup as any,
  });
}

async function handleAddService(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "svc_awaiting_name",
  });

  await ctx.editMessageText(
    "*Vas a crear un nuevo servicio*\n" +
      "_Escribí cancelar en cualquier momento para salir._",
    { parse_mode: "Markdown" },
  );

  await ctx.reply(
    "*¿Cómo se llama el servicio?*\nEj: Expensas, Gas, Flow, Netflix",
    { parse_mode: "Markdown" },
  );
}

async function handleRegisterInstallment(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const services = await getServicesByUser(telegramUserId);

  if (services.length === 0) {
    await replyOrEdit(
      ctx,
      "No hay servicios registrados.\nUsa 'Añadir servicio' primero.",
    );
    return;
  }

  const keyboard = buildServiceListKeyboard(services, 0, "svc_pick");
  await replyOrEdit(ctx, "Seleccioná un servicio:", keyboard);
}

async function handleViewServices(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const services = await getServicesByUser(telegramUserId);

  if (services.length === 0) {
    await replyOrEdit(ctx, "No hay servicios registrados.");
    return;
  }

  const breadcrumb = buildBreadcrumb(["Servicios", "Selección"]);
  const keyboard = buildServiceListKeyboard(services, 0, "svc_view_pick");
  await replyOrEdit(ctx, breadcrumb + "*Seleccioná un servicio:*", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

async function handleListServices(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const services = await getServicesByUser(telegramUserId);

  if (services.length === 0) {
    await replyOrEdit(ctx, "No hay servicios registrados.");
    return;
  }

  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const dueMonth = `${now.getFullYear()}-${month}`;

  const monthInstallments = await getInstallmentsForMonth(telegramUserId, dueMonth);
  const installmentsByServiceId: Record<string, ServiceInstallment | null> = {};
  for (const installment of monthInstallments) {
    installmentsByServiceId[installment.serviceId] = installment;
  }

  const breadcrumb = buildBreadcrumb(["Servicios", "Listar servicios"]);

  const backKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback("\u2190 Volver", "svc_my_services")],
  ]);

  const text =
    breadcrumb + buildServiceViewText(services, installmentsByServiceId, now);
  await replyOrEdit(ctx, text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: backKeyboard.reply_markup as any,
  });
}

/**
 * Shows  "Mis servicios" submenu with list and upcoming options.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleMyServices(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const breadcrumb = buildBreadcrumb(["Servicios", "Mis servicios"]);
  await replyOrEdit(ctx, breadcrumb + "*Selecciona una opción*", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: buildMyServicesSubmenuKeyboard().reply_markup as any,
  });
}

/**
 * Shows upcoming unpaid installments for the next 7 days, grouped into
 * three bands: 1-3 days, 4-5 days, and 6-7 days.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleShowUpcoming(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const installments = await getUpcomingUnpaidInstallments(telegramUserId, 7);

  const breadcrumb = buildBreadcrumb(["Servicios", "Próximos vencimientos"]);
  const backKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback("\u2190 Volver", "svc_my_services")],
  ]);

  if (installments.length === 0) {
    await replyOrEdit(
      ctx,
      breadcrumb + "*Sin vencimientos en los próximos 7 días*",
      {
        parse_mode: "Markdown",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: backKeyboard.reply_markup as any,
      },
    );
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff3 = new Date(today);
  cutoff3.setDate(cutoff3.getDate() + 3);
  const cutoff5 = new Date(today);
  cutoff5.setDate(cutoff5.getDate() + 5);

  const groups: Record<string, ServiceInstallment[]> = {
    "3": [],
    "5": [],
    "7": [],
  };
  for (const inst of installments) {
    const due = inst.dueDate.toDate();
    if (due <= cutoff3) groups["3"].push(inst);
    else if (due <= cutoff5) groups["5"].push(inst);
    else groups["7"].push(inst);
  }

  const lines: string[] = [breadcrumb];

  const bands: Array<[string, ServiceInstallment[]]> = [
    ["3", groups["3"]],
    ["5", groups["5"]],
    ["7", groups["7"]],
  ];

  for (const [days, items] of bands) {
    if (items.length === 0) continue;
    lines.push(`*Vencimientos en los próximos ${days} días:*`);
    for (const inst of items) {
      const dueDate = inst.dueDate.toDate();
      const day = String(dueDate.getDate()).padStart(2, "0");
      const instMonth = String(dueDate.getMonth() + 1).padStart(2, "0");
      lines.push(
        `  • ${inst.serviceName}  ${day}/${instMonth}  ${formatARS(inst.amount)}`,
      );
    }
    lines.push("");
  }

  await replyOrEdit(ctx, lines.join("\n").trimEnd(), {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: backKeyboard.reply_markup as any,
  });
}

async function handlePickServiceForAction(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];
  await ctx.answerCbQuery();
  await showServiceActionView(ctx, serviceId);
}

async function handleBackToMenu(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  await openServicesMenu(ctx);
}

async function handlePickServiceForInstallment(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  const service = await getServiceById(serviceId);
  if (!service) {
    await replyOrEdit(ctx, "Servicio no encontrado.");
    return;
  }

  const existingInstallments = await getInstallmentsByService(
    serviceId,
    telegramUserId,
  );
  const existingMonths = new Set(
    existingInstallments.map((inst) => inst.dueMonth),
  );

  const now = new Date();
  const availableMonths: string[] = [];
  for (let i = 0; i < 3; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const dueMonth = `${date.getFullYear()}-${month}`;
    if (!existingMonths.has(dueMonth)) {
      availableMonths.push(dueMonth);
    }
  }

  if (availableMonths.length === 0) {
    await replyOrEdit(
      ctx,
      "No hay meses disponibles para crear cuotas.\n" +
        "Ya tenés cuotas registradas para los próximos 3 meses.",
    );
    return;
  }

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "svc_awaiting_amount",
    serviceId,
    serviceName: service.name,
  });

  await ctx.editMessageText(
    `*Vas a agregar una nueva cuota para ${service.name}*\n` +
      "_Escribí cancelar en cualquier momento para salir._",
    { parse_mode: "Markdown" },
  );

  const keyboard = buildFilteredMonthKeyboard(availableMonths, serviceId);
  await ctx.reply(`*Seleccioná el mes para ${service.name}:*`, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

async function handleMonthSelected(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (ctx as any).match as string[];
  const serviceId = match[1];
  const dueMonth = match[2];
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  const session = await getSession(telegramUserId);
  if (!session) {
    await replyOrEdit(ctx, "Error: sesión perdida.");
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "svc_awaiting_day",
    serviceId,
    selectedMonth: dueMonth,
  });

  const maxDay = getDaysInMonth(dueMonth);
  await replyOrEdit(
    ctx,
    `*¿Qué día de ${getMonthLabel(dueMonth, true)} vence el servicio? (1-${maxDay})*`,
    {
      parse_mode: "Markdown",
    },
  );
}

async function handleSkipDuplicate(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();
  await clearSession(telegramUserId);
  await ctx.editMessageText("Registro de cuota omitido.");
}

async function handleReplaceDuplicate(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  const session = await getSession(telegramUserId);
  const hasRequiredSessionData =
    session && session.selectedMonth && session.partialAmount;
  if (!hasRequiredSessionData) {
    await ctx.editMessageText("Error: datos de sesión incompletos.");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const amount = session.partialAmount!;
  const dayStr = (session.partialDescription || "").trim();
  const day = parseInt(dayStr, 10);

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const selectedMonth = session.selectedMonth!;
  const maxDay = getDaysInMonth(selectedMonth);
  const isValidDay = Number.isInteger(day) && day >= 1 && day <= maxDay;
  if (!isValidDay) {
    await ctx.editMessageText(
      `Día inválido. Ingresá un número entre 1 y ${maxDay}.`,
    );
    return;
  }

  const [year, month] = selectedMonth.split("-");
  const dueDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, day);

  await replaceInstallment(installmentId, amount, dueDate);
  await clearSession(telegramUserId);

  const serviceName = session.serviceName || "";
  const day2 = String(dueDate.getDate()).padStart(2, "0");
  const month2 = String(dueDate.getMonth() + 1).padStart(2, "0");

  await ctx.editMessageText(
    `✅ Cuota reemplazada: ${serviceName} ${formatARS(amount)} (vence ${day2}/${month2})`,
  );
}

async function handleEditService(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  const serviceName = await getServiceNameCached(telegramUserId, serviceId);
  if (!serviceName) {
    await replyOrEdit(ctx, "Servicio no encontrado.");
    return;
  }

  const breadcrumb = buildBreadcrumb(["Servicios", serviceName, "Modificar"]);
  const keyboard = buildServiceEditKeyboard(serviceId, serviceName);
  await replyOrEdit(
    ctx,
    breadcrumb + `¿Qué deseas hacer con *${serviceName}*?`,
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    },
  );
}

async function handleRegFromEdit(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  const serviceName = await getServiceNameCached(telegramUserId, serviceId);
  if (!serviceName) {
    await replyOrEdit(ctx, "Servicio no encontrado.");
    return;
  }

  const existingInstallments = await getInstallmentsByService(
    serviceId,
    telegramUserId,
  );
  const existingMonths = new Set(
    existingInstallments.map((inst) => inst.dueMonth),
  );

  const now = new Date();
  const availableMonths: string[] = [];
  for (let i = 0; i < 3; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const dueMonth = `${date.getFullYear()}-${month}`;
    if (!existingMonths.has(dueMonth)) {
      availableMonths.push(dueMonth);
    }
  }

  if (availableMonths.length === 0) {
    await replyOrEdit(
      ctx,
      "No hay meses disponibles para crear cuotas.\n" +
        "Ya tenés cuotas registradas para los próximos 3 meses.",
    );
    return;
  }

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "svc_awaiting_amount",
    serviceId,
    serviceName,
  });

  await ctx.editMessageText(
    `*Vas a agregar una nueva cuota para ${serviceName}*\n` +
      "_Escribí cancelar en cualquier momento para salir._",
    { parse_mode: "Markdown" },
  );

  const keyboard = buildFilteredMonthKeyboard(availableMonths, serviceId);
  await ctx.reply(
    "*Seleccioná el mes de la nueva cuota.*\n" +
      "Podés crear cuotas solo para meses que aún no tengan una.",
    { parse_mode: "Markdown", ...keyboard },
  );
}

async function handleEditInstallment(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  const serviceName = await getServiceNameCached(telegramUserId, serviceId);
  if (!serviceName) {
    await replyOrEdit(ctx, "Servicio no encontrado.");
    return;
  }

  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const dueMonth = `${now.getFullYear()}-${month}`;

  const installment = await getInstallment(serviceId, dueMonth);
  if (!installment) {
    await replyOrEdit(
      ctx,
      `No hay cuota registrada para ${serviceName} este mes.`,
    );
    return;
  }

  const breadcrumb = buildBreadcrumb([
    "Servicios",
    serviceName,
    "Cuota detalle",
  ]);
  const text = buildInstallmentDetailText(installment);
  const hasReceipt = !!installment.receiptUrl;
  const hasInvoice = !!installment.invoiceUrl;
  const keyboard = buildInstallmentDetailKeyboard({
    installmentId: installment.id || "",
    isPaid: installment.isPaid,
    hasReceipt,
    hasInvoice,
    backCallback: `svc_back_svc:${serviceId}`,
    backLabel: `\u2190 Volver a ${serviceName}`,
  });
  await replyOrEdit(ctx, breadcrumb + text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

async function handleMarkAsPaid(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];

  await ctx.answerCbQuery();
  await markInstallmentAsPaid(installmentId);

  const keyboard = buildReceiptPromptKeyboard(installmentId);
  await ctx.editMessageText(
    "✅ Cuota marcada como pagada. ¿Deseas adjuntar comprobante?",
    keyboard,
  );
}

async function handleMarkAsPaidFromService(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];

  await ctx.answerCbQuery();

  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const dueMonth = `${now.getFullYear()}-${month}`;

  const installment = await getInstallment(serviceId, dueMonth);
  if (!installment) {
    await ctx.editMessageText("No hay cuota registrada para este mes.");
    return;
  }

  await markInstallmentAsPaid(installment.id || "");

  const keyboard = buildReceiptPromptKeyboard(installment.id || "");
  await ctx.editMessageText(
    "✅ Cuota marcada como pagada. ¿Deseas adjuntar comprobante?",
    keyboard,
  );
}

async function handleAttachReceipt(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "svc_awaiting_receipt",
    installmentId,
  });

  await ctx.editMessageText(
    "*Adjuntar comprobante*\n" +
      "_Escribí cancelar en cualquier momento para salir._",
    { parse_mode: "Markdown" },
  );

  await ctx.reply("*Enviá la foto o PDF del comprobante.*", {
    parse_mode: "Markdown",
  });
}

async function handleSkipReceipt(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();
  await clearSession(telegramUserId);
  await ctx.editMessageText(
    "Podes adjuntar el comprobante luego desde /servicios.",
  );
}

async function handleAttachInvoice(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "svc_awaiting_invoice",
    installmentId,
  });

  await ctx.editMessageText(
    "*Adjuntar factura*\n" +
      "_Escribí cancelar en cualquier momento para salir._",
    { parse_mode: "Markdown" },
  );

  await ctx.reply("*Enviá la foto o PDF de la factura.*", {
    parse_mode: "Markdown",
  });
}

async function handleSkipInvoice(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();
  await clearSession(telegramUserId);
  await ctx.editMessageText(
    "Podes adjuntar la factura luego desde /servicios.",
  );
}

async function handleSkipInstallmentAfterCreate(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const session = await getSession(telegramUserId);
  const serviceName = session?.serviceName || "servicio";
  await clearSession(telegramUserId);

  await ctx.editMessageText(
    `✅ Servicio '${serviceName}' creado sin cuota. Podés agregarla luego desde /servicios`
  );
}

async function handleEditServiceName(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";
  const serviceName = await getServiceNameCached(telegramUserId, serviceId);

  await ctx.answerCbQuery();

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "svc_awaiting_edit_name",
    serviceId,
  });

  await ctx.editMessageText(
    `*Vas a cambiar el nombre de ${serviceName}*\n
      "_Escribí cancelar en cualquier momento para salir._`,
    { parse_mode: "Markdown" },
  );

  await ctx.reply("*¿Cuál es el nuevo nombre del servicio?*", {
    parse_mode: "Markdown",
  });
}

async function handleDeleteService(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  const serviceName = await getServiceNameCached(telegramUserId, serviceId);
  if (!serviceName) {
    await ctx.editMessageText("Servicio no encontrado.");
    return;
  }

  const breadcrumb = buildBreadcrumb(["Servicios", serviceName, "Eliminar"]);
  const keyboard = buildDeleteConfirmKeyboard(serviceId);
  await ctx.editMessageText(
    breadcrumb + `*¿Eliminar ${serviceName}?*\nSe borrarán todas sus cuotas.`,
    { parse_mode: "Markdown", ...keyboard },
  );
}

async function handleConfirmDelete(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  const serviceName = await getServiceNameCached(telegramUserId, serviceId);
  if (serviceName) {
    await deleteService(serviceId);
    await clearSession(telegramUserId);
    await ctx.editMessageText(`✅ Servicio '${serviceName}' eliminado.`);
  }
}

async function handleEditInstallmentAmount(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "svc_awaiting_edit_amount",
    installmentId,
  });

  await ctx.editMessageText(
    "*Modificar monto*\n" +
      "_Escribí cancelar en cualquier momento para salir._",
    { parse_mode: "Markdown" },
  );

  await ctx.reply("*¿Cuál es el nuevo monto?*", { parse_mode: "Markdown" });
}

async function handleEditInstallmentDay(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  const installment = await getInstallmentById(installmentId);
  const selectedMonth = installment?.dueMonth || "";

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "svc_awaiting_edit_day",
    installmentId,
    selectedMonth,
  });

  await ctx.editMessageText(
    "*Cambiar vencimiento*\n" +
      "_Escribí cancelar en cualquier momento para salir._",
    { parse_mode: "Markdown" },
  );

  await ctx.reply("*¿Cuál es el nuevo día de vencimiento? (1-31)*", {
    parse_mode: "Markdown",
  });
}

async function handlePagination(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = parseInt(((ctx as any).match as string[])[1], 10);
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  const services = await getServicesByUser(telegramUserId);
  const breadcrumb = buildBreadcrumb(["Servicios", "Selección"]);
  const keyboard = buildServiceListKeyboard(services, page, "svc_view_pick");

  await ctx.editMessageText(breadcrumb + "*Seleccioná un servicio:*", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

export async function showInstallmentDetail({
  ctx,
  installmentId,
  backLabel = "Volver al historial",
  breadcrumbSegments = [],
}: ShowInstallmentDetailParams): Promise<void> {
  const installment = await getInstallmentById(installmentId);
  if (!installment) {
    await replyOrEdit(ctx, "No se encontró la cuota.");
    return;
  }

  const breadcrumb = buildBreadcrumb(breadcrumbSegments);
  const text = buildInstallmentDetailText(installment);
  const keyboard = buildInstallmentDetailKeyboard({
    installmentId,
    isPaid: installment.isPaid,
    hasReceipt: !!installment.receiptUrl,
    hasInvoice: !!installment.invoiceUrl,
    backCallback: `svc_cuotas:${installment.serviceId}`,
    backLabel,
  });
  await replyOrEdit(ctx, breadcrumb + text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

async function handleInstallmentsList(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const [serviceName, installments] = await Promise.all([
    getServiceNameCached(telegramUserId, serviceId),
    getInstallmentsByService(serviceId, telegramUserId),
  ]);

  if (installments.length === 0) {
    await ctx.editMessageText("No hay cuotas registradas para este servicio.");
    return;
  }

  await renderInstallmentsList({
    ctx,
    installments,
    page: 0,
    serviceId,
    serviceName: serviceName || serviceId,
  });
}

async function handleBackToServiceAction(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];
  await ctx.answerCbQuery();
  await showServiceActionView(ctx, serviceId);
}

async function handleInstallmentsListPagination(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (ctx as any).match as string[];
  const serviceId = match[1];
  const page = parseInt(match[2], 10);
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const [serviceName, installments] = await Promise.all([
    getServiceNameCached(telegramUserId, serviceId),
    getInstallmentsByService(serviceId, telegramUserId),
  ]);
  await renderInstallmentsList({
    ctx,
    installments,
    page,
    serviceId,
    serviceName: serviceName || serviceId,
  });
}

async function renderInstallmentsList({
  ctx,
  installments,
  page,
  serviceId,
  serviceName,
}: RenderInstallmentsListParams): Promise<void> {
  const breadcrumb = buildBreadcrumb(["Servicios", serviceName, "Cuotas"]);
  const totalPages = Math.ceil(installments.length / INSTALLMENTS_PER_PAGE);
  const text = `*Seleccioná la cuota a ver.*\n\n_Página ${page + 1} de ${totalPages}_`;
  const keyboard = buildInstallmentListKeyboard({
    installments,
    page,
    serviceId,
    serviceName,
  });

  await ctx.editMessageText(breadcrumb + text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

async function handleInstallmentDetailFromHistory(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];
  await ctx.answerCbQuery();

  const installment = await getInstallmentById(installmentId);
  if (!installment) {
    await ctx.editMessageText("Cuota no encontrada.");
    return;
  }

  const [year, month] = installment.dueMonth.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
  const breadcrumb = buildBreadcrumb([
    "Servicios",
    installment.serviceName,
    "Cuotas",
    monthLabel,
  ]);

  const text = buildInstallmentDetailText(installment);
  const keyboard = buildInstallmentDetailKeyboard({
    installmentId,
    isPaid: installment.isPaid,
    hasReceipt: !!installment.receiptUrl,
    hasInvoice: !!installment.invoiceUrl,
    backCallback: `svc_cuotas:${installment.serviceId}`,
    backLabel: "\u2190 Volver al historial",
  });

  await ctx.editMessageText(breadcrumb + text, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

/**
 * Handles payment method selection during service creation.
 * Saves the selected method and shows the installment prompt.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleSetPaymentMethod(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (ctx as any).match as string[];
  const serviceId = match[1];
  const method = match[2] as ServicePaymentMethod;
  const telegramUserId = ctx.from?.id.toString() || "";

  await updateServicePaymentMethod(serviceId, method);
  await ctx.answerCbQuery("✅ Método de pago guardado.");

  const serviceName = await getServiceNameCached(telegramUserId, serviceId);
  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    serviceId,
    serviceName: serviceName || "",
  });

  await ctx.editMessageText(
    `✅ Servicio '${serviceName || ""}' creado.\n\n¿Deseas agregar una cuota ahora?`,
    {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback("Cancelar", "svc_no_cuota"),
          Markup.button.callback("Aceptar", `svc_reg:${serviceId}`),
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ]).reply_markup as any,
    },
  );
}

/**
 * Shows the payment method selection keyboard for editing an existing service.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleEditPaymentMethod(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];
  await ctx.answerCbQuery();

  const service = await getServiceById(serviceId);
  if (!service) {
    await replyOrEdit(ctx, "Servicio no encontrado.");
    return;
  }

  const currentLabel = service.paymentMethod
    ? PAYMENT_METHOD_LABELS[service.paymentMethod]
    : "Sin configurar";

  await ctx.reply(`Vas a modificar el método de pago para *${service.name}*`, {
    parse_mode: "Markdown",
  });

  const keyboard = buildPaymentMethodKeyboard(serviceId, "edit");
  await ctx.reply(
    `Método actual: ${currentLabel}\n\n*Seleccioná el método de pago*`,
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    },
  );
}

/**
 * Handles payment method update from the service edit submenu.
 * Saves the new method and returns to the service action view.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleUpdatePaymentMethod(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (ctx as any).match as string[];
  const serviceId = match[1];
  const method = match[2] as ServicePaymentMethod;

  await updateServicePaymentMethod(serviceId, method);
  await ctx.answerCbQuery("✅ Método de pago actualizado.");
  await showServiceActionView(ctx, serviceId);
}

/**
 * Sends the invoice file attached to a service installment.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleDownloadInvoice(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];
  await ctx.answerCbQuery();

  const installment = await getInstallmentById(installmentId);
  const hasInvoice = installment && installment.invoiceUrl;
  if (!hasInvoice) {
    await ctx.reply("No se encontró la factura.");
    return;
  }

  const [year, month] = installment.dueMonth.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
  const filename = `${year}${month}-factura-${installment.serviceName}`;

  await ctx.reply(`Acá tenés la factura de ${monthLabel} para ${installment.serviceName}`);
  const { buffer, extension } = await downloadFromUrl(installment.invoiceUrl as string);
  await ctx.replyWithDocument({ source: buffer, filename: `${filename}.${extension}` });
}

/**
 * Sends the payment receipt file attached to a service installment.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleDownloadReceipt(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];
  await ctx.answerCbQuery();

  const installment = await getInstallmentById(installmentId);
  const hasReceipt = installment && installment.receiptUrl;
  if (!hasReceipt) {
    await ctx.reply("No se encontró el comprobante.");
    return;
  }

  const [year, month] = installment.dueMonth.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
  const filename = `${year}${month}-comprobante-de-pago-${installment.serviceName}`;

  await ctx.reply(`Acá tenés el comprobante de pago de ${monthLabel} para ${installment.serviceName}`);
  const { buffer, extension } = await downloadFromUrl(installment.receiptUrl as string);
  await ctx.replyWithDocument({ source: buffer, filename: `${filename}.${extension}` });
}
