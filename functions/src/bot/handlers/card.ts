import { Telegraf, Context, Markup } from "telegraf";
import { CreditCardProcessor, StatementCurrency } from "../../types/index";
import { log } from "../../helpers/logger";
import { replyOrEdit } from "../../helpers/telegram";
import { buildBreadcrumb } from "../../helpers/breadcrumb";
import { formatARS, formatUSD, MONTH_NAMES } from "../../helpers/format";
import {
  getSession,
  setSession,
  clearSession,
  emptySessionForPartial,
} from "../../services/session.service";
import {
  getCardsByUser,
  getCardById,
  getStatementByCardAndMonth,
  getStatementsByUserAndMonth,
  getStatementById,
  getStatementsByCard,
  createCard,
  createStatement,
  updateStatementAmountARS,
  updateStatementAmountUSD,
  updateStatementDueDay,
  markStatementAsPaid,
} from "../../services/card.service";
import { downloadFromUrl } from "../../services/storage.service";
import {
  buildCardListKeyboard,
  buildCardDetailText,
  buildCardDetailKeyboard,
  buildCardStmtMonthKeyboard,
  buildCardStmtReceiptKeyboard,
  buildCardCurrencyKeyboard,
  buildCardStmtAfterCreateKeyboard,
  buildCardLabel,
  buildCardsHubKeyboard,
  buildCardListViewKeyboard,
  buildCardEmptyStateKeyboard,
  buildStatementListKeyboard,
  buildStatementDetailText,
  buildStatementDetailKeyboard,
  buildStatementEditMenuKeyboard,
  buildStmtPayARSKeyboard,
  buildStmtPayUSDKeyboard,
  buildStmtReceiptsKeyboard,
} from "../keyboards/card";

async function handleCardsHub(ctx: Context): Promise<void> {
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }
  const breadcrumb = buildBreadcrumb(["Tarjetas"]);

  await replyOrEdit(ctx, `${breadcrumb}¿Qué querés hacer con tus tarjetas?`, {
    parse_mode: "Markdown",
    ...buildCardsHubKeyboard(),
  });
}

async function handleOpenCards(ctx: Context): Promise<void> {
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }
  const telegramUserId = String(ctx.from!.id);
  const cards = await getCardsByUser(telegramUserId);
  const breadcrumb = buildBreadcrumb(["Tarjetas", "Listado"]);

  if (cards.length === 0) {
    await replyOrEdit(ctx, `${breadcrumb}No tenés tarjetas registradas.`, {
      parse_mode: "Markdown",
      ...buildCardEmptyStateKeyboard(),
    });
    return;
  }

  await replyOrEdit(ctx, `${breadcrumb}Seleccioná una tarjeta:`, {
    parse_mode: "Markdown",
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
    parse_mode: "Markdown",
    ...buildCardListKeyboard(cards, page),
  });
}

async function handlePickCard(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardId = ((ctx as any).match as string[])[1];

  const now = new Date();
  const monthStr = String(now.getMonth() + 1).padStart(2, "0");
  const currentMonth = `${now.getFullYear()}-${monthStr}`;

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
  const detailText = buildCardDetailText(card, statement);

  await replyOrEdit(ctx, `${breadcrumb}${detailText}`, {
    parse_mode: "Markdown",
    ...buildCardDetailKeyboard(cardId, statement),
  });
}

async function handleAddCard(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = String(ctx.from!.id);

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "card_awaiting_bank",
  });

  await ctx.editMessageText(
    "*Vas a registrar una nueva tarjeta de crédito*\n" +
      "_Enviá la palabra cancelar para salir._",
    { parse_mode: "Markdown" },
  );

  await ctx.reply(
    "*¿A qué banco pertenece la tarjeta?*\n_Ejemplo: Galicia, BBVA, etc._",
    { parse_mode: "Markdown" },
  );
}

async function handleProcessorSelected(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processor = ((ctx as any).match as string[])[1] as CreditCardProcessor;
  const telegramUserId = String(ctx.from!.id);
  const session = await getSession(telegramUserId);

  if (!session) return;

  await setSession(telegramUserId, {
    ...session,
    state: "card_awaiting_digits",
    cardProcessor: processor,
  });

  await replyOrEdit(ctx, "*Ingresá los últimos 4 dígitos de la tarjeta*", {
    parse_mode: "Markdown",
  });
}

