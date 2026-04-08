import { Telegraf, Markup, Context } from "telegraf";
import { Session } from "../../types/index";
import {
  getSession, setSession, clearSession, emptySessionForPartial,
} from "../../services/session.service";
import { handleNewCategoryInput, advanceOrFinish } from "../../services/category.service";
import { parseArgentineAmount, parseExpenseMessage } from "../../helpers/parse-amount";
import { formatARS, getDaysInMonth, MONTH_NAMES } from "../../helpers/format";
import {
  isBulkMessage, parseBulkLines, buildBulkConfirmText, MAX_BULK_LINES,
} from "../../helpers/bulk-parse";
import {
  createService,
  getInstallment,
  saveInstallment,
  updateServiceName,
  updateInstallmentAmount,
  updateInstallmentDueDay,
} from "../../services/service.service";
import {
  buildDuplicateKeyboard,
  buildInvoicePromptKeyboard,
  buildPaymentMethodKeyboard,
} from "../keyboards/service";
import {
  buildIncomeConfirmKeyboard, buildIncomeConfirmText,
} from "../keyboards/income";
import { showInstallmentDetail } from "./service";
import { buildInvoiceMonthKeyboard, buildReceiptMonthKeyboard } from "../keyboards/invoice";
import { attachInvoiceToInstallment } from "./invoice";
import { attachReceiptToInstallment } from "./receipt-direct";
import {
  buildCardProcessorKeyboard,
  buildCardConfirmText,
  buildCardConfirmKeyboard,
  buildStmtConfirmText,
  buildCardStmtConfirmKeyboard,
} from "../keyboards/card";
import { handleTaxName, handleTaxDay, handleTaxAmount } from "./tax";

const CANCEL_WORDS = new Set(["salir", "cancelar", "terminar", "stop"]);

