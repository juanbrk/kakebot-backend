import { Scenes, Markup } from "telegraf";
import { KakebotContext, CardStmtWizardState } from "../../types/telegraf-context.types";
import { StatementCurrency } from "../../types/index";
import { getMessageText } from "../../helpers/wizard";
import { parseArgentineAmount } from "../../helpers/parse-amount";
import { getDaysInMonth, MONTH_NAMES } from "../../helpers/format";
import { log } from "../../helpers/logger";
import {
  buildCardStmtMonthKeyboard,
  buildCardCurrencyKeyboard,
  buildStmtConfirmText,
  buildCardStmtConfirmKeyboard,
  buildCardStmtReceiptKeyboard,
} from "../keyboards/card";
import { createStatement, saveStatementReceiptUrl } from "../../services/card.service";
import { uploadStatementReceipt } from "../../services/storage.service";
import { downloadFile } from "../handlers/photo";

export const CARD_STMT_SCENE_ID = "card-stmt-wizard";
const CANCEL_REGEX = /^\s*(salir|cancelar|terminar|stop)\s*$/i;

const DAY_STEP = 3;
const CREATE_PDF_STEP = 5;
const CURRENCY_STEP = 6;
const MONTH_STEP = 7;
const RECEIPT_PDF_STEP = 8;

// --- Helpers ---

/**
 * Builds the Spanish "Month Year" label for a YYYY-MM string.
 *
 * @param {string} stmtMonth - Month in YYYY-MM format
 * @return {string} e.g. "Abril 2026"
 */