async function handleCardConfirm(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = String(ctx.from!.id);
  const session = await getSession(telegramUserId);

  const hasCardCreationData =
    session &&
    session.partialDescription &&
    session.serviceName &&
    session.cardProcessor &&
    session.selectedMonth;

  if (!hasCardCreationData) {
    await replyOrEdit(ctx, "Error: datos de sesión incompletos.");
    return;
  }

  const digits = session!.partialDescription!;
  const bank = session!.serviceName!;
  const processor = session!.cardProcessor!;
  const [mmStr, yyStr] = session!.selectedMonth!.split("/");
  const expiryMonth = parseInt(mmStr, 10);
  const expiryYear = 2000 + parseInt(yyStr, 10);

  const cardId = await createCard({
    telegramUserId,
    lastFourDigits: digits,
    bank,
    processor,
    expiryMonth,
    expiryYear,
  });

  await clearSession(telegramUserId);

  const processorLabel = processor === "VISA" ? "Visa" : "Master";
  const cardLabel = `${processorLabel} ${digits} - ${bank}`;

  await ctx.reply(`✅ Tarjeta *${cardLabel}* registrada.`, {
    parse_mode: "Markdown",
  });

  await ctx.reply(
    "¿Deseas añadir un resumen mensual?",
    buildCardStmtAfterCreateKeyboard(cardId),
  );
}

async function handleCardCancel(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = String(ctx.from!.id);
  await clearSession(telegramUserId);
  await handleOpenCards(ctx);
}

async function handleStartStatement(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardId = ((ctx as any).match as string[])[1];
  const telegramUserId = String(ctx.from!.id);

  const card = await getCardById(cardId);
  if (!card) {
    await replyOrEdit(ctx, "Tarjeta no encontrada.");
    return;
  }

  const cardLabel = buildCardLabel(card);

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "card_stmt_awaiting_ars",
    cardId,
    cardLabel,
  });

  await ctx.editMessageText(
    `*Vas a añadir un nuevo resumen para la tarjeta ${cardLabel}*\n` +
      "_Enviá la palabra cancelar para salir._",
    { parse_mode: "Markdown" },
  );

  await ctx.reply("*Seleccioná el mes del resumen*", {
    parse_mode: "Markdown",
    ...buildCardStmtMonthKeyboard(cardId),
  });
}

async function handleSkipStatement(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = String(ctx.from!.id);
  await clearSession(telegramUserId);

  await ctx.reply("Podés agregar un resumen desde el detalle de la tarjeta.");
}

async function handleStatementMonthSelected(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardId = ((ctx as any).match as string[])[1];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stmtMonth = ((ctx as any).match as string[])[2];
  const telegramUserId = String(ctx.from!.id);
  const session = await getSession(telegramUserId);

  if (!session) return;

  await setSession(telegramUserId, {
    ...session,
    state: "card_stmt_awaiting_ars",
    cardId,
    statementMonth: stmtMonth,
  });

  const [year, month] = stmtMonth.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  await ctx.editMessageText(`*Seleccionaste ${monthLabel}*\n`, {
    parse_mode: "Markdown",
  });

  await ctx.reply("*¿El resumen tiene consumos en pesos, dólares o ambos?*", {
    parse_mode: "Markdown",
    ...buildCardCurrencyKeyboard(),
  });
}

async function handleCurrencySelected(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currency = ((ctx as any).match as string[])[1] as StatementCurrency;
  const telegramUserId = String(ctx.from!.id);
  const session = await getSession(telegramUserId);

  if (!session) return;

  if (currency === "ars") {
    await setSession(telegramUserId, {
      ...session,
      statementCurrency: "ars",
      state: "card_stmt_awaiting_ars",
    });
    await replyOrEdit(ctx, "*Ingresá el monto de los consumos en pesos*", {
      parse_mode: "Markdown",
    });
  } else if (currency === "usd") {
    await setSession(telegramUserId, {
      ...session,
      statementCurrency: "usd",
      partialAmount: 0,
      state: "card_stmt_awaiting_usd",
    });
    await replyOrEdit(ctx, "*Ingresá el monto de los consumos en dólares*", {
      parse_mode: "Markdown",
    });
  } else {
    await setSession(telegramUserId, {
      ...session,
      statementCurrency: "both",
      state: "card_stmt_awaiting_ars",
    });
    await replyOrEdit(ctx, "*Ingresá el monto de los consumos en pesos*", {
      parse_mode: "Markdown",
    });
  }
}

