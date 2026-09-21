import { Telegraf, Context, Markup } from "telegraf";
import { KakebotContext, CardStmtWizardState } from "../../types/telegraf-context.types";
import { CARD_CREATE_SCENE_ID } from "../scenes/card-create.scene";
import { CARD_STMT_SCENE_ID } from "../scenes/card-stmt.scene";
import { log } from "../../helpers/logger";
import { replyOrEdit } from "../../helpers/telegram";
import { buildBreadcrumb } from "../../helpers/breadcrumb";
import {
  buildNameListText,
  escapeHtml,
  formatARS,
  formatUSD,
  getCurrentMonth,
  getMonthLabel,
  MONTH_NAMES,
} from "../../helpers/format";
import {
  getCardsByUser,
  getCardById,
  getStatementByCardAndMonth,
  getStatementsByUserAndMonth,
  getStatementById,
  getStatementsByCard,
} from "../../services/card.service";
import { downloadFromUrl } from "../../services/storage.service";
import {
  buildCardListKeyboard,
  buildCardDetailText,
  buildCardDetailKeyboard,
  buildCardLabel,
  buildCardsHubKeyboard,
  buildCardListViewKeyboard,
  buildCardEmptyStateKeyboard,
  buildStatementListKeyboard,
  buildStatementDetailText,
  buildStatementDetailKeyboard,
  buildStatementEditMenuKeyboard,
  buildStmtReceiptsKeyboard,
} from "../keyboards/card";

async function handleCardsHub(ctx: Context): Promise<void> {
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }
  const telegramUserId = String(ctx.from!.id);
  const cards = await getCardsByUser(telegramUserId);
  const breadcrumb = buildBreadcrumb(["Tarjetas"]);

  if (cards.length === 0) {
    await replyOrEdit(
      ctx,
      `${breadcrumb}No tenés ninguna tarjeta registrada.\n\n<b>¿Qué querés hacer?</b>`,
      {
        parse_mode: "HTML",
        ...buildCardEmptyStateKeyboard(),
      },
    );
    return;
  }

  const cardList = buildNameListText(cards.map((card) => buildCardLabel(card)));
  await replyOrEdit(ctx, `${breadcrumb}${cardList}\n\n<b>¿Qué querés hacer?</b>`, {
    parse_mode: "HTML",
    ...buildCardsHubKeyboard(),
  });
}

async function handleOpenCards(ctx: Context): Promise<void> {
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }
  const telegramUserId = String(ctx.from!.id);
  const cards = await getCardsByUser(telegramUserId);
  const breadcrumb = buildBreadcrumb(["Tarjetas", "Seleccionar"]);

  if (cards.length === 0) {
    await replyOrEdit(ctx, `${breadcrumb}No tenés tarjetas registradas.`, {
      parse_mode: "HTML",
      ...buildCardEmptyStateKeyboard(),
    });
    return;
  }

  await replyOrEdit(ctx, `${breadcrumb}Seleccioná una tarjeta:`, {
    parse_mode: "HTML",
    ...buildCardListKeyboard(cards, 0),
  });
}

async function handleCardPagination(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = parseInt(((ctx as any).match as string[])[1], 10);
  const telegramUserId = String(ctx.from!.id);
  const cards = await getCardsByUser(telegramUserId);
  const breadcrumb = buildBreadcrumb(["Tarjetas"]);

  await replyOrEdit(ctx, `${breadcrumb}Seleccioná una tarjeta:`, {
    parse_mode: "HTML",
    ...buildCardListKeyboard(cards, page),
  });
}

/**
 * Renders a card's detail screen, including its current-month statement status.
 *
 * @param {Context} ctx - Telegraf context
 * @return {Promise<void>}
 */
