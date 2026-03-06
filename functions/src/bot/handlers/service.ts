import { Telegraf, Context } from "telegraf";
import {
  getSession, setSession, clearSession, emptySessionForPartial,
} from "../../services/session.service";
import {
  getServicesByUser,
  getServiceById,
  getInstallment,
  replaceInstallment,
  deleteService,
  markInstallmentAsPaid,
} from "../../services/service.service";
import {
  buildServicesSubmenuKeyboard,
  buildServiceListKeyboard,
  buildServiceActionKeyboard,
  buildServiceEditKeyboard,
  buildMonthKeyboard,
  buildDeleteConfirmKeyboard,
  buildServiceViewText,
  buildInstallmentDetailText,
  buildInstallmentDetailKeyboard,
  buildReceiptPromptKeyboard,
} from "../keyboards/service";
import { formatARS } from "../../helpers/format";

export function registerServiceHandler(bot: Telegraf<Context>): void {
  bot.command("servicios", openServicesMenu);
  bot.action("menu_servicios", openServicesMenu);

  bot.action("svc_add", handleAddService);
  bot.action("svc_installment", handleRegisterInstallment);
  bot.action("svc_view", handleViewServices);
  bot.action("svc_list", handleListServices);
  bot.action("svc_back", handleBackToMenu);

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

  bot.action(/^svc_edit_amt:(.+)$/, handleEditInstallmentAmount);
  bot.action(/^svc_edit_day:(.+)$/, handleEditInstallmentDay);

  bot.action(/^svc_pg:(\d+)$/, handlePagination);
}

async function openServicesMenu(ctx: Context): Promise<void> {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  await ctx.reply(
    "Selecciona una opción",
    buildServicesSubmenuKeyboard()
  );
}

async function handleAddService(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "svc_awaiting_name",
  });

  await ctx.reply("¿Cómo se llama el servicio?\nEj: Expensas, Gas, Flow, Netflix");
}

async function handleRegisterInstallment(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const services = await getServicesByUser(telegramUserId);

  if (services.length === 0) {
    await ctx.reply(
      "No hay servicios registrados.\nUsa 'Añadir servicio' primero."
    );
    return;
  }

  const keyboard = buildServiceListKeyboard(services, 0, "svc_pick");
  await ctx.reply("Seleccioná un servicio:", keyboard);
}

async function handleViewServices(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const services = await getServicesByUser(telegramUserId);

  if (services.length === 0) {
    await ctx.reply("No hay servicios registrados.");
    return;
  }

  const keyboard = buildServiceListKeyboard(services, 0, "svc_view_pick");
  await ctx.reply("Seleccioná un servicio:", keyboard);
}

async function handleListServices(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const services = await getServicesByUser(telegramUserId);

  if (services.length === 0) {
    await ctx.reply("No hay servicios registrados.");
    return;
  }

  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const dueMonth = `${now.getFullYear()}-${month}`;

  const installmentsByServiceId: Record<string, import("../../types/index").ServiceInstallment | null> = {};
  for (const service of services) {
    const installment = await getInstallment(service.id || "", dueMonth);
    installmentsByServiceId[service.id || ""] = installment;
  }

  const text = buildServiceViewText(services, installmentsByServiceId);
  await ctx.reply(text, { parse_mode: "Markdown" });
}

async function handlePickServiceForAction(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];

  await ctx.answerCbQuery();

  const service = await getServiceById(serviceId);
  if (!service) {
    await ctx.reply("Servicio no encontrado.");
    return;
  }

  const now = new Date();
  const monthStr = String(now.getMonth() + 1).padStart(2, "0");
  const dueMonth = `${now.getFullYear()}-${monthStr}`;
  const installment = await getInstallment(serviceId, dueMonth);

  let title = `*${service.name}*`;
  if (installment) {
    const dueDate = installment.dueDate.toDate();
    const day = String(dueDate.getDate()).padStart(2, "0");
    const mo = String(dueDate.getMonth() + 1).padStart(2, "0");
    const dueSuffix = installment.isPaid ?
      "(Pagado) ✅" :
      `(vence ${day}/${mo})`;
    title = `*${service.name}* ${formatARS(installment.amount)} ${dueSuffix}`;
  }

  const hasInstallment = installment !== null;
  const isPaid = installment?.isPaid ?? false;
  const keyboard = buildServiceActionKeyboard(serviceId, hasInstallment, isPaid);
  await ctx.reply(title, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

async function handleBackToMenu(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  await openServicesMenu(ctx);
}

async function handlePickServiceForInstallment(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  const service = await getServiceById(serviceId);
  if (!service) {
    await ctx.reply("Servicio no encontrado.");
    return;
  }

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "svc_awaiting_amount",
    serviceId,
    serviceName: service.name,
  });

  const keyboard = buildMonthKeyboard(serviceId);
  await ctx.reply(`Seleccioná el mes para ${service.name}:`, keyboard);
}

async function handleMonthSelected(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = ((ctx as any).match as string[]);
  const serviceId = match[1];
  const dueMonth = match[2];
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  const session = await getSession(telegramUserId);
  if (!session) {
    await ctx.reply("Error: sesión perdida.");
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "svc_awaiting_day",
    serviceId,
    selectedMonth: dueMonth,
  });

  await ctx.reply("¿Cuál es el día de vencimiento? (1-31)");
}