async function handleStatementCancel(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = String(ctx.from!.id);
  const session = await getSession(telegramUserId);
  const cardId = session?.cardId || "";
  await clearSession(telegramUserId);

  await ctx.editMessageText("*Cancelaste la subida del resumen.*", { parse_mode: "Markdown" });

  if (cardId) {
    await ctx.reply("*¿Qué querés hacer?*", {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([[
        Markup.button.callback("Ver resúmenes", `card_stmts:${cardId}`),
      ]]),
    });
  }
}

async function handleStatementConfirm(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = String(ctx.from!.id);
  const session = await getSession(telegramUserId);

  const hasStatementData =
    session &&
    session.cardId &&
    session.statementMonth &&
    session.partialAmount !== undefined &&
    session.partialDescription;

  if (!hasStatementData) {
    await replyOrEdit(ctx, "Error: datos de sesión incompletos.");
    return;
  }

  const cardId = session!.cardId!;
  const stmtMonth = session!.statementMonth!;
  const amountARS = session!.partialAmount!;
  const amountUSD = session!.partialAmountUSD || 0;
  const dayStr = session!.partialDescription!;
  const day = parseInt(dayStr, 10);
  const cardLabel = session!.cardLabel || "";

  const [year, month] = stmtMonth.split("-");
  const dueDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, day);

  const statementId = await createStatement({
    cardId,
    telegramUserId,
    month: stmtMonth,
    amountARS,
    amountUSD,
    dueDate,
  });

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "card_awaiting_receipt",
    statementId,
    cardLabel,
    statementMonth: stmtMonth,
    cardId,
  });

  await ctx.reply("✅ Resumen cargado correctamente.");

  await ctx.reply(
    "¿Deseas adjuntar el PDF del resumen?",
    buildCardStmtReceiptKeyboard(statementId),
  );
}

async function handleAttachStatementReceipt(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];
  const telegramUserId = String(ctx.from!.id);
  const session = await getSession(telegramUserId);

  const cardLabel = session?.cardLabel || "";
  const stmtMonth = session?.statementMonth || "";

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "card_awaiting_receipt",
    statementId,
    cardLabel,
    statementMonth: stmtMonth,
  });

  const [year, month] = stmtMonth.split("-");
  const monthLabel = stmtMonth
    ? `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`
    : "";

  await ctx.reply(
    `*Vas a adjuntar el PDF del resumen del mes ${monthLabel} de la tarjeta ${cardLabel}*\n` +
      "_Enviá la palabra cancelar para salir._",
    { parse_mode: "Markdown" },
  );

  await ctx.reply("Enviá la foto o PDF del resumen.");
}