async function handlePickCard(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardId = ((ctx as any).match as string[])[1];

  const currentMonth = getCurrentMonth();

  const [card, statement] = await Promise.all([
    getCardById(cardId),
    getStatementByCardAndMonth(cardId, currentMonth),
  ]);

  if (!card) {
    await replyOrEdit(ctx, "Tarjeta no encontrada.");
    return;
  }

  const label = buildCardLabel(card);
  const breadcrumb = buildBreadcrumb(["Tarjetas", label]);
  const detailText = buildCardDetailText(card, statement, currentMonth);

  await replyOrEdit(ctx, `${breadcrumb}${detailText}`, {
    parse_mode: "HTML",
    ...buildCardDetailKeyboard(cardId, statement),
  });
}

async function handleAddCard(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await replyOrEdit(
    ctx,
    "<b>Vas a registrar una nueva tarjeta de crédito</b>\n" +
      "<i>Enviá la palabra cancelar para salir.</i>",
    { parse_mode: "HTML" },
  );
  await ctx.scene.enter(CARD_CREATE_SCENE_ID);
}

async function handleStartStatement(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardId = ((ctx as any).match as string[])[1];

  const card = await getCardById(cardId);
  if (!card) {
    await replyOrEdit(ctx, "Tarjeta no encontrada.");
    return;
  }

  const cardLabel = buildCardLabel(card);

  await replyOrEdit(
    ctx,
    `<b>Vas a añadir un nuevo resumen para la tarjeta ${escapeHtml(cardLabel)}</b>\n` +
      "<i>Enviá la palabra cancelar para salir.</i>",
    { parse_mode: "HTML" },
  );

  await ctx.scene.enter(CARD_STMT_SCENE_ID, { flow: "create", cardId, cardLabel } as CardStmtWizardState);
}

async function handleSkipStatement(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  await ctx.reply("Podés agregar un resumen desde el detalle de la tarjeta.");
}

/**
 * Sends the statement file to the user with a descriptive filename.
 * Downloads from GCS and forwards as a named document to avoid Telegram
 * naming it "document.dat" when receiving a raw URL.
 *
 * @param {Context} ctx
 */
async function handleDownloadStatementPdf(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];

  const statement = await getStatementById(statementId);

  if (!statement?.receiptUrl) {
    await ctx.reply("No hay PDF adjunto para este resumen.");
    return;
  }

  const card = await getCardById(statement.cardId);
  const cardLabel = card ? buildCardLabel(card) : "";
  const sanitizedLabel = cardLabel
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const [year, month] = statement.month.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  try {
    const { buffer, extension } = await downloadFromUrl(statement.receiptUrl);
    const filename = `${statement.month}-resumen-tarjeta-${sanitizedLabel}.${extension}`;
    await ctx.reply(
      `Acá tenés el resumen de ${monthLabel} para ${cardLabel} en formato PDF`,
    );
    await ctx.replyWithDocument({ source: buffer, filename });
  } catch (error) {
    log.error("Error downloading statement PDF", error, { module: "card", action: "handleDownloadStatementPdf" });
    await ctx.reply("❌ No se pudo descargar el archivo. Intentá de nuevo.");
  }
}

/**
 * Renders the statement detail view for a given statementId.
 * Shared by handleStatementDetail, handleConfirmEdit, and handleAttachStatementPdfFromHistory.
 *
 * @param {Context} ctx
 * @param {string} statementId
 */
async function showStatementDetail(
  ctx: Context,
  statementId: string,
): Promise<void> {
  const statement = await getStatementById(statementId);
  if (!statement) {
    await replyOrEdit(ctx, "Resumen no encontrado.");
    return;
  }

  const card = await getCardById(statement.cardId);
  const cardLabel = card ? buildCardLabel(card) : "";

  const [year, month] = statement.month.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
  const breadcrumb = buildBreadcrumb([
    "Tarjetas",
    cardLabel,
    "Resúmenes",
    monthLabel,
  ]);

  await replyOrEdit(
    ctx,
    `${breadcrumb}${buildStatementDetailText(statement, cardLabel)}`,
    {
      parse_mode: "HTML",
      ...buildStatementDetailKeyboard({
        statementId,
        cardId: statement.cardId,
        isPaid: statement.isPaid,
      }),
    },
  );
}

