import { Telegraf, Context } from "telegraf";
import {
  getSession, setSession, clearSession, emptySessionForPartial,
} from "../../services/session.service";
import {
  getServicesByUser,
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
      ...await getSession(telegramUserId) as ReturnType<typeof emptySessionForPartial>,
      state: "invoice_awaiting_name",
    });
    await ctx.reply(
      "No tenés servicios registrados.\n¿Cómo se llama el servicio?"
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

  const keyboard = buildInvoiceServiceListKeyboard(services);
  await ctx.reply("¿A qué servicio corresponde esta factura?", keyboard);
}

async function handlePickServiceForInvoice(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const session = await getSession(telegramUserId);
  if (!session?.pendingFileId) {
    await ctx.reply("Error: no se encontró el archivo pendiente.");
    return;
  }

  const now = new Date();
  const monthStr = String(now.getMonth() + 1).padStart(2, "0");
  const dueMonth = `${now.getFullYear()}-${monthStr}`;
  const installment = await getInstallment(serviceId, dueMonth);

  if (installment) {
    await attachInvoiceToInstallment(
      ctx, telegramUserId, installment.id || "", session
    );
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "invoice_awaiting_month",
    serviceId,
  });

  const keyboard = buildInvoiceMonthKeyboard(serviceId);
  await ctx.reply("¿A qué mes corresponde la factura?", keyboard);
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
    await ctx.reply("Error: no se encontró el archivo pendiente.");
    return;
  }

  const existingInstallment = await getInstallment(serviceId, dueMonth);
  if (existingInstallment) {
    await attachInvoiceToInstallment(
      ctx, telegramUserId, existingInstallment.id || "", session
    );
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "invoice_awaiting_day",
    serviceId,
    selectedMonth: dueMonth,
  });

  await ctx.reply("¿Cuál es el día de vencimiento? (1-31)");
}

async function handleNewServiceForInvoice(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const session = await getSession(telegramUserId);
  if (!session?.pendingFileId) {
    await ctx.reply("Error: no se encontró el archivo pendiente.");
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "invoice_awaiting_name",
  });

  await ctx.reply("¿Cómo se llama el servicio?\nEj: Expensas, Gas, Flow, Netflix");
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
  await ctx.reply("Carga de factura cancelada.");
}

export async function attachInvoiceToInstallment(
  ctx: Context,
  telegramUserId: string,
  installmentId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any,
  successMessage: string = "✅ Factura adjunta."
): Promise<void> {
  try {
    const fileId = session.pendingFileId;
    const fileType = session.pendingFileType || "photo";

    const fileLink = await ctx.telegram.getFileLink(fileId);
    const fileBuffer = await downloadFile(fileLink.href);

    const mimeType = fileType === "pdf" ?
      "application/pdf" :
      (fileLink.href.includes(".png") ? "image/png" : "image/jpeg");

    const invoiceUrl = await uploadInvoice(
      telegramUserId, installmentId, fileBuffer, mimeType
    );

    await saveInvoiceUrl(installmentId, invoiceUrl);
    await clearSession(telegramUserId);
    await ctx.reply(successMessage);
  } catch (error) {
    console.error("Error uploading invoice:", error);
    await ctx.reply("Error al guardar la factura. Intentá de nuevo.");
  }
}

export function getMonthLabel(dueMonth: string): string {
  const [year, month] = dueMonth.split("-");
  const monthIndex = parseInt(month, 10) - 1;
  return `${MONTH_NAMES[monthIndex]} ${year}`;
}
