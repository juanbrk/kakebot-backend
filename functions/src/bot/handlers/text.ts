import { Telegraf } from "telegraf";
import { KakebotContext } from "../../types/telegraf-context.types";
import { TextHandlerParams } from "../../types/handlers.types";
import {
  getSession, setSession, clearSession,
} from "../../services/session.service";
import { parseArgentineAmount, parseExpenseMessage } from "../../helpers/parse-amount";
import { formatARS, formatUSD, getDaysInMonth, MONTH_NAMES } from "../../helpers/format";
import { isBulkMessage, parseBulkLines, MAX_BULK_LINES } from "../../helpers/bulk-parse";
import { BULK_SCENE_ID } from "../scenes/bulk.scene";
import { EXPENSE_SCENE_ID } from "../scenes/expense.scene";
import { BulkWizardState, ExpenseWizardState } from "../../types/telegraf-context.types";
import {
  buildCardCurrencyKeyboard,
  buildStmtConfirmText,
  buildCardStmtConfirmKeyboard,
  buildStmtEditConfirmKeyboard,
  buildStmtPayARSKeyboard,
  buildStmtUsdCurrencyKeyboard,
} from "../keyboards/card";
import {
  getStatementById, markStatementAsPaid,
} from "../../services/card.service";

const CANCEL_WORDS = new Set(["salir", "cancelar", "terminar", "stop"]);

export function registerTextHandler(bot: Telegraf<KakebotContext>): void {
  bot.on("text", async (ctx) => {
    const messageText = ctx.message.text;
    const telegramUserId = ctx.from?.id.toString() || "";

    if (messageText.startsWith("/")) return;

    const session = await getSession(telegramUserId);

    const isCancelWord = CANCEL_WORDS.has(messageText.trim().toLowerCase());
    if (isCancelWord && session) {
      await clearSession(telegramUserId);
      await ctx.reply("Operación cancelada.");
      return;
    }

    if (session?.state === "card_stmt_awaiting_month") {
      await ctx.reply("Elegí un mes del teclado, o escribí \"cancelar\" para anular.");
      return;
    }

    if (session?.state === "card_stmt_awaiting_ars") {
      if (!session.statementCurrency) {
        await ctx.reply(
          "Elegí una opción del teclado, o escribí \"cancelar\" para anular.",
          { ...buildCardCurrencyKeyboard() },
        );
        return;
      }
      await handleCardStmtArs({ ctx, session, telegramUserId, messageText });
      return;
    }

    if (session?.state === "card_stmt_awaiting_usd") {
      await handleCardStmtUsd({ ctx, session, telegramUserId, messageText });
      return;
    }

    if (session?.state === "card_stmt_awaiting_day") {
      await handleCardStmtDay({ ctx, session, telegramUserId, messageText });
      return;
    }

    if (session?.state === "card_stmt_awaiting_usd_payment_currency") {
      await ctx.reply("Elegí una opción del teclado, o escribí \"cancelar\" para anular.");
      return;
    }

    if (session?.state === "card_stmt_awaiting_exchange_rate") {
      await handleCardStmtExchangeRate({ ctx, session, telegramUserId, messageText });
      return;
    }

    if (session?.state === "card_stmt_edit_awaiting_ars") {
      await handleCardStmtEditArs({ ctx, session, telegramUserId, messageText });
      return;
    }

    if (session?.state === "card_stmt_edit_awaiting_usd") {
      await handleCardStmtEditUsd({ ctx, session, telegramUserId, messageText });
      return;
    }

    if (session?.state === "card_stmt_edit_awaiting_usd_payment_currency") {
      await ctx.reply("Elegí una opción del teclado, o escribí \"cancelar\" para anular.");
      return;
    }

    if (session?.state === "card_stmt_edit_awaiting_exchange_rate") {
      await handleCardStmtEditExchangeRate({ ctx, session, telegramUserId, messageText });
      return;
    }

    if (session?.state === "card_stmt_edit_awaiting_day") {
      await handleCardStmtEditDay({ ctx, session, telegramUserId, messageText });
      return;
    }

    if (isBulkMessage(messageText)) {
      const nonEmptyLines = messageText.split("\n").filter((l) => l.trim().length > 0);
      if (nonEmptyLines.length > MAX_BULK_LINES) {
        await ctx.reply(
          `El mensaje tiene ${nonEmptyLines.length} líneas. El máximo es ${MAX_BULK_LINES}.`
        );
        return;
      }
      const { parsed, failedLines } = parseBulkLines(messageText);
      if (failedLines.length > 0) {
        const errorLines = failedLines.map((line) => `• ${line}`);
        await ctx.reply(
          `No pude interpretar ${failedLines.length} línea(s):\n\n` +
          errorLines.join("\n") +
          "\n\nRevisá el formato: descripcion monto"
        );
        return;
      }
      await ctx.scene.enter(BULK_SCENE_ID, { bulkExpenses: parsed } as BulkWizardState);
      return;
    }

    const expense = parseExpenseMessage(messageText);
    if (expense) {
      await ctx.scene.enter(EXPENSE_SCENE_ID, {
        description: expense.description,
        amount: expense.amount,
      } as ExpenseWizardState);
      return;
    }

    const trimmed = messageText.trim();

    const isJustAmount = /^[\d.,]+$/.test(trimmed);
    if (isJustAmount) {
      const amount = parseArgentineAmount(trimmed);
      if (amount !== null && amount > 0) {
        await ctx.scene.enter(EXPENSE_SCENE_ID, { amount } as ExpenseWizardState);
        return;
      }
    }

    const isJustText = !/\d/.test(trimmed);
    if (isJustText) {
      await ctx.scene.enter(EXPENSE_SCENE_ID, { description: trimmed } as ExpenseWizardState);
      return;
    }

    await ctx.reply(
      "No pude interpretar el mensaje.\n" +
      "Formato: <descripcion> <monto>\n" +
      "Ej: Panaderia 5000"
    );
  });
}