async function handleStatementsList(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardId = ((ctx as any).match as string[])[1];
  const telegramUserId = String(ctx.from!.id);

  const [card, statements] = await Promise.all([
    getCardById(cardId),
    getStatementsByCard(cardId, telegramUserId),
  ]);

  if (!card) {
    await replyOrEdit(ctx, "Tarjeta no encontrada.");
    return;
  }

  const cardLabel = buildCardLabel(card);

  const breadcrumb = buildBreadcrumb(["Tarjetas", cardLabel, "Resúmenes"]);

  if (statements.length === 0) {
    await replyOrEdit(
      ctx,
      `${breadcrumb}No hay resúmenes registrados para esta tarjeta.`,
      {
        parse_mode: "HTML",
        ...buildStatementListKeyboard({
          statements,
          page: 0,
          cardId,
          cardLabel,
        }),
      },
    );
    return;
  }

  await replyOrEdit(ctx, `${breadcrumb}<b>Seleccioná un resumen:</b>`, {
    parse_mode: "HTML",
    ...buildStatementListKeyboard({ statements, page: 0, cardId, cardLabel }),
  });
}

async function handleStatementsListPagination(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardId = ((ctx as any).match as string[])[1];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = parseInt(((ctx as any).match as string[])[2], 10);
  const telegramUserId = String(ctx.from!.id);

  const statements = await getStatementsByCard(cardId, telegramUserId);

  const card = await getCardById(cardId);
  const cardLabel = card ? buildCardLabel(card) : "";

  const breadcrumb = buildBreadcrumb(["Tarjetas", cardLabel, "Resúmenes"]);

  await replyOrEdit(ctx, `${breadcrumb}<b>Seleccioná un resumen:</b>`, {
    parse_mode: "HTML",
    ...buildStatementListKeyboard({ statements, page, cardId, cardLabel }),
  });
}

async function handleStatementDetail(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];
  await showStatementDetail(ctx, statementId);
}

async function handleAttachStatementPdfFromHistory(
  ctx: KakebotContext,
): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];

  const statement = await getStatementById(statementId);
  if (!statement) {
    await replyOrEdit(ctx, "Resumen no encontrado.");
    return;
  }

  const card = await getCardById(statement.cardId);
  const cardLabel = card ? buildCardLabel(card) : "";

  const [year, month] = statement.month.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  await replyOrEdit(
    ctx,
    `<b>Vas a adjuntar el PDF del resumen de ${monthLabel} de la tarjeta ${escapeHtml(cardLabel)}</b>\n` +
      "<i>Enviá la palabra cancelar para salir.</i>",
    { parse_mode: "HTML" },
  );
  await ctx.scene.enter(CARD_STMT_SCENE_ID, {
    flow: "receipt_pdf",
    statementId,
    cardId: statement.cardId,
    cardLabel,
    statementMonth: statement.month,
  } as CardStmtWizardState);
}

async function handleStatementEditMenu(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];

  const statement = await getStatementById(statementId);
  if (!statement) {
    await replyOrEdit(ctx, "Resumen no encontrado.");
    return;
  }

  const card = await getCardById(statement.cardId);
  const cardLabel = card ? buildCardLabel(card) : "";

  const [year, month] = statement.month.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
  const breadcrumb = buildBreadcrumb([
    "Tarjetas",
    cardLabel,
    "Resúmenes",
    monthLabel,
    "Modificar",
  ]);

  await replyOrEdit(ctx, `${breadcrumb}<b>¿Qué querés modificar?</b>`, {
    parse_mode: "HTML",
    ...buildStatementEditMenuKeyboard(statementId),
  });
}