async function handleSkipStatementReceipt(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = String(ctx.from!.id);
  const session = await getSession(telegramUserId);
  const cardId = session?.cardId || "";
  await clearSession(telegramUserId);

  if (cardId) {
    await ctx.reply("Podés adjuntar el resumen luego desde el detalle del resumen.", {
      ...Markup.inlineKeyboard([[
        Markup.button.callback("Ver resúmenes", `card_stmts:${cardId}`),
      ]]),
    });
  } else {
    await ctx.reply("Podés adjuntar el resumen luego desde /tarjetas.");
  }
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

  const telegramUserId = String(ctx.from!.id);
  const session = await getSession(telegramUserId);

  let cardLabel = "";
  if (session?.cardId === statement.cardId && session?.cardLabel) {
    cardLabel = session.cardLabel;
  } else {
    const card = await getCardById(statement.cardId);
    cardLabel = card ? buildCardLabel(card) : "";
  }

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
      parse_mode: "Markdown",
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

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "card_awaiting_receipt",
    cardId,
    cardLabel,
  });

  const breadcrumb = buildBreadcrumb(["Tarjetas", cardLabel, "Resúmenes"]);

  if (statements.length === 0) {
    await replyOrEdit(
      ctx,
      `${breadcrumb}No hay resúmenes registrados para esta tarjeta.`,
      {
        parse_mode: "Markdown",
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

  await replyOrEdit(ctx, `${breadcrumb}*Seleccioná un resumen:*`, {
    parse_mode: "Markdown",
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

  const session = await getSession(telegramUserId);
  const statements = await getStatementsByCard(cardId, telegramUserId);

  let cardLabel = "";
  if (session?.cardId === cardId && session?.cardLabel) {
    cardLabel = session.cardLabel;
  } else {
    const card = await getCardById(cardId);
    cardLabel = card ? buildCardLabel(card) : "";
  }

  const breadcrumb = buildBreadcrumb(["Tarjetas", cardLabel, "Resúmenes"]);

  await replyOrEdit(ctx, `${breadcrumb}*Seleccioná un resumen:*`, {
    parse_mode: "Markdown",
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
  ctx: Context,
): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];
  const telegramUserId = String(ctx.from!.id);

  const statement = await getStatementById(statementId);
  if (!statement) {
    await replyOrEdit(ctx, "Resumen no encontrado.");
    return;
  }

  const session = await getSession(telegramUserId);
  let cardLabel = "";
  if (session?.cardId === statement.cardId && session?.cardLabel) {
    cardLabel = session.cardLabel;
  } else {
    const card = await getCardById(statement.cardId);
    cardLabel = card ? buildCardLabel(card) : "";
  }

  const [year, month] = statement.month.split("-");
  const stmtMonth = statement.month;
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "card_awaiting_receipt",
    statementId,
    cardLabel,
    statementMonth: stmtMonth,
    cardId: statement.cardId,
  });

  await ctx.reply(
    `*Vas a adjuntar el PDF del resumen de ${monthLabel} de la tarjeta ${cardLabel}*\n` +
      "_Enviá la palabra cancelar para salir._",
    { parse_mode: "Markdown" },
  );
  await ctx.reply("Enviá la foto o PDF del resumen.");
}

async function handleStatementEditMenu(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];
  const telegramUserId = String(ctx.from!.id);

  const statement = await getStatementById(statementId);
  if (!statement) {
    await replyOrEdit(ctx, "Resumen no encontrado.");
    return;
  }

  const session = await getSession(telegramUserId);
  let cardLabel = "";
  if (session?.cardId === statement.cardId && session?.cardLabel) {
    cardLabel = session.cardLabel;
  } else {
    const card = await getCardById(statement.cardId);
    cardLabel = card ? buildCardLabel(card) : "";
  }

  const [year, month] = statement.month.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
  const breadcrumb = buildBreadcrumb([
    "Tarjetas",
    cardLabel,
    "Resúmenes",
    monthLabel,
    "Modificar",
  ]);

  await replyOrEdit(ctx, `${breadcrumb}*¿Qué querés modificar?*`, {
    parse_mode: "Markdown",
    ...buildStatementEditMenuKeyboard(statementId),
  });
}

async function handleEditArs(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];
  const telegramUserId = String(ctx.from!.id);

  const statement = await getStatementById(statementId);
  if (!statement) {
    await replyOrEdit(ctx, "Resumen no encontrado.");
    return;
  }

  const session = await getSession(telegramUserId);
  let cardLabel = "";
  if (session?.cardId === statement.cardId && session?.cardLabel) {
    cardLabel = session.cardLabel;
  } else {
    const card = await getCardById(statement.cardId);
    cardLabel = card ? buildCardLabel(card) : "";
  }

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "card_stmt_edit_awaiting_ars",
    statementId,
    cardId: statement.cardId,
    cardLabel,
    statementMonth: statement.month,
  });

  await ctx.editMessageText(
    `*Vas a modificar el monto en pesos para la tarjeta ${cardLabel}*\n_Enviá la palabra cancelar para salir._`,
    { parse_mode: "Markdown" },
  );
  await ctx.reply(
    `*Monto actual*: ${formatARS(statement.amountARS)}\n*Ingresá el nuevo monto en pesos:*`,
    { parse_mode: "Markdown" },
  );
}