async function handleSkipDuplicate(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();
  await clearSession(telegramUserId);
  await ctx.reply("Registro de cuota omitido.");
}

async function handleReplaceDuplicate(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  const session = await getSession(telegramUserId);
  const hasRequiredSessionData =
    session &&
    session.selectedMonth &&
    session.partialAmount;
  if (!hasRequiredSessionData) {
    await ctx.reply("Error: datos de sesión incompletos.");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const amount = session.partialAmount!;
  const dayStr = (session.partialDescription || "").trim();
  const day = parseInt(dayStr, 10);

  const isValidDay = Number.isInteger(day) && day >= 1 && day <= 31;
  if (!isValidDay) {
    await ctx.reply("Día inválido. Ingresá un número entre 1 y 31.");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const [year, month] = session.selectedMonth!.split("-");
  const dueDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, day);

  await replaceInstallment(installmentId, amount, dueDate);
  await clearSession(telegramUserId);

  const serviceName = session.serviceName || "";
  const day2 = String(dueDate.getDate()).padStart(2, "0");
  const month2 = String(dueDate.getMonth() + 1).padStart(2, "0");

  await ctx.reply(
    `✅ Cuota reemplazada: ${serviceName} ${formatARS(amount)} (vence ${day2}/${month2})`
  );
}

async function handleEditService(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];

  await ctx.answerCbQuery();

  const service = await getServiceById(serviceId);
  if (!service) {
    await ctx.reply("Servicio no encontrado.");
    return;
  }

  const keyboard = buildServiceEditKeyboard(serviceId);
  await ctx.reply(`¿Qué deseas hacer con *${service.name}*?`, {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

async function handleRegFromEdit(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  const service = await getServiceById(serviceId);
  if (!service) {
    await ctx.reply("Servicio no encontrado.");
    return;
  }

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "svc_awaiting_amount",
    serviceId,
    serviceName: service.name,
  });

  const keyboard = buildMonthKeyboard(serviceId);
  await ctx.reply(`¿Qué mes vence ${service.name}?:`, keyboard);
}

async function handleEditInstallment(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];

  await ctx.answerCbQuery();

  const service = await getServiceById(serviceId);
  if (!service) {
    await ctx.reply("Servicio no encontrado.");
    return;
  }

  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const dueMonth = `${now.getFullYear()}-${month}`;

  const installment = await getInstallment(serviceId, dueMonth);
  if (!installment) {
    await ctx.reply(`No hay cuota registrada para ${service.name} este mes.`);
    return;
  }

  const text = buildInstallmentDetailText(installment);
  const hasReceipt = !!installment.receiptUrl;
  const keyboard = buildInstallmentDetailKeyboard(
    installment.id || "", installment.isPaid, hasReceipt
  );
  await ctx.reply(text, {
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
  await ctx.reply("✅ Cuota marcada como pagada.");

  const keyboard = buildReceiptPromptKeyboard(installmentId);
  await ctx.reply("¿Deseas adjuntar comprobante?", keyboard);
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
    await ctx.reply("No hay cuota registrada para este mes.");
    return;
  }

  await markInstallmentAsPaid(installment.id || "");
  await ctx.reply("✅ Cuota marcada como pagada.");

  const keyboard = buildReceiptPromptKeyboard(installment.id || "");
  await ctx.reply("¿Deseas adjuntar comprobante?", keyboard);
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

  await ctx.reply("Enviá la foto del comprobante.");
}

async function handleSkipReceipt(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();
  await clearSession(telegramUserId);
  await ctx.reply("Comprobante omitido.");
}

async function handleEditServiceName(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "svc_awaiting_edit_name",
    serviceId,
  });

  await ctx.reply("¿Cuál es el nuevo nombre del servicio?");
}

async function handleDeleteService(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];

  await ctx.answerCbQuery();

  const service = await getServiceById(serviceId);
  if (!service) {
    await ctx.reply("Servicio no encontrado.");
    return;
  }

  const keyboard = buildDeleteConfirmKeyboard(serviceId);
  await ctx.reply(
    `¿Eliminar ${service.name}? Se borrarán todas sus cuotas.`,
    keyboard
  );
}

async function handleConfirmDelete(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];

  await ctx.answerCbQuery();

  const service = await getServiceById(serviceId);
  if (service) {
    await deleteService(serviceId);
    await ctx.reply(`✅ Servicio '${service.name}' eliminado.`);
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

  await ctx.reply("¿Cuál es el nuevo monto?");
}

async function handleEditInstallmentDay(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installmentId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "svc_awaiting_edit_day",
    installmentId,
  });

  await ctx.reply("¿Cuál es el nuevo día de vencimiento? (1-31)");
}

async function handlePagination(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = parseInt(((ctx as any).match as string[])[1], 10);
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  const services = await getServicesByUser(telegramUserId);
  const keyboard = buildServiceListKeyboard(services, page, "svc_view_pick");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ctx.editMessageReplyMarkup(keyboard.reply_markup as any);
}
