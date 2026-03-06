import { Telegraf, Context } from "telegraf";
import https from "https";
import {
  getSession, setSession, clearSession, emptySessionForPartial,
} from "../../services/session.service";
import { uploadReceipt, uploadInvoice } from "../../services/storage.service";
import { saveReceiptUrl, saveInvoiceUrl } from "../../services/service.service";
import { buildDocTypeKeyboard } from "../keyboards/invoice";

export function registerPhotoHandler(bot: Telegraf<Context>): void {
  bot.on("photo", handlePhoto);
  bot.on("document", handleDocument);
}

async function handlePhoto(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  const session = await getSession(telegramUserId);

  if (session?.state === "svc_awaiting_receipt") {
    await handleReceiptUpload(ctx, telegramUserId, session);
    return;
  }

  if (session?.state === "svc_awaiting_invoice") {
    await handleInvoiceUpload(ctx, telegramUserId, session, "photo");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const photos = (ctx.message as any).photo as Array<{
    file_id: string;
  }>;

  if (!photos || photos.length === 0) {
    return;
  }

  const largestPhoto = photos[photos.length - 1];
  await startDocTypeFlow(ctx, telegramUserId, largestPhoto.file_id, "photo");
}

async function handleDocument(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const document = (ctx.message as any).document as {
    file_id: string;
    mime_type?: string;
    file_name?: string;
  };

  if (!document) return;

  const isPdf = document.mime_type === "application/pdf";
  if (!isPdf) {
    await ctx.reply("Solo se aceptan archivos PDF.");
    return;
  }

  const session = await getSession(telegramUserId);

  if (session?.state === "svc_awaiting_invoice") {
    await handleInvoiceUpload(ctx, telegramUserId, session, "pdf", document.file_id);
    return;
  }

  await startDocTypeFlow(ctx, telegramUserId, document.file_id, "pdf");
}

async function startDocTypeFlow(
  ctx: Context,
  telegramUserId: string,
  fileId: string,
  fileType: "photo" | "pdf"
): Promise<void> {
  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "doc_awaiting_type",
    pendingFileId: fileId,
    pendingFileType: fileType,
  });

  const keyboard = buildDocTypeKeyboard();
  await ctx.reply("¿Qué tipo de documento es?", keyboard);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleReceiptUpload(
  ctx: Context,
  telegramUserId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any
): Promise<void> {
  const installmentId = session.installmentId || "";
  if (!installmentId) {
    await ctx.reply("Error: datos de sesión incompletos.");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const photos = (ctx.message as any).photo as Array<{
    file_id: string;
  }>;

  if (!photos || photos.length === 0) {
    await ctx.reply("No se pudo procesar la foto. Intentá de nuevo.");
    return;
  }

  const largestPhoto = photos[photos.length - 1];

  try {
    const fileLink = await ctx.telegram.getFileLink(largestPhoto.file_id);
    const fileBuffer = await downloadFile(fileLink.href);

    const mimeType = fileLink.href.includes(".png") ? "image/png" : "image/jpeg";
    const receiptUrl = await uploadReceipt(
      telegramUserId, installmentId, fileBuffer, mimeType
    );

    await saveReceiptUrl(installmentId, receiptUrl);
    await clearSession(telegramUserId);
    await ctx.reply("✅ Comprobante guardado.");
  } catch (error) {
    console.error("Error uploading receipt:", error);
    await ctx.reply("Error al guardar el comprobante. Intentá de nuevo.");
  }
}

async function handleInvoiceUpload(
  ctx: Context,
  telegramUserId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any,
  fileType: "photo" | "pdf",
  documentFileId?: string
): Promise<void> {
  const installmentId = session.installmentId || "";
  if (!installmentId) {
    await ctx.reply("Error: datos de sesión incompletos.");
    return;
  }

  let fileId: string;

  if (fileType === "pdf" && documentFileId) {
    fileId = documentFileId;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const photos = (ctx.message as any).photo as Array<{
      file_id: string;
    }>;

    if (!photos || photos.length === 0) {
      await ctx.reply("No se pudo procesar la foto. Intentá de nuevo.");
      return;
    }

    fileId = photos[photos.length - 1].file_id;
  }

  try {
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
    await ctx.reply("✅ Factura adjunta.");
  } catch (error) {
    console.error("Error uploading invoice:", error);
    await ctx.reply("Error al guardar la factura. Intentá de nuevo.");
  }
}

export function downloadFile(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }

      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    }).on("error", reject);
  });
}
