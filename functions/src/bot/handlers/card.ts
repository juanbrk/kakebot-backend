import { Telegraf, Context } from "telegraf";
import { CreditCardProcessor, StatementCurrency } from "../../types/index";
import { replyOrEdit } from "../../helpers/telegram";
import { buildBreadcrumb } from "../../helpers/breadcrumb";
import { MONTH_NAMES } from "../../helpers/format";
import { getSession, setSession, clearSession, emptySessionForPartial }
  from "../../services/session.service";
import {
  getCardsByUser,
  getCardById,
  getStatementByCardAndMonth,
  createCard,
  createStatement,
} from "../../services/card.service";
import {
  buildCardListKeyboard,
  buildCardDetailText,
  buildCardDetailBackKeyboard,
  buildCardStmtMonthKeyboard,
  buildCardStmtReceiptKeyboard,
  buildCardCurrencyKeyboard,
  buildCardStmtAfterCreateKeyboard,
  buildCardLabel,
} from "../keyboards/card";

async function handleOpenCards(ctx: Context): Promise<void> {
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }
  const telegramUserId = String(ctx.from!.id);
  const cards = await getCardsByUser(telegramUserId);
  const breadcrumb = buildBreadcrumb(["Tarjetas"]);

  const text = cards.length > 0 ?
    `${breadcrumb}Seleccioná una tarjeta:` :
    `${breadcrumb}No hay tarjetas registradas.`;

  await replyOrEdit(ctx, text, {
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
    ...buildCardDetailBackKeyboard(cardId),
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

  await replyOrEdit(
    ctx,
    "*Ingresá los últimos 4 dígitos de la tarjeta*",
    { parse_mode: "Markdown" },
  );
}

async function handleCardConfirm(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = String(ctx.from!.id);
  const session = await getSession(telegramUserId);

  const hasCardCreationData =
    session
    && session.partialDescription
    && session.serviceName
    && session.cardProcessor
    && session.selectedMonth;

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
    telegramUserId, lastFourDigits: digits, bank, processor, expiryMonth, expiryYear,
  });

  await clearSession(telegramUserId);

  const processorLabel = processor === "VISA" ? "Visa" : "Master";
  const cardLabel = `${processorLabel} ${digits} - ${bank}`;

  await ctx.reply(
    `✅ Tarjeta *${cardLabel}* registrada.`,
    { parse_mode: "Markdown" },
  );

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

  await ctx.reply(
    "*Seleccioná el mes del resumen*",
    {
      parse_mode: "Markdown",
      ...buildCardStmtMonthKeyboard(cardId),
    },
  );
}

async function handleSkipStatement(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = String(ctx.from!.id);
  await clearSession(telegramUserId);

  await ctx.reply(
    "Podés agregar un resumen desde el detalle de la tarjeta.",
  );
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
  const cardLabel = session.cardLabel || "";

  await ctx.editMessageText(
    `*Vas a subir un resumen para ${monthLabel} de la tarjeta ${cardLabel}*\n` +
    "_Enviá la palabra cancelar para salir._",
    { parse_mode: "Markdown" },
  );

  await ctx.reply(
    "*¿El resumen tiene consumos en pesos, dólares o ambos?*",
    {
      parse_mode: "Markdown",
      ...buildCardCurrencyKeyboard(),
    },
  );
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
    await replyOrEdit(
      ctx,
      "*Ingresá el monto de los consumos en pesos*",
      { parse_mode: "Markdown" },
    );
  } else if (currency === "usd") {
    await setSession(telegramUserId, {
      ...session,
      statementCurrency: "usd",
      partialAmount: 0,
      state: "card_stmt_awaiting_usd",
    });
    await replyOrEdit(
      ctx,
      "*Ingresá el monto de los consumos en dólares*",
      { parse_mode: "Markdown" },
    );
  } else {
    await setSession(telegramUserId, {
      ...session,
      statementCurrency: "both",
      state: "card_stmt_awaiting_ars",
    });
    await replyOrEdit(
      ctx,
      "*Ingresá el monto de los consumos en pesos*",
      { parse_mode: "Markdown" },
    );
  }
}

async function handleStatementCancel(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = String(ctx.from!.id);
  await clearSession(telegramUserId);

  await ctx.reply("*Cancelaste la subida del resumen*.", { parse_mode: "Markdown" });
}

async function handleStatementConfirm(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = String(ctx.from!.id);
  const session = await getSession(telegramUserId);

  const hasStatementData =
    session
    && session.cardId
    && session.statementMonth
    && session.partialAmount !== undefined
    && session.partialDescription;

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
  const dueDate = new Date(
    parseInt(year, 10), parseInt(month, 10) - 1, day,
  );

  const statementId = await createStatement({
    cardId, telegramUserId, month: stmtMonth, amountARS, amountUSD, dueDate,
  });

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "card_awaiting_receipt",
    statementId,
    cardLabel,
    statementMonth: stmtMonth,
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
  const monthLabel = stmtMonth ?
    `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}` :
    "";

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
  await clearSession(telegramUserId);

  await ctx.reply(
    "Podés adjuntar el resumen luego desde /tarjetas.",
  );
}

/**
 * Registers all card-related handlers on the bot.
 *
 * @param {Telegraf<Context>} bot
 */
export function registerCardHandler(bot: Telegraf<Context>): void {
  bot.command("tarjetas", handleOpenCards);
  bot.action("menu_tarjetas", handleOpenCards);
  bot.action("card_list", handleOpenCards);

  bot.action("card_add", handleAddCard);
  bot.action(/^card_pick:(.+)$/, handlePickCard);
  bot.action(/^card_pg:(\d+)$/, handleCardPagination);
  bot.action(/^card_proc:(VISA|MASTERCARD)$/, handleProcessorSelected);
  bot.action("card_confirm", handleCardConfirm);
  bot.action("card_cancel", handleCardCancel);

  bot.action(/^card_stmt_reg:(.+)$/, handleStartStatement);
  bot.action("card_stmt_no", handleSkipStatement);
  bot.action(/^card_stmt_month:(.+):(\d{4}-\d{2})$/, handleStatementMonthSelected);
  bot.action(/^card_stmt_currency:(ars|usd|both)$/, handleCurrencySelected);
  bot.action("card_stmt_confirm", handleStatementConfirm);
  bot.action("card_stmt_cancel", handleStatementCancel);
  bot.action(/^card_stmt_attach:(.+)$/, handleAttachStatementReceipt);
  bot.action("card_stmt_skip", handleSkipStatementReceipt);
}