async function handleCardStmtArs({
  ctx,
  session,
  telegramUserId,
  messageText,
}: TextHandlerParams): Promise<void> {
  const amount = parseArgentineAmount(messageText.trim());

  const isValidAmount = amount !== null && amount > 0;
  if (!isValidAmount) {
    await ctx.reply(
      "No entendí el monto. Ingresá solo el número:\nEj: 5000 o 14.819,50"
    );
    return;
  }

  const stmtMonth = session.statementMonth || "";
  const maxDay = stmtMonth ? getDaysInMonth(stmtMonth) : 31;

  if (session.statementCurrency === "both") {
    await setSession(telegramUserId, {
      ...session,
      partialAmount: amount,
      state: "card_stmt_awaiting_usd",
    });
    await ctx.reply(
      "*Ingresá el monto de los consumos en dólares*",
      { parse_mode: "Markdown" }
    );
  } else {
    await setSession(telegramUserId, {
      ...session,
      partialAmount: amount,
      partialAmountUSD: 0,
      state: "card_stmt_awaiting_day",
    });
    await ctx.reply(
      `*¿Qué día vence el resumen?* (1-${maxDay})`,
      { parse_mode: "Markdown" }
    );
  }
}

async function handleCardStmtUsd({
  ctx,
  session,
  telegramUserId,
  messageText,
}: TextHandlerParams): Promise<void> {
  const amount = parseArgentineAmount(messageText.trim());

  const isValidAmount = amount !== null && amount > 0;
  if (!isValidAmount) {
    await ctx.reply(
      "No entendí el monto. Ingresá solo el número:\nEj: 49,47"
    );
    return;
  }

  const stmtMonth = session.statementMonth || "";
  const maxDay = stmtMonth ? getDaysInMonth(stmtMonth) : 31;

  await setSession(telegramUserId, {
    ...session,
    state: "card_stmt_awaiting_day",
    partialAmountUSD: amount,
  });

  await ctx.reply(
    `*¿Qué día vence el resumen?* (1-${maxDay})`,
    { parse_mode: "Markdown" }
  );
}

