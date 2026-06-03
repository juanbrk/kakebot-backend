import { Telegraf, Context, Markup } from "telegraf";
import { KakebotContext, DocRouterWizardState } from "../../types/telegraf-context.types";
import { Session, PendingFileType } from "../../types/index";
import { StatementReceiptUploadParams } from "../../types/handlers.types";
import https from "https";
import { MONTH_NAMES } from "../../helpers/format";
import {
  getSession, clearSession,
} from "../../services/session.service";
import {
  uploadStatementReceipt,
  uploadStatementPaymentReceipt, uploadStatementPaymentReceiptUSD,
} from "../../services/storage.service";
import {
  saveStatementReceiptUrl, saveStatementReceiptUrlARS, saveStatementReceiptUrlUSD,
  getStatementById,
} from "../../services/card.service";
import { buildStmtPayUSDKeyboard, buildPaymentSummaryText } from "../keyboards/card";
import { DOC_ROUTER_SCENE_ID } from "../scenes/doc-router.scene";
import { log } from "../../helpers/logger";

export function registerPhotoHandler(bot: Telegraf<KakebotContext>): void {
  bot.on("photo", handlePhoto);
  bot.on("document", handleDocument);
}

async function handlePhoto(ctx: KakebotContext): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";
  const session = await getSession(telegramUserId);

  if (session?.state === "card_awaiting_receipt") {
    await handleCardReceiptUpload({ ctx, telegramUserId, session, fileType: "photo" });
    return;
  }

  if (session?.state === "card_stmt_awaiting_receipt_ars") {
    await handleStatementARSReceiptUpload({ ctx, telegramUserId, session, fileType: "photo" });
    return;
  }

  if (session?.state === "card_stmt_awaiting_receipt_usd") {
    await handleStatementUSDReceiptUpload({ ctx, telegramUserId, session, fileType: "photo" });
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
  await ctx.scene.enter(DOC_ROUTER_SCENE_ID, { pendingFileId: largestPhoto.file_id, pendingFileType: "photo" } as DocRouterWizardState);
}

async function handleDocument(ctx: KakebotContext): Promise<void> {
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

  if (session?.state === "card_awaiting_receipt") {
    await handleCardReceiptUpload({ ctx, telegramUserId, session, fileType: "pdf", documentFileId: document.file_id });
    return;
  }

  if (session?.state === "card_stmt_awaiting_receipt_ars") {
    await handleStatementARSReceiptUpload({
      ctx, telegramUserId, session, fileType: "pdf", documentFileId: document.file_id,
    });
    return;
  }

  if (session?.state === "card_stmt_awaiting_receipt_usd") {
    await handleStatementUSDReceiptUpload({
      ctx, telegramUserId, session, fileType: "pdf", documentFileId: document.file_id,
    });
    return;
  }

  await ctx.scene.enter(DOC_ROUTER_SCENE_ID, { pendingFileId: document.file_id, pendingFileType: "pdf" } as DocRouterWizardState);
}

async function handleCardReceiptUpload({
  ctx,
  telegramUserId,
  session,
  fileType,
  documentFileId,
}: {
  ctx: Context;
  telegramUserId: string;
  session: Session;
  fileType: PendingFileType;
  documentFileId?: string;
}): Promise<void> {
  const statementId = session.statementId || "";
  if (!statementId) {
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

    const receiptUrl = await uploadStatementReceipt({
      telegramUserId, installmentId: statementId, fileBuffer, mimeType,
    });

    await saveStatementReceiptUrl(statementId, receiptUrl);

    const stmtMonth = session.statementMonth || "";
    const cardLabel = session.cardLabel || "";
    const cardId = session.cardId || "";
    const [year, month] = stmtMonth.split("-");
    const monthLabel = stmtMonth ?
      `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}` :
      "el mes seleccionado";

    await clearSession(telegramUserId);
    await ctx.reply(
      `✅ Se subió correctamente el resumen del mes de *${monthLabel}* de la tarjeta *${cardLabel}*.`,
      { parse_mode: "Markdown" },
    );
    if (cardId) {
      await ctx.reply("*¿Qué querés hacer?*", {
        parse_mode: "Markdown",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: Markup.inlineKeyboard([[
          Markup.button.callback("Ver resúmenes", `card_stmts:${cardId}`),
        ]]).reply_markup as any,
      });
    }
  } catch (error) {
    log.error("Error uploading card statement receipt", error, { module: "photo", userId: telegramUserId });
    await ctx.reply("Error al guardar el resumen. Intentá de nuevo.");
  }
}