async function handleEditUsd(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];
  const telegramUserId = String(ctx.from!.id);

  const statement = await getStatementById(statementId);
  if (!statement) {
    await replyOrEdit(ctx, "Resumen no encontrado.");
    return;
  }

  const session = await getSession(telegramUserId);
  let cardLabel = "";
  if (session?.cardId === statement.cardId && session?.cardLabel) {
    cardLabel = session.cardLabel;
  } else {
    const card = await getCardById(statement.cardId);
    cardLabel = card ? buildCardLabel(card) : "";
  }

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "card_stmt_edit_awaiting_usd",
    statementId,
    cardId: statement.cardId,
    cardLabel,
    statementMonth: statement.month,
  });

  const currentUsd =
    statement.amountUSD > 0
      ? formatUSD(statement.amountUSD)
      : "sin monto en dólares";

  await ctx.editMessageText(
    `*Vas a modificar el monto en dólares para la tarjeta ${cardLabel}*\n_Enviá la palabra cancelar para salir._`,
    { parse_mode: "Markdown" },
  );
  await ctx.reply(
    `*Monto actual*: ${currentUsd}\n*Ingresá el nuevo monto en dólares:*`,
    { parse_mode: "Markdown" },
  );
}

async function handleEditDay(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];
  const telegramUserId = String(ctx.from!.id);

  const statement = await getStatementById(statementId);
  if (!statement) {
    await replyOrEdit(ctx, "Resumen no encontrado.");
    return;
  }

  const [year, month] = statement.month.split("-").map(Number);
  const maxDay = new Date(year, month, 0).getDate();
  const currentDay = statement.dueDate.toDate().getDate();

  const session = await getSession(telegramUserId);
  let cardLabel = "";
  if (session?.cardId === statement.cardId && session?.cardLabel) {
    cardLabel = session.cardLabel;
  } else {
    const card = await getCardById(statement.cardId);
    cardLabel = card ? buildCardLabel(card) : "";
  }

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "card_stmt_edit_awaiting_day",
    statementId,
    cardId: statement.cardId,
    cardLabel,
    statementMonth: statement.month,
  });

  await ctx.editMessageText(
    `*Vas a modificar el vencimiento para la tarjeta ${cardLabel}*\n_Enviá la palabra cancelar para salir._`,
    { parse_mode: "Markdown" },
  );
  await ctx.reply(
    `*Vencimiento actual*: ${String(currentDay).padStart(2, "0")}/${String(month).padStart(2, "0")}\n*Ingresá el nuevo día (1-${maxDay}):*`,
    { parse_mode: "Markdown" },
  );
}

async function handleConfirmEdit(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (ctx as any).match as string[];
  const field = match[1] as "ars" | "usd" | "day";
  const statementId = match[2];
  const value = match[3];
  const telegramUserId = String(ctx.from!.id);

  await clearSession(telegramUserId);

  if (field === "ars") {
    await updateStatementAmountARS({ statementId, amount: parseFloat(value) });
  } else if (field === "usd") {
    await updateStatementAmountUSD({ statementId, amount: parseFloat(value) });
  } else {
    await updateStatementDueDay({ statementId, newDay: parseInt(value, 10) });
  }

  await showStatementDetail(ctx, statementId);
}

