import { Telegraf, Context } from "telegraf";
import { Session } from "../../types/index";
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
  saveInvoiceUrl,
} from "../../services/service.service";
import { uploadInvoice } from "../../services/storage.service";
import { downloadFile } from "./photo";
import {
  buildInvoiceServiceListKeyboard,
  buildInvoiceMonthKeyboard,
} from "../keyboards/invoice";
import { MONTH_NAMES } from "../../helpers/format";
import { replyOrEdit } from "../../helpers/telegram";
import { buildBreadcrumb } from "../../helpers/breadcrumb";

export function registerInvoiceHandler(bot: Telegraf<Context>): void {
  bot.action("doc_type_invoice", handleDocTypeInvoice);
  bot.action(/^inv_pick:(.+)$/, handlePickServiceForInvoice);
  bot.action("inv_new_service", handleNewServiceForInvoice);
  bot.action(/^inv_month:(.+):(\d{4}-\d{2})$/, handleInvoiceMonthSelected);
  bot.action(/^inv_pg:(\d+)$/, handleInvoicePagination);
  bot.action("inv_cancel", handleInvoiceCancel);
}

async function handleDocTypeInvoice(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const services = await getServicesByUser(telegramUserId);

  if (services.length === 0) {
    await setSession(telegramUserId, {
      ...((await getSession(telegramUserId)) as ReturnType<
        typeof emptySessionForPartial
      >),
      state: "invoice_awaiting_name",
    });
    const breadcrumb = buildBreadcrumb(["Factura"]);
    await replyOrEdit(
      ctx,
      breadcrumb +
      "No tenés servicios registrados.\n¿Cómo se llama el servicio?\n" +
        "_Enviá la palabra cancelar para salir._",
      { parse_mode: "Markdown" },
    );
    return;
  }

  const session = await getSession(telegramUserId);
  if (session) {
    await setSession(telegramUserId, {
      ...session,
      state: "invoice_awaiting_service",
    });
  }

  const breadcrumb = buildBreadcrumb(["Factura"]);
  const keyboard = buildInvoiceServiceListKeyboard(services);
  await replyOrEdit(ctx, breadcrumb + "¿A qué servicio corresponde esta factura?", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

async function handlePickServiceForInvoice(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const session = await getSession(telegramUserId);
  if (!session?.pendingFileId) {
    await replyOrEdit(ctx, "Error: no se encontró el archivo pendiente.");
    return;
  }

  const now = new Date();
  const monthStr = String(now.getMonth() + 1).padStart(2, "0");
  const dueMonth = `${now.getFullYear()}-${monthStr}`;

  const [service, installment] = await Promise.all([
    getServiceById(serviceId),
    getInstallment(serviceId, dueMonth),
  ]);
  const serviceName = service?.name || "";

  if (installment) {
    await attachInvoiceToInstallment(
      ctx,
      telegramUserId,
      installment.id || "",
      session,
    );
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "invoice_awaiting_month",
    serviceId,
    serviceName,
  });

  const invBreadcrumb = buildBreadcrumb(["Factura", serviceName]);
  const keyboard = buildInvoiceMonthKeyboard(serviceId);
  await replyOrEdit(ctx, invBreadcrumb + "¿A qué mes corresponde la factura?", {
    parse_mode: "Markdown",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

async function handleInvoiceMonthSelected(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (ctx as any).match as string[];
  const serviceId = match[1];
  const dueMonth = match[2];
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const session = await getSession(telegramUserId);
  if (!session?.pendingFileId) {
    await replyOrEdit(ctx, "Error: no se encontró el archivo pendiente.");
    return;
  }

  const existingInstallment = await getInstallment(serviceId, dueMonth);
  if (existingInstallment) {
    await attachInvoiceToInstallment(
      ctx,
      telegramUserId,
      existingInstallment.id || "",
      session,
    );
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "invoice_awaiting_day",
    serviceId,
    selectedMonth: dueMonth,
  });

  const monthBreadcrumb = buildBreadcrumb([
    "Factura", session.serviceName || "", getMonthLabel(dueMonth, true),
  ]);
  await replyOrEdit(
    ctx,
    monthBreadcrumb +
    "¿Qué día vence?\n_Enviá la palabra cancelar para salir._",
    { parse_mode: "Markdown" },
  );
}

async function handleNewServiceForInvoice(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const session = await getSession(telegramUserId);
  if (!session?.pendingFileId) {
    await replyOrEdit(ctx, "Error: no se encontró el archivo pendiente.");
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "invoice_awaiting_name",
  });

  const newSvcBreadcrumb = buildBreadcrumb(["Factura", "Nuevo servicio"]);
  await replyOrEdit(
    ctx,
    newSvcBreadcrumb
    + "¿Cómo se llama el servicio?\n_Ej: Expensas, Gas, Flow, Netflix_\n"
    + "_Enviá la palabra cancelar para salir._",
    { parse_mode: "Markdown" },
  );
}

async function handleInvoicePagination(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = parseInt(((ctx as any).match as string[])[1], 10);
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  const services = await getServicesByUser(telegramUserId);
  const keyboard = buildInvoiceServiceListKeyboard(services, page);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ctx.editMessageReplyMarkup(keyboard.reply_markup as any);
}

async function handleInvoiceCancel(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();
  await clearSession(telegramUserId);
  await replyOrEdit(ctx, "Carga de factura cancelada.");
}

export async function attachInvoiceToInstallment(
  ctx: Context,
  telegramUserId: string,
  installmentId: string,
  session: Session,
  successMessage: string = "✅ Factura adjunta.",
): Promise<void> {
  const fileId = session.pendingFileId;
  if (!fileId) {
    await ctx.reply("Error: no se encontró el archivo adjunto.");
    return;
  }

  try {
    const fileType = session.pendingFileType || "photo";

    const fileLink = await ctx.telegram.getFileLink(fileId);
    const fileBuffer = await downloadFile(fileLink.href);

    const mimeType =
      fileType === "pdf"
        ? "application/pdf"
        : fileLink.href.includes(".png")
          ? "image/png"
          : "image/jpeg";

    const invoiceUrl = await uploadInvoice(
      telegramUserId,
      installmentId,
      fileBuffer,
      mimeType,
    );

    await saveInvoiceUrl(installmentId, invoiceUrl);
    await clearSession(telegramUserId);
    await replyOrEdit(ctx, successMessage);
  } catch (error) {
    console.error("Error uploading invoice:", error);
    await replyOrEdit(ctx, "Error al guardar la factura. Intentá de nuevo.");
  }
}

export function getMonthLabel(dueMonth: string, monthNameOnly = false): string {
  const [year, month] = dueMonth.split("-");
  const monthIndex = parseInt(month, 10) - 1;
  const monthName = MONTH_NAMES[monthIndex];
  const fullDate = monthName + year;
  return `${monthNameOnly ? monthName : fullDate}`;
}