/**
 * Uploads the ARS payment receipt for a statement and optionally prompts for the USD receipt
 * when session.statementAmountUSD > 0 (post-payment flow only).
 *
 * @param {StatementReceiptUploadParams} params
 */
async function handleStatementARSReceiptUpload({
  ctx,
  telegramUserId,
  session,
  fileType,
  documentFileId,
}: StatementReceiptUploadParams): Promise<void> {
  const statementId = session.statementId || "";
  if (!statementId) {
    await ctx.reply("Error: datos de sesión incompletos.");
    return;
  }

  let fileId: string;
  if (fileType === "pdf" && documentFileId) {
    fileId = documentFileId;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const photos = (ctx.message as any).photo as Array<{ file_id: string }>;
    if (!photos || photos.length === 0) {
      await ctx.reply("No se pudo procesar la foto. Intentá de nuevo.");
      return;
    }
    fileId = photos[photos.length - 1].file_id;
  }

  const cardLabel = session.cardLabel || "";
  const amountUSD = session.statementAmountUSD || 0;

  try {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const fileBuffer = await downloadFile(fileLink.href);
    const mimeType = fileType === "pdf"
      ? "application/pdf"
      : (fileLink.href.includes(".png") ? "image/png" : "image/jpeg");

    const receiptUrl = await uploadStatementPaymentReceipt({
      telegramUserId, installmentId: statementId, fileBuffer, mimeType,
    });

    await saveStatementReceiptUrlARS(statementId, receiptUrl);
    await clearSession(telegramUserId);
    await ctx.reply("✅ Comprobante de pago en Pesos guardado.");

    if (amountUSD > 0) {
      await ctx.reply(
        "*¿Querés adjuntar el comprobante de pago en USD?*",
        {
          parse_mode: "Markdown",
          ...buildStmtPayUSDKeyboard(statementId),
        },
      );
    } else {
      const updatedStatement = await getStatementById(statementId);
      if (updatedStatement) {
        await ctx.reply(buildPaymentSummaryText(updatedStatement, cardLabel), { parse_mode: "Markdown" });
      }
    }
  } catch (error) {
    log.error("Error uploading ARS payment receipt", error, { module: "photo", userId: telegramUserId });
    await ctx.reply("Error al guardar el comprobante. Intentá de nuevo.");
  }
}

/**
 * Uploads the USD payment receipt for a statement.
 *
 * @param {StatementReceiptUploadParams} params
 */
async function handleStatementUSDReceiptUpload({
  ctx,
  telegramUserId,
  session,
  fileType,
  documentFileId,
}: StatementReceiptUploadParams): Promise<void> {
  const statementId = session.statementId || "";
  if (!statementId) {
    await ctx.reply("Error: datos de sesión incompletos.");
    return;
  }

  let fileId: string;
  if (fileType === "pdf" && documentFileId) {
    fileId = documentFileId;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const photos = (ctx.message as any).photo as Array<{ file_id: string }>;
    if (!photos || photos.length === 0) {
      await ctx.reply("No se pudo procesar la foto. Intentá de nuevo.");
      return;
    }
    fileId = photos[photos.length - 1].file_id;
  }

  const cardLabel = session.cardLabel || "";

  try {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const fileBuffer = await downloadFile(fileLink.href);
    const mimeType = fileType === "pdf"
      ? "application/pdf"
      : (fileLink.href.includes(".png") ? "image/png" : "image/jpeg");

    const receiptUrl = await uploadStatementPaymentReceiptUSD({
      telegramUserId, installmentId: statementId, fileBuffer, mimeType,
    });

    await saveStatementReceiptUrlUSD(statementId, receiptUrl);
    await clearSession(telegramUserId);
    await ctx.reply("✅ Comprobante de pago en Dólares guardado.");

    const updatedStatement = await getStatementById(statementId);
    if (updatedStatement) {
      await ctx.reply(buildPaymentSummaryText(updatedStatement, cardLabel), { parse_mode: "Markdown" });
    }
  } catch (error) {
    log.error("Error uploading USD payment receipt", error, { module: "photo", userId: telegramUserId });
    await ctx.reply("Error al guardar el comprobante. Intentá de nuevo.");
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