async function handleListAllCards(ctx: Context): Promise<void> {
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }
  const telegramUserId = String(ctx.from!.id);

  const now = new Date();
  const monthStr = String(now.getMonth() + 1).padStart(2, "0");
  const currentMonth = `${now.getFullYear()}-${monthStr}`;
  const monthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;

  const [cards, statements] = await Promise.all([
    getCardsByUser(telegramUserId),
    getStatementsByUserAndMonth(telegramUserId, currentMonth),
  ]);

  const breadcrumb = buildBreadcrumb(["Tarjetas", "Lista"]);

  if (cards.length === 0) {
    await replyOrEdit(ctx, `${breadcrumb}No hay tarjetas registradas.`, {
      parse_mode: "Markdown",
      ...buildCardListViewKeyboard(),
    });
    return;
  }

  const statementByCardId = new Map(
    statements.map((stmt) => [stmt.cardId, stmt]),
  );

  const totalARS = statements.reduce((sum, stmt) => sum + stmt.amountARS, 0);

  const lines: string[] = [];
  lines.push(`*${breadcrumb}Tarjetas ${monthLabel}*`);
  lines.push("");

  for (const card of cards) {
    const stmt = statementByCardId.get(card.id || "");
    const label = `  • *${buildCardLabel(card)}*`;
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
  lines.push(`*Total*: ${formatARS(totalARS)}`);

  lines.push("");
  lines.push("*Vencimientos*");

  for (const card of cards) {
    const stmt = statementByCardId.get(card.id || "");
    const label = `  • *${buildCardLabel(card)}*`;
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
    parse_mode: "Markdown",
    ...buildCardListViewKeyboard(),
  });
}

/**
 * Marks a statement as paid. If the statement has a USD component, prompts for the TCV
 * (exchange rate) first via session state; otherwise marks paid immediately and prompts for ARS receipt.
 *
 * @param {Context} ctx
 */
async function handleMarkStatementAsPaid(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];
  const telegramUserId = String(ctx.from!.id);

  const statement = await getStatementById(statementId);
  if (!statement) {
    await replyOrEdit(ctx, "Resumen no encontrado.");
    return;
  }

  const session = await getSession(telegramUserId);
  let cardLabel = "";
  if (session?.cardId === statement.cardId && session?.cardLabel) {
    cardLabel = session.cardLabel;
  } else {
    const card = await getCardById(statement.cardId);
    cardLabel = card ? buildCardLabel(card) : "";
  }

  const [year, month] = statement.month.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  if (statement.amountUSD > 0) {
    await setSession(telegramUserId, {
      ...emptySessionForPartial(telegramUserId),
      state: "card_stmt_awaiting_exchange_rate",
      statementId,
      cardLabel,
      statementMonth: statement.month,
      cardId: statement.cardId,
      statementAmountUSD: statement.amountUSD,
    });
    await ctx.editMessageText(
      `_${monthLabel} · ${cardLabel}_\n\n`
      + "*Ingresá el TCV (tipo de cambio vendedor) para registrar el pago.*\n"
      + `_El resumen incluye ${formatUSD(statement.amountUSD)} USD._`,
      { parse_mode: "Markdown" },
    );
    return;
  }

  await markStatementAsPaid({ statementId });
  await ctx.editMessageText(
    `✅ Resumen marcado como pagado.\n_${monthLabel} · ${cardLabel}_`,
    { parse_mode: "Markdown" },
  );
  await ctx.reply(
    `*¿Querés adjuntar el comprobante de pago en ARS del resumen ${monthLabel}?*`,
    {
      parse_mode: "Markdown",
      ...buildStmtPayARSKeyboard({ statementId, hasUSD: false }),
    },
  );
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

  const telegramUserId = String(ctx.from!.id);
  const session = await getSession(telegramUserId);
  let cardLabel = "";
  if (session?.cardId === statement.cardId && session?.cardLabel) {
    cardLabel = session.cardLabel;
  } else {
    const card = await getCardById(statement.cardId);
    cardLabel = card ? buildCardLabel(card) : "";
  }

  const [year, month] = statement.month.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
  const breadcrumb = buildBreadcrumb(["Tarjetas", cardLabel, "Resúmenes", monthLabel, "Comprobantes"]);

  await ctx.editMessageText(
    `${breadcrumb}*¿Qué querés hacer?*`,
    {
      parse_mode: "Markdown",
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
 * Sets session to card_stmt_awaiting_receipt_ars after the "Adjuntar ARS" button
 * in the post-payment prompt. Stores statementAmountUSD so photo.ts knows whether
 * to follow up with a USD receipt prompt.
 *
 * @param {Context} ctx
 */
async function handleAttachPaymentReceiptARS(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];
  const telegramUserId = String(ctx.from!.id);

  const statement = await getStatementById(statementId);
  if (!statement) {
    await replyOrEdit(ctx, "Resumen no encontrado.");
    return;
  }

  const session = await getSession(telegramUserId);
  let cardLabel = "";
  if (session?.cardId === statement.cardId && session?.cardLabel) {
    cardLabel = session.cardLabel;
  } else {
    const card = await getCardById(statement.cardId);
    cardLabel = card ? buildCardLabel(card) : "";
  }

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "card_stmt_awaiting_receipt_ars",
    statementId,
    cardLabel,
    statementMonth: statement.month,
    cardId: statement.cardId,
    statementAmountUSD: statement.amountUSD,
  });

  await ctx.editMessageText(
    "*Enviá la foto o PDF del comprobante de pago en ARS.*",
    { parse_mode: "Markdown" },
  );
}