async function handleEditArs(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];

  const statement = await getStatementById(statementId);
  if (!statement) {
    await replyOrEdit(ctx, "Resumen no encontrado.");
    return;
  }

  const card = await getCardById(statement.cardId);
  const cardLabel = card ? buildCardLabel(card) : "";

  await replyOrEdit(
    ctx,
    `<b>Vas a modificar el monto en pesos para la tarjeta ${escapeHtml(cardLabel)}</b>\n`
    + "<i>Enviá la palabra cancelar para salir.</i>",
    { parse_mode: "HTML" },
  );
  await (ctx as unknown as KakebotContext).scene.enter(CARD_STMT_SCENE_ID, {
    flow: "edit_ars",
    statementId,
    cardLabel,
    cardId: statement.cardId,
    statementMonth: statement.month,
  } as CardStmtWizardState);
}

async function handleEditUsd(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];

  const statement = await getStatementById(statementId);
  if (!statement) {
    await replyOrEdit(ctx, "Resumen no encontrado.");
    return;
  }

  const card = await getCardById(statement.cardId);
  const cardLabel = card ? buildCardLabel(card) : "";

  await replyOrEdit(
    ctx,
    `<b>Vas a modificar el monto en dólares para la tarjeta ${escapeHtml(cardLabel)}</b>\n`
    + "<i>Enviá la palabra cancelar para salir.</i>",
    { parse_mode: "HTML" },
  );
  await (ctx as unknown as KakebotContext).scene.enter(CARD_STMT_SCENE_ID, {
    flow: "edit_usd",
    statementId,
    cardLabel,
    cardId: statement.cardId,
    statementMonth: statement.month,
    isPaid: statement.isPaid === true,
  } as CardStmtWizardState);
}

async function handleEditDay(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];

  const statement = await getStatementById(statementId);
  if (!statement) {
    await replyOrEdit(ctx, "Resumen no encontrado.");
    return;
  }

  const card = await getCardById(statement.cardId);
  const cardLabel = card ? buildCardLabel(card) : "";

  await replyOrEdit(
    ctx,
    `<b>Vas a modificar el vencimiento para la tarjeta ${escapeHtml(cardLabel)}</b>\n` +
    "<i>Enviá la palabra cancelar para salir.</i>",
    { parse_mode: "HTML" },
  );
  await (ctx as unknown as KakebotContext).scene.enter(CARD_STMT_SCENE_ID, {
    flow: "edit_day",
    statementId,
    cardLabel,
    cardId: statement.cardId,
    statementMonth: statement.month,
  } as CardStmtWizardState);
}


/**
 * Renders the "Ver como listado" screen with each card's current-month statement status.
 *
 * @param {Context} ctx - Telegraf context
 * @return {Promise<void>}
 */
async function handleListAllCards(ctx: Context): Promise<void> {
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }
  const telegramUserId = String(ctx.from!.id);

  const currentMonth = getCurrentMonth();
  const monthLabel = getMonthLabel(currentMonth);

  const [cards, statements] = await Promise.all([
    getCardsByUser(telegramUserId),
    getStatementsByUserAndMonth(telegramUserId, currentMonth),
  ]);

  const breadcrumb = buildBreadcrumb(["Tarjetas", "Lista"]);

  if (cards.length === 0) {
    await replyOrEdit(ctx, `${breadcrumb}No hay tarjetas registradas.`, {
      parse_mode: "HTML",
      ...buildCardListViewKeyboard(),
    });
    return;
  }

  const statementByCardId = new Map(
    statements.map((stmt) => [stmt.cardId, stmt]),
  );

  const totalARS = statements.reduce((sum, stmt) => sum + stmt.amountARS, 0);

  const lines: string[] = [];
  lines.push(`<b>${breadcrumb}Tarjetas ${monthLabel}</b>`);
  lines.push("");

  for (const card of cards) {
    const stmt = statementByCardId.get(card.id || "");
    const label = `  • <b>${escapeHtml(buildCardLabel(card))}</b>`;
    if (stmt) {
      let cardLine = `${label}: ${formatARS(stmt.amountARS)}`;
      if (stmt.amountUSD > 0) {
        cardLine += ` + ${formatUSD(stmt.amountUSD)}`;
      }
      lines.push(cardLine);
    } else {
      lines.push(`${label}: sin resumen`);
    }
  }

  lines.push("");
  lines.push(`<b>Total</b>: ${formatARS(totalARS)}`);

  lines.push("");
  lines.push("<b>Vencimientos</b>");

  for (const card of cards) {
    const stmt = statementByCardId.get(card.id || "");
    const label = `  • <b>${escapeHtml(buildCardLabel(card))}</b>`;
    if (stmt) {
      const dueDate = stmt.dueDate.toDate();
      const day = String(dueDate.getDate()).padStart(2, "0");
      const mo = String(dueDate.getMonth() + 1).padStart(2, "0");
      const estado = stmt.isPaid ? "✅ Pagado" : "Pendiente de pago";
      lines.push(`${label}: ${day}/${mo} — ${estado}`);
    } else {
      lines.push(`${label}: -`);
    }
  }

  await replyOrEdit(ctx, lines.join("\n"), {
    parse_mode: "HTML",
    ...buildCardListViewKeyboard(),
  });
}