export function registerTextHandler(bot: Telegraf<Context>): void {
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

    if (session?.state === "doc_awaiting_type") {
      await ctx.reply(
        "Elegí una opción del menú, o escribí \"cancelar\" para anular."
      );
      return;
    }

    if (session?.state === "awaiting_new_category_name") {
      await handleNewCategoryInput(ctx, session, messageText.trim());
      return;
    }

    if (session?.state === "awaiting_amount") {
      await handleAwaitingAmount(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "awaiting_description") {
      await handleAwaitingDescription(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "categorizing") {
      await handleCategorizingText(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "inc_awaiting_amount") {
      await handleIncomeAmount(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "inc_awaiting_reason") {
      await handleIncomeReason(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "rep_awaiting_expense") {
      await handleRepAwaitingExpense(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "svc_awaiting_name") {
      await handleServiceName(ctx, telegramUserId, messageText);
      return;
    }

    if (session?.state === "svc_awaiting_amount") {
      await handleServiceAmount(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "svc_awaiting_day") {
      await handleServiceDay(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "svc_awaiting_edit_name") {
      await handleEditServiceNameText(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "svc_awaiting_edit_amount") {
      await handleEditServiceAmountText(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "svc_awaiting_edit_day") {
      await handleEditServiceDayText(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "invoice_awaiting_name") {
      await handleInvoiceServiceName(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "invoice_awaiting_day") {
      await handleInvoiceDay(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "invoice_awaiting_amount") {
      await handleInvoiceAmount(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "comp_awaiting_name") {
      await handleCompServiceName(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "comp_awaiting_day") {
      await handleCompDay(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "comp_awaiting_amount") {
      await handleCompAmount(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "card_awaiting_digits") {
      await handleCardDigits(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "card_awaiting_bank") {
      await handleCardBank(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "card_awaiting_expiry") {
      await handleCardExpiry(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "card_stmt_awaiting_ars") {
      await handleCardStmtArs(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "card_stmt_awaiting_usd") {
      await handleCardStmtUsd(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "card_stmt_awaiting_day") {
      await handleCardStmtDay(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "tax_awaiting_name") {
      await handleTaxName(ctx, telegramUserId, messageText);
      return;
    }

    if (session?.state === "tax_awaiting_day") {
      await handleTaxDay(ctx, session, telegramUserId, messageText);
      return;
    }

    if (session?.state === "tax_awaiting_amount") {
      await handleTaxAmount(ctx, session, telegramUserId, messageText);
      return;
    }

    if (isBulkMessage(messageText)) {
      await handleBulkInput(ctx, telegramUserId, messageText);
      return;
    }

    const expense = parseExpenseMessage(messageText);

    if (expense) {
      await ctx.reply(
        `Registrar gasto?\n${expense.description} ${formatARS(expense.amount)}`,
        Markup.inlineKeyboard([
          Markup.button.callback("Cancelar", "cancel"),
          Markup.button.callback(
            "Confirmar",
            `confirm:${expense.description}:${expense.amount}`
          ),
        ])
      );
      return;
    }

    const trimmed = messageText.trim();

    const isJustAmount = /^[\d.,]+$/.test(trimmed);
    if (isJustAmount) {
      const amount = parseArgentineAmount(trimmed);
      if (amount !== null && amount > 0) {
        await setSession(telegramUserId, {
          ...emptySessionForPartial(telegramUserId),
          state: "awaiting_description",
          partialAmount: amount,
        });
        await ctx.reply(
          `¿En qué gastaste ${formatARS(amount)}?\n` +
          "_Enviá la palabra cancelar para salir._",
          { parse_mode: "Markdown" }
        );
        return;
      }
    }

    const isJustText = !/\d/.test(trimmed);
    if (isJustText) {
      await setSession(telegramUserId, {
        ...emptySessionForPartial(telegramUserId),
        state: "awaiting_amount",
        partialDescription: trimmed,
      });
      await ctx.reply(
        `¿Cuánto gastaste en ${trimmed}?\n` +
        "_Enviá la palabra cancelar para salir._",
        { parse_mode: "Markdown" }
      );
      return;
    }

    await ctx.reply(
      "No pude interpretar el mensaje.\n" +
      "Formato: <descripcion> <monto>\n" +
      "Ej: Panaderia 5000"
    );
  });
}

async function handleAwaitingAmount(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const amount = parseArgentineAmount(messageText.trim());
  if (amount !== null && amount > 0) {
    await clearSession(telegramUserId);
    const description = session.partialDescription || "";
    await ctx.reply(
      `Registrar gasto?\n${description} ${formatARS(amount)}`,
      Markup.inlineKeyboard([
        Markup.button.callback("Cancelar", "cancel"),
        Markup.button.callback(
          "Confirmar",
          `confirm:${description}:${amount}`
        ),
      ])
    );
  } else {
    await ctx.reply(
      "No entendí el monto. Ingresá solo el número:\n" +
      "Ej: 5000 o 14.819,50"
    );
  }
}

async function handleAwaitingDescription(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  await clearSession(telegramUserId);
  const amount = session.partialAmount || 0;
  const description = messageText.trim();
  await ctx.reply(
    `Registrar gasto?\n${description} ${formatARS(amount)}`,
    Markup.inlineKeyboard([
      Markup.button.callback("Cancelar", "cancel"),
      Markup.button.callback(
        "Confirmar",
        `confirm:${description}:${amount}`
      ),
    ])
  );
}

async function handleCategorizingText(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const lowerText = messageText.trim().toLowerCase();

  if (lowerText === "omitir") {
    const nextPendingDescs = session.pendingDescs.slice(1);
    const nextDesc = nextPendingDescs.length > 0 ?
      nextPendingDescs[0].normalizedDesc :
      "";
    const nextDisplayName = nextPendingDescs.length > 0 ?
      nextPendingDescs[0].displayName :
      "";
    const nextTotalAmount = nextPendingDescs.length > 0 ?
      nextPendingDescs[0].totalAmount :
      0;

    const updatedSession: Session = {
      ...session,
      pendingDescs: nextPendingDescs,
      currentDesc: nextDesc,
      currentDisplayName: nextDisplayName,
      currentTotalAmount: nextTotalAmount,
      currentPage: 0,
    };

    await setSession(telegramUserId, updatedSession);
    await advanceOrFinish(ctx, updatedSession);
    return;
  }

  await ctx.reply(
    "Tenés una sesión de categorización activa." +
    " Elegí una categoría, o enviá \"omitir\" para saltar."
  );
}

async function handleBulkInput(
  ctx: Context,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const nonEmptyLines = messageText.split("\n")
    .filter((l) => l.trim().length > 0);

  if (nonEmptyLines.length > MAX_BULK_LINES) {
    await ctx.reply(
      `El mensaje tiene ${nonEmptyLines.length} líneas.` +
      ` El máximo es ${MAX_BULK_LINES}.`
    );
    return;
  }

  const { parsed, failedLines } = parseBulkLines(messageText);

  if (failedLines.length > 0) {
    const errorLines = failedLines
      .map((line) => `• ${line}`);
    await ctx.reply(
      `No pude interpretar ${failedLines.length} línea(s):\n\n` +
      errorLines.join("\n") +
      "\n\nRevisá el formato: descripcion monto"
    );
    return;
  }

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "bulk_pending",
    bulkExpenses: parsed,
  });

  await ctx.reply(
    buildBulkConfirmText(parsed),
    Markup.inlineKeyboard([
      Markup.button.callback("Cancelar", "bulk_cancel"),
      Markup.button.callback("Confirmar", "bulk_confirm"),
    ])
  );
}

async function handleServiceName(
  ctx: Context,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const name = messageText.trim();

  const hasValidName = name.length > 0;
  if (!hasValidName) {
    await ctx.reply("El nombre no puede estar vacío.");
    return;
  }

  const serviceId = await createService(telegramUserId, name);
  await clearSession(telegramUserId);

  const keyboard = buildPaymentMethodKeyboard(serviceId, "new");
  await ctx.reply("Seleccioná el método de pago", {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply_markup: keyboard.reply_markup as any,
  });
}

async function handleServiceAmount(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const amount = parseArgentineAmount(messageText.trim());

  if (amount === null || amount <= 0) {
    await ctx.reply(
      "No entendí el monto. Ingresá solo el número:\nEj: 5000 o 14.819,50"
    );
    return;
  }

  const serviceId = session.serviceId || "";
  const serviceName = session.serviceName || "";
  const selectedMonth = session.selectedMonth || "";
  const dayStr = session.partialDescription || "";
  const day = parseInt(dayStr, 10);

  const hasRequiredSessionData =
    serviceId && serviceName && selectedMonth && dayStr;
  if (!hasRequiredSessionData) {
    await ctx.reply("Error: datos de sesión incompletos.");
    return;
  }

  const [year, month] = selectedMonth.split("-");
  const dueDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, day);

  const existing = await getInstallment(serviceId, selectedMonth);

  if (existing) {
    await setSession(telegramUserId, {
      ...session,
      state: "svc_awaiting_amount",
      partialAmount: amount,
    });

    const keyboard = buildDuplicateKeyboard(existing.id || "");
    await ctx.reply(
      "Ya existe cuota registrada para este mes.",
      keyboard
    );
    return;
  }

  const installmentId = await saveInstallment(
    telegramUserId,
    serviceId,
    serviceName,
    amount,
    dueDate,
    selectedMonth
  );
  await clearSession(telegramUserId);

  const day2 = String(dueDate.getDate()).padStart(2, "0");
  const month2 = String(dueDate.getMonth() + 1).padStart(2, "0");

  await ctx.reply(
    `✅ Cuota registrada: ${serviceName} ${formatARS(amount)} (vence ${day2}/${month2})`
  );

  const keyboard = buildInvoicePromptKeyboard(installmentId);
  await ctx.reply("¿Deseas adjuntar factura?", keyboard);
}

async function handleServiceDay(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const dayStr = messageText.trim();
  const day = parseInt(dayStr, 10);

  const selectedMonth = session.selectedMonth || "";
  const maxDay = selectedMonth ? getDaysInMonth(selectedMonth) : 31;
  const isValidDay = Number.isInteger(day) && day >= 1 && day <= maxDay;
  if (!isValidDay) {
    await ctx.reply(`Día inválido. Ingresá un número entre 1 y ${maxDay}.`);
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "svc_awaiting_amount",
    partialDescription: dayStr,
  });

  await ctx.reply(
    "*¿Cuál es el monto de la cuota?*",
    { parse_mode: "Markdown" }
  );
}

async function handleEditServiceNameText(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const newName = messageText.trim();
  const serviceId = session.serviceId || "";

  const hasValidName = newName.length > 0;
  if (!hasValidName) {
    await ctx.reply("El nombre no puede estar vacío.");
    return;
  }

  await updateServiceName(serviceId, newName);
  await clearSession(telegramUserId);

  await ctx.reply(`✅ Nombre actualizado a '${newName}'.`);
}

async function handleEditServiceAmountText(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const amount = parseArgentineAmount(messageText.trim());
  const installmentId = session.installmentId || "";

  const isValidAmount = amount !== null && amount > 0;
  if (!isValidAmount) {
    await ctx.reply(
      "No entendí el monto. Ingresá solo el número:\nEj: 5000 o 14.819,50"
    );
    return;
  }

  await updateInstallmentAmount(installmentId, amount);
  await clearSession(telegramUserId);

  await showInstallmentDetail(ctx, installmentId);
}

async function handleEditServiceDayText(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const dayStr = messageText.trim();
  const day = parseInt(dayStr, 10);
  const installmentId = session.installmentId || "";

  const selectedMonth = session.selectedMonth || "";
  const maxDay = selectedMonth ? getDaysInMonth(selectedMonth) : 31;
  const isValidDay = Number.isInteger(day) && day >= 1 && day <= maxDay;
  if (!isValidDay) {
    await ctx.reply(`Día inválido. Ingresá un número entre 1 y ${maxDay}.`);
    return;
  }

  await updateInstallmentDueDay(installmentId, day);
  await clearSession(telegramUserId);

  await showInstallmentDetail(ctx, installmentId);
}

async function handleInvoiceServiceName(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const name = messageText.trim();
  if (!name) {
    await ctx.reply("El nombre no puede estar vacío.");
    return;
  }

  const serviceId = await createService(telegramUserId, name);

  await setSession(telegramUserId, {
    ...session,
    state: "invoice_awaiting_month",
    serviceId,
    serviceName: name,
    isNewService: true,
  });

  const keyboard = buildInvoiceMonthKeyboard(serviceId);
  await ctx.reply(
    `✅ Servicio '${name}' creado.\n¿A qué mes corresponde la factura?`,
    keyboard
  );
}

async function handleInvoiceDay(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const dayStr = messageText.trim();
  const day = parseInt(dayStr, 10);

  const selectedMonth = session.selectedMonth || "";
  const maxDay = selectedMonth ? getDaysInMonth(selectedMonth) : 31;
  const isValidDay = Number.isInteger(day) && day >= 1 && day <= maxDay;
  if (!isValidDay) {
    await ctx.reply(`Día inválido. Ingresá un número entre 1 y ${maxDay}.`);
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "invoice_awaiting_amount",
    partialDescription: dayStr,
  });

  await ctx.reply(
    "¿Cuál es el monto de la cuota?\n" +
    "_Enviá la palabra cancelar para salir._",
    { parse_mode: "Markdown" }
  );
}

async function handleInvoiceAmount(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const amount = parseArgentineAmount(messageText.trim());

  const isValidAmount = amount !== null && amount > 0;
  if (!isValidAmount) {
    await ctx.reply(
      "No entendí el monto. Ingresá solo el número:\nEj: 5000 o 14.819,50"
    );
    return;
  }

  const serviceId = session.serviceId || "";
  const serviceName = session.serviceName || "";
  const selectedMonth = session.selectedMonth || "";
  const day = parseInt(session.partialDescription || "1", 10);

  const hasRequiredData = serviceId && serviceName && selectedMonth;
  if (!hasRequiredData) {
    await ctx.reply("Error: datos de sesión incompletos.");
    return;
  }

  const [year, month] = selectedMonth.split("-");
  const dueDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, day);

  const installmentId = await saveInstallment(
    telegramUserId, serviceId, serviceName, amount, dueDate, selectedMonth
  );

  const successMessage = session.isNewService ?
    "✅ Servicio creado y factura adjuntada." :
    "✅ Factura adjunta.";

  await attachInvoiceToInstallment(
    ctx, telegramUserId, installmentId, session, successMessage
  );
}

async function handleCompServiceName(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const name = messageText.trim();
  if (!name) {
    await ctx.reply("El nombre no puede estar vacío.");
    return;
  }

  const serviceId = await createService(telegramUserId, name);

  await setSession(telegramUserId, {
    ...session,
    state: "comp_awaiting_month",
    serviceId,
    serviceName: name,
    isNewService: true,
  });

  const keyboard = buildReceiptMonthKeyboard(serviceId);
  await ctx.reply(
    `✅ Servicio '${name}' creado.\n¿A qué mes corresponde el comprobante?`,
    keyboard
  );
}

async function handleCompDay(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const dayStr = messageText.trim();
  const day = parseInt(dayStr, 10);

  const selectedMonth = session.selectedMonth || "";
  const maxDay = selectedMonth ? getDaysInMonth(selectedMonth) : 31;
  const isValidDay = Number.isInteger(day) && day >= 1 && day <= maxDay;
  if (!isValidDay) {
    await ctx.reply(`Día inválido. Ingresá un número entre 1 y ${maxDay}.`);
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "comp_awaiting_amount",
    partialDescription: dayStr,
  });

  await ctx.reply(
    "¿Cuál es el monto de la cuota?\n" +
    "_Enviá la palabra cancelar para salir._",
    { parse_mode: "Markdown" }
  );
}

async function handleCompAmount(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const amount = parseArgentineAmount(messageText.trim());

  const isValidAmount = amount !== null && amount > 0;
  if (!isValidAmount) {
    await ctx.reply(
      "No entendí el monto. Ingresá solo el número:\nEj: 5000 o 14.819,50"
    );
    return;
  }

  const serviceId = session.serviceId || "";
  const serviceName = session.serviceName || "";
  const selectedMonth = session.selectedMonth || "";
  const day = parseInt(session.partialDescription || "1", 10);

  const hasRequiredData = serviceId && serviceName && selectedMonth;
  if (!hasRequiredData) {
    await ctx.reply("Error: datos de sesión incompletos.");
    return;
  }

  const [year, month] = selectedMonth.split("-");
  const dueDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, day);

  const installmentId = await saveInstallment(
    telegramUserId, serviceId, serviceName, amount, dueDate, selectedMonth
  );

  const successMessage = session.isNewService ?
    "✅ Servicio creado, comprobante adjunto y cuota marcada como pagada." :
    "✅ Comprobante adjunto. Cuota marcada como pagada.";

  await attachReceiptToInstallment(
    ctx, telegramUserId, installmentId, session, successMessage
  );
}

/**
 * Handles amount input during income registration.
 *
 * @param {Context} ctx - Telegraf context
 * @param {Session} session - Current user session
 * @param {string} telegramUserId - The user's Telegram ID
 * @param {string} messageText - The raw message text
 */
async function handleIncomeAmount(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const amount = parseArgentineAmount(messageText.trim());

  const isValidAmount = amount !== null && amount > 0;
  if (!isValidAmount) {
    await ctx.reply(
      "No entendí el monto. Ingresá solo el número:\n" +
      "Ej: 5000 o 14.819,50"
    );
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "inc_awaiting_reason",
    partialAmount: amount,
  });

  await ctx.reply(
    "*Ingresá el motivo (30 caracteres max)*\n" +
    "_Escribí \"cancelar\" o \"salir\" para anular._",
    { parse_mode: "Markdown" }
  );
}

/**
 * Handles reason input during income registration.
 *
 * @param {Context} ctx - Telegraf context
 * @param {Session} session - Current user session
 * @param {string} telegramUserId - The user's Telegram ID
 * @param {string} messageText - The raw message text
 */
async function handleIncomeReason(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const reason = messageText.trim();

  const isReasonTooLong = reason.length > 30;
  if (isReasonTooLong) {
    await ctx.reply(
      "El motivo no puede superar los 30 caracteres. Ingresalo de nuevo."
    );
    return;
  }

  const isReasonEmpty = reason.length === 0;
  if (isReasonEmpty) {
    await ctx.reply("El motivo no puede estar vacío.");
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "inc_awaiting_reason",
    partialDescription: reason,
  });

  const amount = session.partialAmount || 0;
  await ctx.reply(
    buildIncomeConfirmText(amount, reason),
    buildIncomeConfirmKeyboard()
  );
}

/**
 * Handles expense input during retroactive registration for a past month.
 * Requires the complete message with description and amount in one shot.
 *
 * @param {Context} ctx - Telegraf context
 * @param {Session} session - Current user session (contains reportMonth)
 * @param {string} telegramUserId - The user's Telegram ID
 * @param {string} messageText - The raw message text
 */
async function handleRepAwaitingExpense(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string,
): Promise<void> {
  const expense = parseExpenseMessage(messageText);

  if (!expense) {
    await ctx.reply(
      "No pude interpretar el mensaje. Necesito descripción y monto juntos.\n" +
      "Ej: Panaderia 5000",
    );
    return;
  }

  const reportMonth = session.reportMonth as string;
  const [year, month] = reportMonth.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  await setSession(telegramUserId, {
    ...session,
    partialDescription: expense.description,
    partialAmount: expense.amount,
  });

  await ctx.reply(
    `Registrar gasto en ${monthLabel}?\n${expense.description}  ${formatARS(expense.amount)}`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback("Cancelar", "rep_exp_cancel"),
        Markup.button.callback("Confirmar", "rep_exp_confirm"),
      ],
    ]),
  );
}

async function handleCardDigits(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const digits = messageText.trim();
  const isValidDigits = /^\d{4}$/.test(digits);

  if (!isValidDigits) {
    await ctx.reply(
      "Los dígitos deben ser exactamente 4 números (Ej: 5477)."
    );
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "card_awaiting_expiry",
    partialDescription: digits,
  });

  await ctx.reply(
    "*Ingresá la fecha de vencimiento de la tarjeta*\n_Formato MM/AA (Ej: 03/28)_",
    { parse_mode: "Markdown" }
  );
}

async function handleCardBank(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const bank = messageText.trim();

  if (bank.length === 0) {
    await ctx.reply("El nombre del banco no puede estar vacío.");
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    state: "card_awaiting_digits",
    serviceName: bank,
  });

  await ctx.reply(
    "*Seleccioná el procesador:*",
    {
      parse_mode: "Markdown",
      ...buildCardProcessorKeyboard(),
    }
  );
}

async function handleCardExpiry(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
  const expiry = messageText.trim();
  const isValidExpiry = /^(0[1-9]|1[0-2])\/(\d{2})$/.test(expiry);

  if (!isValidExpiry) {
    await ctx.reply(
      "Formato inválido. Ingresá el vencimiento como MM/AA (Ej: 03/28)"
    );
    return;
  }

  await setSession(telegramUserId, {
    ...session,
    selectedMonth: expiry,
  });

  const digits = session.partialDescription || "";
  const bank = session.serviceName || "";
  const processor = session.cardProcessor || "";

  await ctx.reply(
    buildCardConfirmText({ digits, bank, processor, expiry }),
    {
      parse_mode: "Markdown",
      ...buildCardConfirmKeyboard(),
    }
  );
}

async function handleCardStmtArs(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
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

async function handleCardStmtUsd(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
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

async function handleCardStmtDay(
  ctx: Context,
  session: Session,
  telegramUserId: string,
  messageText: string
): Promise<void> {
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