/**
 * Sets session to card_stmt_awaiting_receipt_ars from the Comprobantes submenu.
 * Uses statementAmountUSD: 0 to suppress the USD follow-up prompt since this is
 * a standalone attachment, not part of the payment flow.
 *
 * @param {Context} ctx
 */
async function handleStmtReceiptsAttachARS(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];
  const telegramUserId = String(ctx.from!.id);

  const statement = await getStatementById(statementId);
  if (!statement) {
    await replyOrEdit(ctx, "Resumen no encontrado.");
    return;
  }

  const session = await getSession(telegramUserId);
  let cardLabel = "";
  if (session?.cardId === statement.cardId && session?.cardLabel) {
    cardLabel = session.cardLabel;
  } else {
    const card = await getCardById(statement.cardId);
    cardLabel = card ? buildCardLabel(card) : "";
  }

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "card_stmt_awaiting_receipt_ars",
    statementId,
    cardLabel,
    statementMonth: statement.month,
    cardId: statement.cardId,
    statementAmountUSD: 0,
  });

  await ctx.editMessageText(
    "*Enviá la foto o PDF del comprobante de pago en ARS.*",
    { parse_mode: "Markdown" },
  );
}

/**
 * Skips the ARS payment receipt. If the statement has USD (hasUSD encoded in callback),
 * shows the USD receipt prompt; otherwise closes the flow.
 *
 * @param {Context} ctx
 */
async function handleSkipARSReceipt(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (ctx as any).match as string[];
  const statementId = match[1];
  const hasUSD = match[2] === "1";

  if (hasUSD) {
    await ctx.editMessageText(
      "*¿Querés adjuntar el comprobante de pago en USD?*",
      {
        parse_mode: "Markdown",
        ...buildStmtPayUSDKeyboard(statementId),
      },
    );
  } else {
    await ctx.editMessageText(
      "Podés adjuntar el comprobante más tarde desde el detalle del resumen.",
    );
  }
}

/**
 * Sets session to card_stmt_awaiting_receipt_usd and prompts the user to send the USD
 * payment receipt. Used by both the post-payment flow and the Comprobantes submenu.
 *
 * @param {Context} ctx
 */
async function handleAttachReceiptUSD(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];
  const telegramUserId = String(ctx.from!.id);

  const statement = await getStatementById(statementId);
  if (!statement) {
    await replyOrEdit(ctx, "Resumen no encontrado.");
    return;
  }

  const session = await getSession(telegramUserId);
  let cardLabel = "";
  if (session?.cardId === statement.cardId && session?.cardLabel) {
    cardLabel = session.cardLabel;
  } else {
    const card = await getCardById(statement.cardId);
    cardLabel = card ? buildCardLabel(card) : "";
  }

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "card_stmt_awaiting_receipt_usd",
    statementId,
    cardLabel,
    statementMonth: statement.month,
    cardId: statement.cardId,
  });

  await ctx.editMessageText(
    "*Enviá la foto o PDF del comprobante de pago en USD.*",
    { parse_mode: "Markdown" },
  );
}

/**
 * Skips the USD payment receipt and closes the post-payment flow.
 *
 * @param {Context} ctx
 */
async function handleSkipUSDReceipt(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "Podés adjuntar el comprobante USD más tarde desde el detalle del resumen.",
  );
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
 * Filters out months that already have a statement. Sets state to card_stmt_awaiting_month
 * so text.ts won't misroute free text input to the expense parser.
 *
 * @param {Context} ctx
 */
