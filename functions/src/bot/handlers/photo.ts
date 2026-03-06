import { Telegraf, Context } from "telegraf";
import https from "https";
import { getSession, clearSession } from "../../services/session.service";
import { uploadReceipt } from "../../services/storage.service";
import { saveReceiptUrl } from "../../services/service.service";

export function registerPhotoHandler(bot: Telegraf<Context>): void {
  bot.on("photo", handlePhoto);
}

async function handlePhoto(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";

  const session = await getSession(telegramUserId);
  if (session?.state !== "svc_awaiting_receipt") {
    return;
  }

  const installmentId = session.installmentId || "";
  if (!installmentId) {
    await ctx.reply("Error: datos de sesión incompletos.");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const photos = (ctx.message as any).photo as Array<{
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
    file_size?: number;
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

function downloadFile(url: string): Promise<Buffer> {
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