function monthLabelOf(stmtMonth: string): string {
  const [year, month] = stmtMonth.split("-");
  return `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
}

// --- Steps ---

/**
 * Routes to the correct entry step based on the flow discriminator in wizard state.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepInit(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as CardStmtWizardState;

  switch (state.flow) {
  case "create":
    await ctx.reply("*Seleccioná el mes del resumen*", {
      parse_mode: "Markdown",
      ...buildCardStmtMonthKeyboard(state.cardId || "", state.existingMonths || []),
    });
    ctx.wizard.selectStep(MONTH_STEP);
    break;

  case "receipt_pdf":
    await ctx.reply("Enviá la foto o PDF del resumen.");
    ctx.wizard.selectStep(RECEIPT_PDF_STEP);
    break;

  default:
    await ctx.reply("Error: flujo de resumen desconocido.");
    await ctx.scene.leave();
  }
}

/**
 * Create flow: validates the ARS consumos amount.
 * For "both" continues to the USD amount; otherwise jumps to the due day.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepHandleArs(ctx: KakebotContext): Promise<void> {
  const amount = parseArgentineAmount(getMessageText(ctx) ?? "");
  if (amount === null || amount <= 0) {
    await ctx.reply("No entendí el monto. Ingresá solo el número:\nEj: 5000 o 14.819,50");
    return;
  }
  const state = ctx.wizard.state as CardStmtWizardState;
  state.amountARS = amount;

  if (state.statementCurrency === "both") {
    await ctx.reply("*Ingresá el monto de los consumos en dólares*", { parse_mode: "Markdown" });
    ctx.wizard.selectStep(2);
    return;
  }

  state.amountUSD = 0;
  const maxDay = state.statementMonth ? getDaysInMonth(state.statementMonth) : 31;
  await ctx.reply(`*¿Qué día vence el resumen?* (1-${maxDay})`, { parse_mode: "Markdown" });
  ctx.wizard.selectStep(DAY_STEP);
}

/**
 * Create flow: validates the USD consumos amount, then jumps to the due day.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepHandleUsd(ctx: KakebotContext): Promise<void> {
  const amount = parseArgentineAmount(getMessageText(ctx) ?? "");
  if (amount === null || amount <= 0) {
    await ctx.reply("No entendí el monto. Ingresá solo el número:\nEj: 49,47");
    return;
  }
  const state = ctx.wizard.state as CardStmtWizardState;
  state.amountUSD = amount;

  const maxDay = state.statementMonth ? getDaysInMonth(state.statementMonth) : 31;
  await ctx.reply(`*¿Qué día vence el resumen?* (1-${maxDay})`, { parse_mode: "Markdown" });
  ctx.wizard.selectStep(DAY_STEP);
}

/**
 * Create flow: validates the due day, then shows the confirmation screen.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepHandleDay(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as CardStmtWizardState;
  const stmtMonth = state.statementMonth || "";
  const maxDay = stmtMonth ? getDaysInMonth(stmtMonth) : 31;
  const day = parseInt((getMessageText(ctx) ?? "").trim(), 10);
  const isValidDay = Number.isInteger(day) && day >= 1 && day <= maxDay;
  if (!isValidDay) {
    await ctx.reply(`Día inválido. Ingresá un número entre 1 y ${maxDay}.`);
    return;
  }
  state.dueDay = day;

  await ctx.reply(
    buildStmtConfirmText({
      cardLabel: state.cardLabel || "",
      monthLabel: monthLabelOf(stmtMonth),
      amountARS: state.amountARS || 0,
      amountUSD: state.amountUSD || 0,
      dueDay: day,
      stmtMonth,
    }),
    { parse_mode: "Markdown", ...buildCardStmtConfirmKeyboard() },
  );
  ctx.wizard.next();
}

/**
 * Guard step: re-presents the confirmation keyboard when text arrives instead of a button tap.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardCreateConfirm(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as CardStmtWizardState;
  const stmtMonth = state.statementMonth || "";
  await ctx.reply("Confirmá o cancelá el resumen usando los botones.");
  await ctx.reply(
    buildStmtConfirmText({
      cardLabel: state.cardLabel || "",
      monthLabel: monthLabelOf(stmtMonth),
      amountARS: state.amountARS || 0,
      amountUSD: state.amountUSD || 0,
      dueDay: state.dueDay || 0,
      stmtMonth,
    }),
    { parse_mode: "Markdown", ...buildCardStmtConfirmKeyboard() },
  );
}

/**
 * Guard step: re-presents the PDF attach/skip prompt when text arrives.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardCreatePdf(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as CardStmtWizardState;
  await ctx.reply("Adjuntá el PDF del resumen o tocá Omitir.");
  await ctx.reply(
    "¿Deseas adjuntar el PDF del resumen?",
    buildCardStmtReceiptKeyboard(state.statementId || ""),
  );
}

/**
 * Guard step: re-presents the currency keyboard when text arrives.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardCurrency(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Elegí una opción del teclado, o escribí \"cancelar\" para anular.");
  await ctx.reply("*¿El resumen tiene consumos en pesos, dólares o ambos?*", {
    parse_mode: "Markdown",
    ...buildCardCurrencyKeyboard(),
  });
}

/**
 * Guard step: re-presents the month keyboard when text arrives.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardMonth(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as CardStmtWizardState;
  await ctx.reply("Elegí un mes del teclado, o escribí \"cancelar\" para anular.");
  await ctx.reply("*Seleccioná el mes del resumen*", {
    parse_mode: "Markdown",
    ...buildCardStmtMonthKeyboard(state.cardId || "", state.existingMonths || []),
  });
}

/**
 * Guard step: re-presents the bank PDF upload prompt when text arrives (receipt_pdf flow).
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardReceiptPdf(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Esperaba una foto o PDF. Enviá el resumen.");
}

// --- Action handlers ---

/**
 * Stores the selected month and presents the currency keyboard.
 * Callback: card_stmt_month:{cardId}:{YYYY-MM}
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleMonthSelected(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (ctx as any).match as string[];
  const state = ctx.wizard.state as CardStmtWizardState;
  state.statementMonth = match[2];

  await ctx.editMessageText(`*Seleccionaste ${monthLabelOf(match[2])}*`, { parse_mode: "Markdown" });
  await ctx.reply("*¿El resumen tiene consumos en pesos, dólares o ambos?*", {
    parse_mode: "Markdown",
    ...buildCardCurrencyKeyboard(),
  });
  ctx.wizard.selectStep(CURRENCY_STEP);
}

/**
 * Stores the currency choice and prompts for the first amount.
 * Callback: card_stmt_currency:(ars|usd|both)
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleCurrencySelected(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currency = ((ctx as any).match as string[])[1] as StatementCurrency;
  const state = ctx.wizard.state as CardStmtWizardState;
  state.statementCurrency = currency;

  if (currency === "usd") {
    state.amountARS = 0;
    await ctx.editMessageText("*Ingresá el monto de los consumos en dólares*", { parse_mode: "Markdown" });
    ctx.wizard.selectStep(2);
    return;
  }

  await ctx.editMessageText("*Ingresá el monto de los consumos en pesos*", { parse_mode: "Markdown" });
  ctx.wizard.selectStep(1);
}

/**
 * Creates the statement in Firestore and prompts to attach the bank PDF.
 * Callback: card_stmt_confirm
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleConfirm(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() ?? "";
  const state = ctx.wizard.state as CardStmtWizardState;

  const hasStatementData = state.cardId
    && state.statementMonth
    && state.amountARS !== undefined
    && state.dueDay != null;
  if (!hasStatementData) {
    await ctx.reply("Error: datos de sesión incompletos.");
    await ctx.scene.leave();
    return;
  }

  const stmtMonth = state.statementMonth!;
  const [year, month] = stmtMonth.split("-");
  const dueDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, state.dueDay as number);

  let statementId: string;
  try {
    statementId = await createStatement({
      cardId: state.cardId!,
      telegramUserId,
      month: stmtMonth,
      amountARS: state.amountARS as number,
      amountUSD: state.amountUSD || 0,
      dueDate,
    });
  } catch (error) {
    log.error("Error creating statement", error, { module: "card-stmt.scene", userId: telegramUserId });
    await ctx.reply("Error al guardar el resumen. Intentá de nuevo.");
    return;
  }

  state.statementId = statementId;
  await ctx.editMessageText("✅ Resumen cargado correctamente.");
  await ctx.reply("¿Deseas adjuntar el PDF del resumen?", buildCardStmtReceiptKeyboard(statementId));
  ctx.wizard.selectStep(CREATE_PDF_STEP);
}

/**
 * Cancels statement creation and leaves the scene.
 * Callback: card_stmt_cancel
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleCancel(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as CardStmtWizardState;
  const cardId = state.cardId || "";
  await ctx.editMessageText("*Cancelaste la subida del resumen.*", { parse_mode: "Markdown" });
  await ctx.scene.leave();
  if (cardId) {
    await ctx.reply("*¿Qué querés hacer?*", {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([[Markup.button.callback("Ver resúmenes", `card_stmts:${cardId}`)]]),
    });
  }
}

/**
 * Prompts the user to send the bank PDF (after tapping "Adjuntar" in the create flow).
 * Cursor stays at CREATE_PDF_STEP so the dispatcher captures the file.
 * Callback: card_stmt_attach:{statementId}
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleAttachPdf(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await ctx.editMessageText("*Enviá la foto o PDF del resumen.*", { parse_mode: "Markdown" });
}

/**
 * Skips the bank PDF attachment and leaves the scene.
 * Callback: card_stmt_skip
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleSkipPdf(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as CardStmtWizardState;
  const cardId = state.cardId || "";
  await ctx.editMessageText("Podés adjuntar el resumen luego desde el detalle del resumen.");
  await ctx.scene.leave();
  if (cardId) {
    await ctx.reply("*¿Qué querés hacer?*", {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([[Markup.button.callback("Ver resúmenes", `card_stmts:${cardId}`)]]),
    });
  }
}

// --- File upload ---

/**
 * Uploads the bank statement PDF/photo and saves its URL.
 * Shared by the create flow (CREATE_PDF_STEP) and the standalone receipt_pdf flow.
 *
 * @param {KakebotContext} ctx - Wizard context
 * @param {string | null} documentFileId - PDF file_id when handling a document; null for photos
 */
async function handlePdfUpload(ctx: KakebotContext, documentFileId: string | null): Promise<void> {
  const state = ctx.wizard.state as CardStmtWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";
  const statementId = state.statementId || "";
  if (!statementId) {
    await ctx.reply("Error: datos de sesión incompletos.");
    return;
  }

  let fileId: string;
  let mimeType: string;
  if (documentFileId) {
    fileId = documentFileId;
    mimeType = "application/pdf";
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const photos = ((ctx.message as any).photo as Array<{ file_id: string }>) || [];
    if (photos.length === 0) {
      await ctx.reply("No se pudo procesar la foto. Intentá de nuevo.");
      return;
    }
    fileId = photos[photos.length - 1].file_id;
    mimeType = "";
  }

  try {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const fileBuffer = await downloadFile(fileLink.href);
    const resolvedMimeType = mimeType || (fileLink.href.includes(".png") ? "image/png" : "image/jpeg");
    const receiptUrl = await uploadStatementReceipt({
      telegramUserId, installmentId: statementId, fileBuffer, mimeType: resolvedMimeType,
    });
    await saveStatementReceiptUrl(statementId, receiptUrl);

    const cardLabel = state.cardLabel || "";
    const cardId = state.cardId || "";
    const monthLabel = state.statementMonth ? monthLabelOf(state.statementMonth) : "el mes seleccionado";
    await ctx.reply(
      `✅ Se subió correctamente el resumen del mes de *${monthLabel}* de la tarjeta *${cardLabel}*.`,
      { parse_mode: "Markdown" },
    );
    await ctx.scene.leave();
    if (cardId) {
      await ctx.reply("*¿Qué querés hacer?*", {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("Ver resúmenes", `card_stmts:${cardId}`)]]),
      });
    }
  } catch (error) {
    log.error("Error uploading card statement receipt", error, { module: "card-stmt.scene", userId: telegramUserId });
    await ctx.reply("Error al guardar el resumen. Intentá de nuevo.");
  }
}

/**
 * Re-presents the active prompt when an unexpected file arrives at a non-file step.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function repromptCurrentStep(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as CardStmtWizardState;
  await ctx.reply("No esperaba un archivo aquí.");

  switch (ctx.wizard.cursor) {
  case 1:
    await ctx.reply("*Ingresá el monto de los consumos en pesos*", { parse_mode: "Markdown" });
    break;
  case 2:
    await ctx.reply("*Ingresá el monto de los consumos en dólares*", { parse_mode: "Markdown" });
    break;
  case DAY_STEP: {
    const maxDay = state.statementMonth ? getDaysInMonth(state.statementMonth) : 31;
    await ctx.reply(`*¿Qué día vence el resumen?* (1-${maxDay})`, { parse_mode: "Markdown" });
    break;
  }
  case 4: {
    const stmtMonth = state.statementMonth || "";
    await ctx.reply(
      buildStmtConfirmText({
        cardLabel: state.cardLabel || "",
        monthLabel: monthLabelOf(stmtMonth),
        amountARS: state.amountARS || 0,
        amountUSD: state.amountUSD || 0,
        dueDay: state.dueDay || 0,
        stmtMonth,
      }),
      { parse_mode: "Markdown", ...buildCardStmtConfirmKeyboard() },
    );
    break;
  }
  case CURRENCY_STEP:
    await ctx.reply("*¿El resumen tiene consumos en pesos, dólares o ambos?*", {
      parse_mode: "Markdown",
      ...buildCardCurrencyKeyboard(),
    });
    break;
  case MONTH_STEP:
    await ctx.reply("*Seleccioná el mes del resumen*", {
      parse_mode: "Markdown",
      ...buildCardStmtMonthKeyboard(state.cardId || "", state.existingMonths || []),
    });
    break;
  default:
    break;
  }
}

/**
 * Leaves the scene when the user types a cancel word.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleCancelWord(ctx: KakebotContext): Promise<void> {
  await ctx.scene.leave();
  await ctx.reply("Operación cancelada.");
}

// --- Scene export and event registrations ---

export const cardStmtScene = new Scenes.WizardScene<KakebotContext>(
  CARD_STMT_SCENE_ID,
  stepInit, // 0
  stepHandleArs, // 1
  stepHandleUsd, // 2
  stepHandleDay, // 3 = DAY_STEP
  stepGuardCreateConfirm, // 4
  stepGuardCreatePdf, // 5 = CREATE_PDF_STEP
  stepGuardCurrency, // 6 = CURRENCY_STEP
  stepGuardMonth, // 7 = MONTH_STEP
  stepGuardReceiptPdf, // 8 = RECEIPT_PDF_STEP
);

cardStmtScene.hears(CANCEL_REGEX, handleCancelWord);

cardStmtScene.action(/^card_stmt_month:(.+):(\d{4}-\d{2})$/, handleMonthSelected);
cardStmtScene.action(/^card_stmt_currency:(ars|usd|both)$/, handleCurrencySelected);
cardStmtScene.action("card_stmt_confirm", handleConfirm);
cardStmtScene.action("card_stmt_cancel", handleCancel);
cardStmtScene.action(/^card_stmt_attach:(.+)$/, handleAttachPdf);
cardStmtScene.action("card_stmt_skip", handleSkipPdf);

cardStmtScene.on("photo", async (ctx) => {
  const cursor = ctx.wizard.cursor;
  if (cursor === CREATE_PDF_STEP || cursor === RECEIPT_PDF_STEP) {
    await handlePdfUpload(ctx, null);
    return;
  }
  await repromptCurrentStep(ctx);
});

cardStmtScene.on("document", async (ctx) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const document = (ctx.message as any).document as { file_id: string; mime_type?: string } | undefined;
  if (!document) return;
  if (document.mime_type !== "application/pdf") {
    await ctx.reply("Solo se aceptan archivos PDF.");
    return;
  }
  const cursor = ctx.wizard.cursor;
  if (cursor === CREATE_PDF_STEP || cursor === RECEIPT_PDF_STEP) {
    await handlePdfUpload(ctx, document.file_id);
    return;
  }
  await repromptCurrentStep(ctx);
});