/**
 * Starts the statement payment flow by entering the card-statement wizard with flow "pay".
 * The scene handles the TCV (exchange rate) prompt when the statement has a USD component,
 * otherwise marks it paid and prompts for the ARS receipt.
 *
 * @param {KakebotContext} ctx
 */
async function handleMarkStatementAsPaid(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];

  const statement = await getStatementById(statementId);
  if (!statement) {
    await replyOrEdit(ctx, "Resumen no encontrado.");
    return;
  }

  const card = await getCardById(statement.cardId);
  const cardLabel = card ? buildCardLabel(card) : "";

  await ctx.scene.enter(CARD_STMT_SCENE_ID, {
    flow: "pay",
    statementId,
    cardId: statement.cardId,
    cardLabel,
    statementMonth: statement.month,
    statementAmountUSD: statement.amountUSD ?? 0,
  } as CardStmtWizardState);
}


/**
 * Shows the Comprobantes submenu for a statement: download/upload receipt PDF,
 * download/attach ARS and USD payment receipts.
 *
 * @param {Context} ctx
 */
async function handleStmtReceiptsMenu(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];

  const statement = await getStatementById(statementId);
  if (!statement) {
    await replyOrEdit(ctx, "Resumen no encontrado.");
    return;
  }

  const card = await getCardById(statement.cardId);
  const cardLabel = card ? buildCardLabel(card) : "";

  const [year, month] = statement.month.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
  const breadcrumb = buildBreadcrumb(["Tarjetas", cardLabel, "Resúmenes", monthLabel, "Comprobantes"]);

  await replyOrEdit(
    ctx,
    `${breadcrumb}<b>¿Qué querés hacer?</b>`,
    {
      parse_mode: "HTML",
      ...buildStmtReceiptsKeyboard({
        statementId,
        hasReceipt: !!statement.receiptUrl,
        isPaid: statement.isPaid,
        hasReceiptARS: !!statement.receiptUrlARS,
        hasReceiptUSD: !!statement.receiptUrlUSD,
        amountUSD: statement.amountUSD,
      }),
    },
  );
}

/**
 * Enters the card-stmt scene with flow "receipt_ars" to attach an ARS payment receipt
 * from the Comprobantes submenu (standalone, not part of the payment flow).
 *
 * @param {KakebotContext} ctx
 */
async function handleStmtReceiptsAttachARS(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];

  const statement = await getStatementById(statementId);
  if (!statement) {
    await replyOrEdit(ctx, "Resumen no encontrado.");
    return;
  }

  const card = await getCardById(statement.cardId);
  const cardLabel = card ? buildCardLabel(card) : "";

  const [year, month] = statement.month.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  await replyOrEdit(
    ctx,
    `<i>${monthLabel} · ${escapeHtml(cardLabel)} — adjuntando comprobante ARS</i>`,
    { parse_mode: "HTML" },
  );
  await ctx.scene.enter(CARD_STMT_SCENE_ID, {
    flow: "receipt_ars",
    statementId,
    cardId: statement.cardId,
    cardLabel,
    statementMonth: statement.month,
  } as CardStmtWizardState);
}

