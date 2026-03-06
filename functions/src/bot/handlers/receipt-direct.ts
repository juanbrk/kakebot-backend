import { Telegraf, Context } from "telegraf";
import {
  getSession, setSession, clearSession, emptySessionForPartial,
} from "../../services/session.service";
import {
  getServicesByUser,
  getServiceById,
  getInstallment,
  markInstallmentAsPaid,
  saveReceiptUrl,
} from "../../services/service.service";
import { uploadReceipt } from "../../services/storage.service";
import { downloadFile } from "./photo";
import {
  buildReceiptServiceListKeyboard,
  buildReceiptMonthKeyboard,
} from "../keyboards/invoice";

export function registerReceiptDirectHandler(bot: Telegraf<Context>): void {
  bot.action("doc_type_receipt", handleDocTypeReceipt);
  bot.action(/^comp_pick:(.+)$/, handlePickServiceForReceipt);
  bot.action("comp_new_service", handleNewServiceForReceipt);
  bot.action(/^comp_month:(.+):(\d{4}-\d{2})$/, handleReceiptMonthSelected);
  bot.action(/^comp_pg:(\d+)$/, handleReceiptPagination);
  bot.action("comp_cancel", handleReceiptCancel);
}

async function handleDocTypeReceipt(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const services = await getServicesByUser(telegramUserId);

  if (services.length === 0) {
    await setSession(telegramUserId, {
      ...await getSession(telegramUserId) as ReturnType<typeof emptySessionForPartial>,
      state: "comp_awaiting_name",
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
      state: "comp_awaiting_service",
    });
  }

  const keyboard = buildReceiptServiceListKeyboard(services);
  await ctx.reply("¿A qué servicio corresponde este comprobante?", keyboard);
}

async function handlePickServiceForReceipt(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const session = await getSession(telegramUserId);
  if (!session?.pendingFileId) {
    await ctx.reply("Error: no se encontró el archivo pendiente.");
    return;
  }

  const service = await getServiceById(serviceId);
  const serviceName = service?.name || "";

  const now = new Date();
  const monthStr = String(now.getMonth() + 1).padStart(2, "0");
  const dueMonth = `${now.getFullYear()}-${monthStr}`;
  const installment = await getInstallment(serviceId, dueMonth);

  if (installment) {
    await attachReceiptToInstallment(
      ctx, telegramUserId, installment.id || "", session
    );
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "comp_awaiting_month",
    serviceId,
    serviceName,
  });

  const keyboard = buildReceiptMonthKeyboard(serviceId);
  await ctx.reply("¿A qué mes corresponde el comprobante?", keyboard);
}

async function handleReceiptMonthSelected(ctx: Context): Promise<void> {
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
    await attachReceiptToInstallment(
      ctx, telegramUserId, existingInstallment.id || "", session
    );
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "comp_awaiting_day",
    serviceId,
    selectedMonth: dueMonth,
  });

  await ctx.reply("¿Cuál es el día de vencimiento? (1-31)");
}

async function handleNewServiceForReceipt(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const session = await getSession(telegramUserId);
  if (!session?.pendingFileId) {
    await ctx.reply("Error: no se encontró el archivo pendiente.");
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "comp_awaiting_name",
  });

  await ctx.reply("¿Cómo se llama el servicio?\nEj: Expensas, Gas, Flow, Netflix");
}

async function handleReceiptPagination(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = parseInt(((ctx as any).match as string[])[1], 10);
  const telegramUserId = ctx.from?.id.toString() || "";

  await ctx.answerCbQuery();

  const services = await getServicesByUser(telegramUserId);
  const keyboard = buildReceiptServiceListKeyboard(services, page);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ctx.editMessageReplyMarkup(keyboard.reply_markup as any);
}

async function handleReceiptCancel(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();
  await clearSession(telegramUserId);
  await ctx.reply("Carga de comprobante cancelada.");
}

export async function attachReceiptToInstallment(
  ctx: Context,
  telegramUserId: string,
  installmentId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any,
  successMessage: string = "✅ Comprobante adjunto. Cuota marcada como pagada."
): Promise<void> {
  try {
    const fileId = session.pendingFileId;
    const fileType = session.pendingFileType || "photo";

    const fileLink = await ctx.telegram.getFileLink(fileId);
    const fileBuffer = await downloadFile(fileLink.href);

    const mimeType = fileType === "pdf" ?
      "application/pdf" :
      (fileLink.href.includes(".png") ? "image/png" : "image/jpeg");

    const receiptUrl = await uploadReceipt(
      telegramUserId, installmentId, fileBuffer, mimeType
    );

    await markInstallmentAsPaid(installmentId);
    await saveReceiptUrl(installmentId, receiptUrl);
    await clearSession(telegramUserId);
    await ctx.reply(successMessage);
  } catch (error) {
    console.error("Error uploading receipt:", error);
    await ctx.reply("Error al guardar el comprobante. Intentá de nuevo.");
  }
}
