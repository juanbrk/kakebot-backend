import { Telegraf, Context } from "telegraf";
import { KakebotContext } from "../../types/telegraf-context.types";
import { log } from "../../helpers/logger";
import {
  getSession, setSession, clearSession,
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
import { replyOrEdit } from "../../helpers/telegram";
import { buildBreadcrumb } from "../../helpers/breadcrumb";
import { MONTH_NAMES } from "../../helpers/format";
import { AttachReceiptParams } from "../../types/handlers.types";

export function registerReceiptDirectHandler(bot: Telegraf<KakebotContext>): void {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...await getSession(telegramUserId) as any,
      state: "comp_awaiting_name",
    });
    const breadcrumb = buildBreadcrumb(["Comprobante"]);
    await replyOrEdit(
      ctx,
      breadcrumb
      + "No tenés servicios registrados.\n¿Cómo se llama el servicio?\n"
      + "_Enviá la palabra cancelar para salir._",
      { parse_mode: "Markdown" }
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

  const breadcrumb = buildBreadcrumb(["Comprobante"]);
  const keyboard = buildReceiptServiceListKeyboard(services);
  await replyOrEdit(
    ctx,
    breadcrumb + "¿A qué servicio corresponde este comprobante?",
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    }
  );
}

async function handlePickServiceForReceipt(ctx: Context): Promise<void> {
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
    await attachReceiptToInstallment({ ctx, telegramUserId, installmentId: installment.id || "", session });
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "comp_awaiting_month",
    serviceId,
    serviceName,
  });

  const pickBreadcrumb = buildBreadcrumb(["Comprobante", serviceName]);
  const keyboard = buildReceiptMonthKeyboard(serviceId);
  await replyOrEdit(
    ctx,
    pickBreadcrumb + "¿A qué mes corresponde el comprobante?",
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    }
  );
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
    await replyOrEdit(ctx, "Error: no se encontró el archivo pendiente.");
    return;
  }

  const existingInstallment = await getInstallment(serviceId, dueMonth);
  if (existingInstallment) {
    await attachReceiptToInstallment({ ctx, telegramUserId, installmentId: existingInstallment.id || "", session });
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "comp_awaiting_day",
    serviceId,
    selectedMonth: dueMonth,
  });

  const [, monthNum] = dueMonth.split("-");
  const monthName = MONTH_NAMES[parseInt(monthNum, 10) - 1];
  const monthBreadcrumb = buildBreadcrumb([
    "Comprobante", session.serviceName || "", monthName,
  ]);
  await replyOrEdit(
    ctx,
    monthBreadcrumb
    + "¿Cuándo vence la cuota?\n_Enviá la palabra cancelar para salir._",
    { parse_mode: "Markdown" }
  );
}

async function handleNewServiceForReceipt(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  await ctx.answerCbQuery();

  const session = await getSession(telegramUserId);
  if (!session?.pendingFileId) {
    await replyOrEdit(ctx, "Error: no se encontró el archivo pendiente.");
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "comp_awaiting_name",
  });

  const newSvcBreadcrumb = buildBreadcrumb(["Comprobante", "Nuevo servicio"]);
  await replyOrEdit(
    ctx,
    newSvcBreadcrumb
    + "¿Cómo se llama el servicio?\nEj: Expensas, Gas, Flow, Netflix\n"
    + "_Enviá la palabra cancelar para salir._",
    { parse_mode: "Markdown" }
  );
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
  await replyOrEdit(ctx, "Carga de comprobante cancelada.");
}

export async function attachReceiptToInstallment({
  ctx,
  telegramUserId,
  installmentId,
  session,
  successMessage = "✅ Comprobante adjunto. Cuota marcada como pagada.",
}: AttachReceiptParams): Promise<void> {
  const fileId = session.pendingFileId;
  if (!fileId) {
    await ctx.reply("Error: no se encontró el archivo adjunto.");
    return;
  }

  try {
    const fileType = session.pendingFileType || "photo";

    const fileLink = await ctx.telegram.getFileLink(fileId);
    const fileBuffer = await downloadFile(fileLink.href);

    const mimeType = fileType === "pdf" ?
      "application/pdf" :
      (fileLink.href.includes(".png") ? "image/png" : "image/jpeg");

    const receiptUrl = await uploadReceipt({ telegramUserId, installmentId, fileBuffer, mimeType });

    await markInstallmentAsPaid(installmentId);
    await saveReceiptUrl(installmentId, receiptUrl);
    await clearSession(telegramUserId);
    await replyOrEdit(ctx, successMessage);
  } catch (error) {
    log.error("Error uploading receipt", error, { module: "receipt-direct", userId: telegramUserId });
    await replyOrEdit(ctx, "Error al guardar el comprobante. Intentá de nuevo.");
  }
}