/**
 * Enters the card-stmt scene with flow "receipt_usd" to attach a USD payment receipt
 * from the Comprobantes submenu (standalone, not part of the payment flow).
 *
 * @param {KakebotContext} ctx
 */
async function handleAttachReceiptUSD(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];

  const statement = await getStatementById(statementId);
  if (!statement) {
    await replyOrEdit(ctx, "Resumen no encontrado.");
    return;
  }

  const card = await getCardById(statement.cardId);
  const cardLabel = card ? buildCardLabel(card) : "";

  const [year, month] = statement.month.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  await replyOrEdit(
    ctx,
    `<i>${monthLabel} · ${escapeHtml(cardLabel)} — adjuntando comprobante USD</i>`,
    { parse_mode: "HTML" },
  );
  await ctx.scene.enter(CARD_STMT_SCENE_ID, {
    flow: "receipt_usd",
    statementId,
    cardId: statement.cardId,
    cardLabel,
    statementMonth: statement.month,
  } as CardStmtWizardState);
}

/**
 * Downloads and sends the ARS payment receipt (comprobante de pago en pesos).
 *
 * @param {Context} ctx
 */
async function handleDownloadPaymentReceiptARS(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];

  const statement = await getStatementById(statementId);
  if (!statement?.receiptUrlARS) {
    await ctx.reply("No hay comprobante ARS adjunto para este resumen.");
    return;
  }

  const card = await getCardById(statement.cardId);
  const cardLabel = card ? buildCardLabel(card) : "";
  const sanitizedLabel = cardLabel.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const [year, month] = statement.month.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  try {
    const { buffer, extension } = await downloadFromUrl(statement.receiptUrlARS);
    const filename = `${statement.month}-comprobante-ars-${sanitizedLabel}.${extension}`;
    await ctx.reply(`Acá tenés el comprobante de pago en ARS de ${monthLabel} para ${cardLabel}`);
    await ctx.replyWithDocument({ source: buffer, filename });
  } catch (error) {
    log.error("Error downloading ARS payment receipt", error, { module: "card", action: "handleDownloadPaymentReceiptARS" });
    await ctx.reply("❌ No se pudo descargar el archivo. Intentá de nuevo.");
  }
}

/**
 * Downloads and sends the USD payment receipt (comprobante de pago en dólares).
 *
 * @param {Context} ctx
 */
async function handleDownloadPaymentReceiptUSD(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];

  const statement = await getStatementById(statementId);
  if (!statement?.receiptUrlUSD) {
    await ctx.reply("No hay comprobante USD adjunto para este resumen.");
    return;
  }

  const card = await getCardById(statement.cardId);
  const cardLabel = card ? buildCardLabel(card) : "";
  const sanitizedLabel = cardLabel.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const [year, month] = statement.month.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  try {
    const { buffer, extension } = await downloadFromUrl(statement.receiptUrlUSD);
    const filename = `${statement.month}-comprobante-usd-${sanitizedLabel}.${extension}`;
    await ctx.reply(`Acá tenés el comprobante de pago en USD de ${monthLabel} para ${cardLabel}`);
    await ctx.replyWithDocument({ source: buffer, filename });
  } catch (error) {
    log.error("Error downloading USD payment receipt", error, { module: "card", action: "handleDownloadPaymentReceiptUSD" });
    await ctx.reply("❌ No se pudo descargar el archivo. Intentá de nuevo.");
  }
}

/**
 * Initiates statement creation from the statement list view.
 * Filters out months that already have a statement.
 *
 * @param {Context} ctx
 */