async function handleAddStatementFromList(ctx: Context): Promise<void> {
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
  const existingMonths = statements.map((s) => s.month);

  const now = new Date();
  const upcomingMonths = Array.from({ length: 3 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const availableMonths = upcomingMonths.filter((m) => !existingMonths.includes(m));

  if (availableMonths.length === 0) {
    await ctx.editMessageText(
      `*Ya existen resúmenes para los próximos 3 meses de ${cardLabel}.*`,
      {
        parse_mode: "Markdown",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: Markup.inlineKeyboard([[
          Markup.button.callback("← Volver", `card_stmts:${cardId}`),
        ]]).reply_markup as any,
      },
    );
    return;
  }

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "card_stmt_awaiting_month",
    cardId,
    cardLabel,
  });

  await ctx.editMessageText(
    `*Vas a añadir un nuevo resumen para la tarjeta ${cardLabel}*\n` +
    "_Enviá la palabra cancelar para salir._",
    { parse_mode: "Markdown" },
  );

  await ctx.reply("*Seleccioná el mes del resumen*", {
    parse_mode: "Markdown",
    ...buildCardStmtMonthKeyboard(cardId, existingMonths),
  });
}

/**
 * Registers all card-related handlers on the bot.
 *
 * @param {Telegraf<Context>} bot
 */
export function registerCardHandler(bot: Telegraf<Context>): void {
  bot.command("tarjetas", handleCardsHub);
  bot.action("menu_tarjetas", handleCardsHub);
  bot.action("card_select", handleOpenCards);
  bot.action("card_list", handleOpenCards);
  bot.action("card_list_view", handleListAllCards);

  bot.action("card_add", handleAddCard);
  bot.action(/^card_pick:(.+)$/, handlePickCard);
  bot.action(/^card_pg:(\d+)$/, handleCardPagination);
  bot.action(/^card_proc:(VISA|MASTERCARD)$/, handleProcessorSelected);
  bot.action("card_confirm", handleCardConfirm);
  bot.action("card_cancel", handleCardCancel);

  bot.action(/^card_stmt_reg:(.+)$/, handleStartStatement);
  bot.action(/^card_stmt_add:(.+)$/, handleAddStatementFromList);
  bot.action("card_stmt_no", handleSkipStatement);
  bot.action(
    /^card_stmt_month:(.+):(\d{4}-\d{2})$/,
    handleStatementMonthSelected,
  );
  bot.action(/^card_stmt_currency:(ars|usd|both)$/, handleCurrencySelected);
  bot.action("card_stmt_confirm", handleStatementConfirm);
  bot.action("card_stmt_cancel", handleStatementCancel);
  bot.action(/^card_stmt_attach:(.+)$/, handleAttachStatementReceipt);
  bot.action("card_stmt_skip", handleSkipStatementReceipt);
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
  bot.action(/^card_edit_ok:(ars|usd|day):(.+):(.+)$/, handleConfirmEdit);
  bot.action(/^card_stmt_edit:(.+)$/, handleStatementEditMenu);

  // Statement payment
  bot.action(/^card_stmt_pay:(.+)$/, handleMarkStatementAsPaid);
  bot.action(/^card_stmt_receipts:(.+)$/, handleStmtReceiptsMenu);
  bot.action(/^card_stmt_pay_attach_ars:(.+)$/, handleAttachPaymentReceiptARS);
  bot.action(/^card_stmt_receipts_attach_ars:(.+)$/, handleStmtReceiptsAttachARS);
  bot.action(/^card_stmt_pay_ars_skip:(.+):(0|1)$/, handleSkipARSReceipt);
  bot.action(/^card_stmt_pay_attach_usd:(.+)$/, handleAttachReceiptUSD);
  bot.action(/^card_stmt_receipts_attach_usd:(.+)$/, handleAttachReceiptUSD);
  bot.action("card_stmt_pay_usd_skip", handleSkipUSDReceipt);
  bot.action(/^card_stmt_pay_download_ars:(.+)$/, handleDownloadPaymentReceiptARS);
  bot.action(/^card_stmt_pay_download_usd:(.+)$/, handleDownloadPaymentReceiptUSD);
}