async function handleCardStmtDay({
  ctx,
  session,
  telegramUserId,
  messageText,
}: TextHandlerParams): Promise<void> {
  const dayStr = messageText.trim();
  const day = parseInt(dayStr, 10);

  const stmtMonth = session.statementMonth || "";
  const maxDay = stmtMonth ? getDaysInMonth(stmtMonth) : 31;
  const isValidDay = Number.isInteger(day) && day >= 1 && day <= maxDay;

  if (!isValidDay) {
    await ctx.reply(`Día inválido. Ingresá un número entre 1 y ${maxDay}.`);
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "card_stmt_awaiting_day",
    partialDescription: dayStr,
  });

  const cardLabel = session.cardLabel || "";
  const amountARS = session.partialAmount || 0;
  const amountUSD = session.partialAmountUSD || 0;

  const [year, month] = stmtMonth.split("-");
  const monthLabel =
    `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  await ctx.reply(
    buildStmtConfirmText({
      cardLabel,
      monthLabel,
      amountARS,
      amountUSD,
      dueDay: day,
      stmtMonth,
    }),
    {
      parse_mode: "Markdown",
      ...buildCardStmtConfirmKeyboard(),
    }
  );
}

async function handleCardStmtEditArs({
  ctx,
  session,
  telegramUserId,
  messageText,
}: TextHandlerParams): Promise<void> {
  const parsed = parseArgentineAmount(messageText.trim());

  if (!parsed || parsed <= 0) {
    await ctx.reply("Monto inválido. Ingresá un número mayor a cero, por ejemplo: 14819,50");
    return;
  }

  const statementId = session.statementId || "";
  if (!statementId) {
    await ctx.reply("Error: no se encontró el resumen en la sesión.");
    return;
  }

  const statement = await getStatementById(statementId);
  const currentLabel = statement ? formatARS(statement.amountARS) : "—";

  await setSession(telegramUserId, { ...session, pendingEditValue: String(parsed) });

  await ctx.reply(
    `*Monto ARS actual*: ${currentLabel}\n*Nuevo monto*: ${formatARS(parsed)}\n\n*¿Confirmar el cambio?*`,
    {
      parse_mode: "Markdown",
      ...buildStmtEditConfirmKeyboard({ field: "ars", statementId, value: String(parsed) }),
    },
  );
}

/**
 * Phase 1 of USD edit: validates the new USD amount.
 * If the statement is already paid → asks for payment currency (TCV may follow).
 * If not paid → skips currency/TCV and shows the confirm screen directly.
 */
async function handleCardStmtEditUsd({
  ctx,
  session,
  telegramUserId,
  messageText,
}: TextHandlerParams): Promise<void> {
  const parsed = parseArgentineAmount(messageText.trim());

  if (parsed === null || parsed < 0) {
    await ctx.reply("Monto inválido. Ingresá un número mayor o igual a cero, por ejemplo: 49,47");
    return;
  }

  const statementId = session.statementId || "";
  if (!statementId) {
    await ctx.reply("Error: no se encontró el resumen en la sesión.");
    return;
  }

  const statement = await getStatementById(statementId);
  const isStatementPaid = statement?.isPaid === true;

  if (!isStatementPaid) {
    const currentLabel = statement && statement.amountUSD > 0
      ? formatUSD(statement.amountUSD)
      : "sin monto en dólares";

    await setSession(telegramUserId, { ...session, pendingEditValue: String(parsed) });

    await ctx.reply(
      `*Monto U$S actual*: ${currentLabel}\n*Nuevo monto*: ${formatUSD(parsed)}\n\n*¿Confirmar el cambio?*`,
      {
        parse_mode: "Markdown",
        ...buildStmtEditConfirmKeyboard({ field: "usd", statementId, value: String(parsed) }),
      },
    );
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "card_stmt_edit_awaiting_usd_payment_currency",
    pendingEditValue: String(parsed),
  });

  await ctx.reply(
    `*Nuevo monto U$S*: ${formatUSD(parsed)}\n*¿Con qué moneda pagaste los dólares?*`,
    {
      parse_mode: "Markdown",
      ...buildStmtUsdCurrencyKeyboard({ statementId, flow: "edit" }),
    },
  );
}

/**
 * Phase 2 of USD edit: validates the TCV, shows confirmation with both new USD amount and rate.
 */
async function handleCardStmtEditExchangeRate({
  ctx,
  session,
  telegramUserId,
  messageText,
}: TextHandlerParams): Promise<void> {
  const rate = parseArgentineAmount(messageText.trim());

  if (rate === null || rate <= 0) {
    await ctx.reply("TCV inválido. Ingresá un número mayor a cero, por ejemplo: 1250,50");
    return;
  }

  const statementId = session.statementId || "";
  const pendingUSD = parseFloat(session.pendingEditValue || "0");

  if (!statementId || !pendingUSD) {
    await ctx.reply("Error: no se encontró el resumen en la sesión.");
    return;
  }

  const statement = await getStatementById(statementId);
  const currentLabel = statement && statement.amountUSD > 0
    ? formatUSD(statement.amountUSD)
    : "sin monto en dólares";

  await setSession(telegramUserId, { ...session, pendingExchangeRate: rate });

  await ctx.reply(
    `*Monto U$S actual*: ${currentLabel}\n`
    + `*Nuevo monto*: ${formatUSD(pendingUSD)}\n`
    + `*Tipo de cambio*: ${formatARS(rate)}\n`
    + `*Total*: ${formatARS(pendingUSD * rate)}\n\n`
    + "*¿Confirmar el cambio?*",
    {
      parse_mode: "Markdown",
      ...buildStmtEditConfirmKeyboard({ field: "usd", statementId, value: String(pendingUSD) }),
    },
  );
}

async function handleCardStmtEditDay({
  ctx,
  session,
  telegramUserId,
  messageText,
}: TextHandlerParams): Promise<void> {
  const dayStr = messageText.trim();
  const day = parseInt(dayStr, 10);

  const stmtMonth = session.statementMonth || "";
  const maxDay = stmtMonth ? getDaysInMonth(stmtMonth) : 31;
  const isValidDay = Number.isInteger(day) && day >= 1 && day <= maxDay;

  if (!isValidDay) {
    await ctx.reply(`Día inválido. Ingresá un número entre 1 y ${maxDay}.`);
    return;
  }

  const statementId = session.statementId || "";
  if (!statementId) {
    await ctx.reply("Error: no se encontró el resumen en la sesión.");
    return;
  }

  const statement = await getStatementById(statementId);
  const currentDay = statement ? statement.dueDate.toDate().getDate() : "—";
  const [, month] = stmtMonth.split("-");
  const monthNum = month || "?";

  await setSession(telegramUserId, { ...session, pendingEditValue: String(day) });

  await ctx.reply(
    `*Vencimiento actual*: ${String(currentDay).padStart(2, "0")}/${monthNum}\n*Nuevo vencimiento*: ${String(day).padStart(2, "0")}/${monthNum}\n\n*¿Confirmar el cambio?*`,
    {
      parse_mode: "Markdown",
      ...buildStmtEditConfirmKeyboard({ field: "day", statementId, value: String(day) }),
    },
  );
}

/**
 * Handles TCV input after "Pesos" currency selection on a statement with USD.
 * Marks the statement as paid with the exchange rate and currency, then prompts for ARS receipt.
 */
async function handleCardStmtExchangeRate({
  ctx,
  session,
  telegramUserId,
  messageText,
}: TextHandlerParams): Promise<void> {
  const rate = parseArgentineAmount(messageText.trim());

  if (rate === null || rate <= 0) {
    await ctx.reply("TCV inválido. Ingresá un número mayor a cero, por ejemplo: 1250,50");
    return;
  }

  const statementId = session.statementId || "";
  if (!statementId) {
    await ctx.reply("Error: no se encontró el resumen en la sesión.");
    return;
  }

  const amountUSD = session.statementAmountUSD || 0;

  await markStatementAsPaid({ statementId, exchangeRate: rate, usdPaymentCurrency: "ars" });
  await clearSession(telegramUserId);

  await ctx.reply(
    "✅ Resumen marcado como pagado.\n" +
    `Pagaste ${formatUSD(amountUSD)} a ${formatARS(rate)}. Total: ${formatARS(amountUSD * rate)}`,
  );
  await ctx.reply(
    "*¿Querés adjuntar el comprobante de pago en ARS?*",
    {
      parse_mode: "Markdown",
      ...buildStmtPayARSKeyboard({ statementId, hasUSD: amountUSD > 0 }),
    },
  );
}