async function handleAddStatementFromList(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() ?? "";

  const [card, statements] = await Promise.all([
    getCardById(cardId),
    getStatementsByCard(cardId, telegramUserId),
  ]);

  if (!card) {
    await replyOrEdit(ctx, "Tarjeta no encontrada.");
    return;
  }

  const cardLabel = buildCardLabel(card);
  const existingMonths = statements.map((s) => s.month);

  const now = new Date();
  const upcomingMonths = Array.from({ length: 3 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const availableMonths = upcomingMonths.filter((m) => !existingMonths.includes(m));

  if (availableMonths.length === 0) {
    await replyOrEdit(
      ctx,
      `<b>Ya existen resúmenes para los próximos 3 meses de ${escapeHtml(cardLabel)}.</b>`,
      {
        parse_mode: "HTML",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: Markup.inlineKeyboard([[
          Markup.button.callback("← Volver", `card_stmts:${cardId}`),
        ]]).reply_markup as any,
      },
    );
    return;
  }

  await replyOrEdit(
    ctx,
    `<b>Vas a añadir un nuevo resumen para la tarjeta ${escapeHtml(cardLabel)}</b>\n` +
    "<i>Enviá la palabra cancelar para salir.</i>",
    { parse_mode: "HTML" },
  );

  await ctx.scene.enter(CARD_STMT_SCENE_ID, {
    flow: "create",
    cardId,
    cardLabel,
    existingMonths,
  } as CardStmtWizardState);
}

/**
 * Registers all card-related handlers on the bot.
 *
 * @param {Telegraf<Context>} bot
 */
export function registerCardHandler(bot: Telegraf<KakebotContext>): void {
  bot.command("tarjetas", handleCardsHub);
  bot.action("menu_tarjetas", handleCardsHub);
  bot.action("card_select", handleOpenCards);
  bot.action("card_list", handleOpenCards);
  bot.action("card_list_view", handleListAllCards);

  bot.action("card_add", handleAddCard);
  bot.action(/^card_pick:(.+)$/, handlePickCard);
  bot.action(/^card_pg:(\d+)$/, handleCardPagination);
  bot.action(/^card_stmt_reg:(.+)$/, handleStartStatement);
  bot.action(/^card_stmt_add:(.+)$/, handleAddStatementFromList);
  bot.action("card_stmt_no", handleSkipStatement);
  bot.action(/^card_stmt_download:(.+)$/, handleDownloadStatementPdf);

  // Statement history
  bot.action(/^card_stmts:(.+)$/, handleStatementsList);
  bot.action(/^card_stmts_pg:(.+):(\d+)$/, handleStatementsListPagination);
  bot.action(/^card_stmt_detail:(.+)$/, handleStatementDetail);
  bot.action(/^card_hist_attach:(.+)$/, handleAttachStatementPdfFromHistory);

  // Statement edit — specific patterns must be registered before the general card_stmt_edit
  bot.action(/^card_edit_ars:(.+)$/, handleEditArs);
  bot.action(/^card_edit_usd:(.+)$/, handleEditUsd);
  bot.action(/^card_edit_day:(.+)$/, handleEditDay);
  bot.action(/^card_stmt_edit:(.+)$/, handleStatementEditMenu);

  // Statement payment
  bot.action(/^card_stmt_pay:(.+)$/, handleMarkStatementAsPaid);
  bot.action(/^card_stmt_receipts:(.+)$/, handleStmtReceiptsMenu);
  bot.action(/^card_stmt_receipts_attach_ars:(.+)$/, handleStmtReceiptsAttachARS);
  bot.action(/^card_stmt_receipts_attach_usd:(.+)$/, handleAttachReceiptUSD);
  bot.action(/^card_stmt_pay_download_ars:(.+)$/, handleDownloadPaymentReceiptARS);
  bot.action(/^card_stmt_pay_download_usd:(.+)$/, handleDownloadPaymentReceiptUSD);
}
