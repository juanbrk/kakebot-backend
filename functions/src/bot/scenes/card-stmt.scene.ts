import { Scenes, Markup } from "telegraf";
import { KakebotContext, CardStmtWizardState } from "../../types/telegraf-context.types";
import { StatementCurrency } from "../../types/index";
import { getMessageText } from "../../helpers/wizard";
import { parseArgentineAmount } from "../../helpers/parse-amount";
import { buildDueDate, getDaysInMonth, MONTH_NAMES, formatARS, formatUSD } from "../../helpers/format";
import { log } from "../../helpers/logger";
import {
  buildCardStmtMonthKeyboard,
  buildCardCurrencyKeyboard,
  buildStmtConfirmText,
  buildCardStmtConfirmKeyboard,
  buildCardStmtReceiptKeyboard,
  buildStmtUsdCurrencyKeyboard,
  buildStmtPayARSKeyboard,
  buildStmtPayUSDKeyboard,
  buildPaymentSummaryText,
  buildStatementDetailText,
  buildStatementDetailKeyboard,
} from "../keyboards/card";
import {
  createStatement,
  saveStatementReceiptUrl,
  markStatementAsPaid,
  getStatementById,
  saveStatementReceiptUrlARS,
  saveStatementReceiptUrlUSD,
  updateStatementAmountARS,
  updateStatementDueDay,
  updateStatementUSDAndRate,
} from "../../services/card.service";
import {
  uploadStatementReceipt,
  uploadStatementPaymentReceipt,
  uploadStatementPaymentReceiptUSD,
} from "../../services/storage.service";
import { downloadFile } from "../handlers/photo";

export const CARD_STMT_SCENE_ID = "card-stmt-wizard";
const CANCEL_REGEX = /^\s*(salir|cancelar|terminar|stop)\s*$/i;

const ARS_INPUT_STEP = 1;
const USD_INPUT_STEP = 2;
const DAY_STEP = 3;
const CREATE_PDF_STEP = 5;
const CURRENCY_STEP = 6;
const MONTH_STEP = 7;
const RECEIPT_PDF_STEP = 8;
const PAY_CURRENCY_STEP = 9;
const PAY_RATE_STEP = 10;
const PAY_ARS_STEP = 11;
const PAY_ARS_UPLOAD_STEP = 12;
const PAY_USD_STEP = 13;
const PAY_USD_UPLOAD_STEP = 14;
const EDIT_ARS_INPUT_STEP = 15;
const EDIT_ARS_CONFIRM_STEP = 16;
const EDIT_USD_INPUT_STEP = 17;
const EDIT_USD_CURRENCY_STEP = 18;
const EDIT_USD_TCV_STEP = 19;
const EDIT_USD_CONFIRM_STEP = 20;
const EDIT_DAY_INPUT_STEP = 21;
const EDIT_DAY_CONFIRM_STEP = 22;
const RECEIPT_ARS_STEP = 23;
const RECEIPT_USD_STEP = 24;

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

  case "pay": {
    const statementId = state.statementId || "";
    const monthLabel = monthLabelOf(state.statementMonth || "");
    const cardLabel = state.cardLabel || "";
    const amountUSD = state.statementAmountUSD ?? 0;
    if (amountUSD === 0) {
      try {
        await markStatementAsPaid({ statementId });
      } catch (error) {
        log.error("Error marking statement paid", error, { module: "card-stmt.scene", userId: ctx.from?.id.toString() ?? "" });
        await ctx.reply("Error al registrar el pago. Intentá de nuevo.");
        await ctx.scene.leave();
        return;
      }
      await ctx.reply(
        `✅ Resumen marcado como pagado.\n_${monthLabel} · ${cardLabel}_`,
        { parse_mode: "Markdown" },
      );
      await ctx.reply(
        `*¿Querés adjuntar el comprobante de pago en ARS del resumen ${monthLabel}?*`,
        { parse_mode: "Markdown", ...buildStmtPayARSKeyboard({ statementId, hasUSD: false }) },
      );
      ctx.wizard.selectStep(PAY_ARS_STEP);
    } else {
      await ctx.reply(
        `_${monthLabel} · ${cardLabel}_\n\n*El resumen incluye ${formatUSD(amountUSD)} USD.*\n`
        + "*¿Con qué moneda pagaste los dólares?*",
        { parse_mode: "Markdown", ...buildStmtUsdCurrencyKeyboard({ statementId, flow: "pay" }) },
      );
      ctx.wizard.selectStep(PAY_CURRENCY_STEP);
    }
    break;
  }

  case "edit_ars": {
    const stmtArs = await getStatementById(state.statementId || "");
    const currentArs = stmtArs ? formatARS(stmtArs.amountARS) : "—";
    await ctx.reply(
      `*Monto actual*: ${currentArs}\n*Ingresá el nuevo monto en pesos:*`,
      { parse_mode: "Markdown" },
    );
    ctx.wizard.selectStep(EDIT_ARS_INPUT_STEP);
    break;
  }

  case "edit_usd": {
    const stmtUsd = await getStatementById(state.statementId || "");
    const currentUsd = stmtUsd && stmtUsd.amountUSD > 0 ? formatUSD(stmtUsd.amountUSD) : "sin monto en dólares";
    await ctx.reply(
      `*Monto actual*: ${currentUsd}\n*Ingresá el nuevo monto en dólares:*`,
      { parse_mode: "Markdown" },
    );
    ctx.wizard.selectStep(EDIT_USD_INPUT_STEP);
    break;
  }

  case "edit_day": {
    const stmtDay = await getStatementById(state.statementId || "");
    const [, dayMonth] = (state.statementMonth || "").split("-");
    const maxDayInit = state.statementMonth ? getDaysInMonth(state.statementMonth) : 31;
    const currentDay = stmtDay ? String(stmtDay.dueDate.toDate().getDate()).padStart(2, "0") : "—";
    await ctx.reply(
      `*Vencimiento actual*: ${currentDay}/${dayMonth || "?"}\n*Ingresá el nuevo día (1-${maxDayInit}):*`,
      { parse_mode: "Markdown" },
    );
    ctx.wizard.selectStep(EDIT_DAY_INPUT_STEP);
    break;
  }

  case "receipt_ars": {
    const arsLabel = monthLabelOf(state.statementMonth || "");
    await ctx.reply(
      `*Enviá el comprobante de pago en ARS del resumen ${arsLabel} · ${state.cardLabel || ""}*`,
      { parse_mode: "Markdown" },
    );
    ctx.wizard.selectStep(RECEIPT_ARS_STEP);
    break;
  }

  case "receipt_usd": {
    const usdLabel = monthLabelOf(state.statementMonth || "");
    await ctx.reply(
      `*Enviá el comprobante de pago en USD del resumen ${usdLabel} · ${state.cardLabel || ""}*`,
      { parse_mode: "Markdown" },
    );
    ctx.wizard.selectStep(RECEIPT_USD_STEP);
    break;
  }

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
    ctx.wizard.selectStep(USD_INPUT_STEP);
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

/**
 * Pay flow guard: re-presents the payment currency keyboard when text arrives.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardPayCurrency(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as CardStmtWizardState;
  await ctx.reply("Elegí una opción del teclado, o escribí \"cancelar\" para anular.");
  await ctx.reply(
    "*¿Con qué moneda pagaste los dólares?*",
    { parse_mode: "Markdown", ...buildStmtUsdCurrencyKeyboard({ statementId: state.statementId || "", flow: "pay" }) },
  );
}

/**
 * Pay flow: validates the TCV (exchange rate), marks statement as paid and prompts for ARS receipt.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepHandlePayRate(ctx: KakebotContext): Promise<void> {
  const rate = parseArgentineAmount(getMessageText(ctx) ?? "");
  if (rate === null || rate <= 0) {
    await ctx.reply("TCV inválido. Ingresá un número mayor a cero, por ejemplo: 1250,50");
    return;
  }
  const state = ctx.wizard.state as CardStmtWizardState;
  const telegramUserId = ctx.from?.id.toString() ?? "";
  const statementId = state.statementId || "";
  const amountUSD = state.statementAmountUSD ?? 0;

  try {
    await markStatementAsPaid({ statementId, exchangeRate: rate, usdPaymentCurrency: "ars" });
  } catch (error) {
    log.error("Error marking statement paid with TCV", error, { module: "card-stmt.scene", userId: telegramUserId });
    await ctx.reply("Error al registrar el pago. Intentá de nuevo.");
    return;
  }

  state.exchangeRate = rate;
  await ctx.reply(
    `✅ Resumen marcado como pagado.\nPagaste ${formatUSD(amountUSD)} a ${formatARS(rate)}.`
    + ` Total: ${formatARS(amountUSD * rate)}`,
  );
  await ctx.reply(
    "*¿Querés adjuntar el comprobante de pago en ARS?*",
    { parse_mode: "Markdown", ...buildStmtPayARSKeyboard({ statementId, hasUSD: amountUSD > 0 }) },
  );
  ctx.wizard.selectStep(PAY_ARS_STEP);
}

/**
 * Pay flow guard: re-presents the ARS receipt keyboard when text arrives.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardPayArs(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as CardStmtWizardState;
  await ctx.reply("Adjuntá el comprobante o usá los botones para omitir.");
  await ctx.reply(
    "*¿Querés adjuntar el comprobante de pago en ARS?*",
    {
      parse_mode: "Markdown",
      ...buildStmtPayARSKeyboard({ statementId: state.statementId || "", hasUSD: (state.statementAmountUSD ?? 0) > 0 }),
    },
  );
}

/**
 * Pay flow guard: re-presents the ARS receipt upload prompt when text arrives.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardPayArsUpload(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Enviá la foto o PDF del comprobante en Pesos.");
}

/**
 * Pay flow guard: re-presents the USD receipt keyboard when text arrives.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardPayUsd(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as CardStmtWizardState;
  await ctx.reply("Adjuntá el comprobante o usá los botones para omitir.");
  await ctx.reply(
    "*¿Querés adjuntar el comprobante de pago en USD?*",
    { parse_mode: "Markdown", ...buildStmtPayUSDKeyboard(state.statementId || "") },
  );
}

/**
 * Pay flow guard: re-presents the USD receipt upload prompt when text arrives.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardPayUsdUpload(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Enviá la foto o PDF del comprobante en Dólares.");
}

// -- Edit ARS steps --

/**
 * Edit ARS flow: validates the new ARS amount and presents the confirmation keyboard.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepHandleEditArsInput(ctx: KakebotContext): Promise<void> {
  const messageText = getMessageText(ctx) ?? "";
  const amount = parseArgentineAmount(messageText);
  if (amount === null || amount <= 0) {
    await ctx.reply("Monto inválido. Ingresá un número mayor a cero, por ejemplo: 14819,50");
    return;
  }
  const state = ctx.wizard.state as CardStmtWizardState;
  state.pendingEditValue = amount;

  const stmt = await getStatementById(state.statementId || "");
  const currentLabel = stmt ? formatARS(stmt.amountARS) : "—";

  await ctx.reply(
    `*Monto ARS actual*: ${currentLabel}\n*Nuevo monto*: ${formatARS(amount)}\n\n*¿Confirmar el cambio?*`,
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: Markup.inlineKeyboard([[
        Markup.button.callback("Cancelar", "card_stmt_edit_cancel"),
        Markup.button.callback("Confirmar", "card_stmt_edit_ok_ars"),
      ]]).reply_markup as any,
    },
  );
  ctx.wizard.selectStep(EDIT_ARS_CONFIRM_STEP);
}

/**
 * Edit ARS flow guard: re-presents the confirmation keyboard when text arrives.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardEditArsConfirm(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as CardStmtWizardState;
  const amount = state.pendingEditValue || 0;
  await ctx.reply("Elegí una opción del teclado, o escribí \"cancelar\" para salir.");
  await ctx.reply(
    `*Nuevo monto*: ${formatARS(amount)}\n\n*¿Confirmar el cambio?*`,
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: Markup.inlineKeyboard([[
        Markup.button.callback("Cancelar", "card_stmt_edit_cancel"),
        Markup.button.callback("Confirmar", "card_stmt_edit_ok_ars"),
      ]]).reply_markup as any,
    },
  );
}

// -- Edit USD steps --

/**
 * Edit USD flow: validates the new USD amount.
 * If the statement is already paid, routes to currency selector; otherwise goes straight to confirm.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepHandleEditUsdInput(ctx: KakebotContext): Promise<void> {
  const messageText = getMessageText(ctx) ?? "";
  const amount = parseArgentineAmount(messageText);
  if (amount === null || amount < 0) {
    await ctx.reply("Monto inválido. Ingresá un número mayor o igual a cero, por ejemplo: 49,47");
    return;
  }
  const state = ctx.wizard.state as CardStmtWizardState;
  state.pendingEditUSD = amount;

  if (state.isPaid) {
    await ctx.reply(
      `*Nuevo monto U$S*: ${formatUSD(amount)}\n*¿Con qué moneda pagaste los dólares?*`,
      {
        parse_mode: "Markdown",
        ...buildStmtUsdCurrencyKeyboard({ statementId: state.statementId || "", flow: "edit" }),
      },
    );
    ctx.wizard.selectStep(EDIT_USD_CURRENCY_STEP);
    return;
  }

  const stmt = await getStatementById(state.statementId || "");
  const currentLabel = stmt && stmt.amountUSD > 0 ? formatUSD(stmt.amountUSD) : "sin monto en dólares";

  await ctx.reply(
    `*Monto U$S actual*: ${currentLabel}\n*Nuevo monto*: ${formatUSD(amount)}\n\n*¿Confirmar el cambio?*`,
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: Markup.inlineKeyboard([[
        Markup.button.callback("Cancelar", "card_stmt_edit_cancel"),
        Markup.button.callback("Confirmar", "card_stmt_edit_ok_usd"),
      ]]).reply_markup as any,
    },
  );
  ctx.wizard.selectStep(EDIT_USD_CONFIRM_STEP);
}

/**
 * Edit USD flow guard: re-presents the currency selector when text arrives.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardEditUsdCurrency(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as CardStmtWizardState;
  await ctx.reply("Elegí una opción del teclado, o escribí \"cancelar\" para salir.");
  await ctx.reply(
    `*Nuevo monto U$S*: ${formatUSD(state.pendingEditUSD || 0)}\n*¿Con qué moneda pagaste los dólares?*`,
    {
      parse_mode: "Markdown",
      ...buildStmtUsdCurrencyKeyboard({ statementId: state.statementId || "", flow: "edit" }),
    },
  );
}

/**
 * Edit USD flow (paid in pesos): validates the TCV and presents the confirmation keyboard.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepHandleEditTcvInput(ctx: KakebotContext): Promise<void> {
  const messageText = getMessageText(ctx) ?? "";
  const rate = parseArgentineAmount(messageText);
  if (rate === null || rate <= 0) {
    await ctx.reply("TCV inválido. Ingresá un número mayor a cero, por ejemplo: 1250,50");
    return;
  }
  const state = ctx.wizard.state as CardStmtWizardState;
  state.exchangeRate = rate;

  const pendingUSD = state.pendingEditUSD || 0;
  const stmt = await getStatementById(state.statementId || "");
  const currentLabel = stmt && stmt.amountUSD > 0 ? formatUSD(stmt.amountUSD) : "sin monto en dólares";

  await ctx.reply(
    `*Monto U$S actual*: ${currentLabel}\n`
    + `*Nuevo monto*: ${formatUSD(pendingUSD)}\n`
    + `*Tipo de cambio*: ${formatARS(rate)}\n`
    + `*Total*: ${formatARS(pendingUSD * rate)}\n\n`
    + "*¿Confirmar el cambio?*",
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: Markup.inlineKeyboard([[
        Markup.button.callback("Cancelar", "card_stmt_edit_cancel"),
        Markup.button.callback("Confirmar", "card_stmt_edit_ok_usd"),
      ]]).reply_markup as any,
    },
  );
  ctx.wizard.selectStep(EDIT_USD_CONFIRM_STEP);
}

/**
 * Edit USD flow guard: re-presents the confirmation keyboard when text arrives.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardEditUsdConfirm(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as CardStmtWizardState;
  const pendingUSD = state.pendingEditUSD || 0;
  await ctx.reply("Elegí una opción del teclado, o escribí \"cancelar\" para salir.");

  const lines: string[] = [`*Nuevo monto*: ${formatUSD(pendingUSD)}`];
  if (state.exchangeRate) {
    lines.push(`*Tipo de cambio*: ${formatARS(state.exchangeRate)}`);
    lines.push(`*Total*: ${formatARS(pendingUSD * state.exchangeRate)}`);
  }
  lines.push("\n*¿Confirmar el cambio?*");

  await ctx.reply(
    lines.join("\n"),
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: Markup.inlineKeyboard([[
        Markup.button.callback("Cancelar", "card_stmt_edit_cancel"),
        Markup.button.callback("Confirmar", "card_stmt_edit_ok_usd"),
      ]]).reply_markup as any,
    },
  );
}

// -- Edit Day steps --

/**
 * Edit Day flow: validates the new due day and presents the confirmation keyboard.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepHandleEditDayInput(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as CardStmtWizardState;
  const stmtMonth = state.statementMonth || "";
  const maxDay = stmtMonth ? getDaysInMonth(stmtMonth) : 31;

  const dayStr = (getMessageText(ctx) ?? "").trim();
  const day = parseInt(dayStr, 10);
  const isValidDay = Number.isInteger(day) && day >= 1 && day <= maxDay;

  if (!isValidDay) {
    await ctx.reply(`Día inválido. Ingresá un número entre 1 y ${maxDay}.`);
    return;
  }

  state.dueDay = day;

  const [, month] = stmtMonth.split("-");
  const stmt = await getStatementById(state.statementId || "");
  const currentDay = stmt ? String(stmt.dueDate.toDate().getDate()).padStart(2, "0") : "—";
  const monthNum = month || "?";

  await ctx.reply(
    `*Vencimiento actual*: ${currentDay}/${monthNum}\n*Nuevo vencimiento*: ${String(day).padStart(2, "0")}/${monthNum}\n\n*¿Confirmar el cambio?*`,
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: Markup.inlineKeyboard([[
        Markup.button.callback("Cancelar", "card_stmt_edit_cancel"),
        Markup.button.callback("Confirmar", "card_stmt_edit_ok_day"),
      ]]).reply_markup as any,
    },
  );
  ctx.wizard.selectStep(EDIT_DAY_CONFIRM_STEP);
}

/**
 * Edit Day flow guard: re-presents the confirmation keyboard when text arrives.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardEditDayConfirm(ctx: KakebotContext): Promise<void> {
  const state = ctx.wizard.state as CardStmtWizardState;
  const [, month] = (state.statementMonth || "").split("-");
  const day = state.dueDay || 0;
  await ctx.reply("Elegí una opción del teclado, o escribí \"cancelar\" para salir.");
  await ctx.reply(
    `*Nuevo vencimiento*: ${String(day).padStart(2, "0")}/${month || "?"}\n\n*¿Confirmar el cambio?*`,
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: Markup.inlineKeyboard([[
        Markup.button.callback("Cancelar", "card_stmt_edit_cancel"),
        Markup.button.callback("Confirmar", "card_stmt_edit_ok_day"),
      ]]).reply_markup as any,
    },
  );
}

// -- Standalone receipt steps --

/**
 * ARS receipt guard: re-prompts when text arrives while waiting for a file.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardReceiptARS(ctx: KakebotContext): Promise<void> {
  await ctx.reply(
    "No esperaba texto. Enviá la foto o PDF del comprobante en ARS, o escribí \"cancelar\" para anular.",
  );
}

/**
 * USD receipt guard: re-prompts when text arrives while waiting for a file.
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function stepGuardReceiptUSD(ctx: KakebotContext): Promise<void> {
  await ctx.reply(
    "No esperaba texto. Enviá la foto o PDF del comprobante en USD, o escribí \"cancelar\" para anular.",
  );
}

/**
 * Standalone ARS receipt upload: saves the file and confirms without continuing to USD.
 *
 * @param {KakebotContext} ctx - Wizard context
 * @param {string | null} documentFileId - PDF file_id when handling a document; null for photos
 */
async function handleStandaloneARSReceiptUpload(ctx: KakebotContext, documentFileId: string | null): Promise<void> {
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
    const receiptUrl = await uploadStatementPaymentReceipt({
      telegramUserId, installmentId: statementId, fileBuffer, mimeType: resolvedMimeType,
    });
    await saveStatementReceiptUrlARS(statementId, receiptUrl);
    await ctx.reply("✅ Comprobante de pago en ARS guardado.");
    await ctx.scene.leave();
  } catch (error) {
    log.error("Error uploading standalone ARS receipt", error, { module: "card-stmt.scene", userId: telegramUserId });
    await ctx.reply("Error al guardar el comprobante. Intentá de nuevo.");
  }
}

/**
 * Standalone USD receipt upload: saves the file and confirms.
 *
 * @param {KakebotContext} ctx - Wizard context
 * @param {string | null} documentFileId - PDF file_id when handling a document; null for photos
 */
async function handleStandaloneUSDReceiptUpload(ctx: KakebotContext, documentFileId: string | null): Promise<void> {
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
    const receiptUrl = await uploadStatementPaymentReceiptUSD({
      telegramUserId, installmentId: statementId, fileBuffer, mimeType: resolvedMimeType,
    });
    await saveStatementReceiptUrlUSD(statementId, receiptUrl);
    await ctx.reply("✅ Comprobante de pago en USD guardado.");
    await ctx.scene.leave();
  } catch (error) {
    log.error("Error uploading standalone USD receipt", error, { module: "card-stmt.scene", userId: telegramUserId });
    await ctx.reply("Error al guardar el comprobante. Intentá de nuevo.");
  }
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
    ctx.wizard.selectStep(USD_INPUT_STEP);
    return;
  }

  await ctx.editMessageText("*Ingresá el monto de los consumos en pesos*", { parse_mode: "Markdown" });
  ctx.wizard.selectStep(ARS_INPUT_STEP);
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
  const dueDate = buildDueDate(parseInt(year, 10), parseInt(month, 10), state.dueDay as number);

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
  // Post-leave re-engagement: show the card's statement list as next navigation point.
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
  // Post-leave re-engagement: show the card's statement list as next navigation point.
  if (cardId) {
    await ctx.reply("*¿Qué querés hacer?*", {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([[Markup.button.callback("Ver resúmenes", `card_stmts:${cardId}`)]]),
    });
  }
}

/**
 * Pay flow: user selected "Dólares" as payment currency.
 * Marks statement as paid (no TCV), sends RG 5617 warning, prompts for ARS receipt.
 * Callback: card_stmt_usd_pay_usd:{statementId}
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handlePayCurrencyUSD(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() ?? "";

  try {
    await markStatementAsPaid({ statementId, usdPaymentCurrency: "usd" });
  } catch (error) {
    log.error("Error marking statement paid (USD)", error, { module: "card-stmt.scene", userId: telegramUserId });
    await ctx.reply("Error al registrar el pago. Intentá de nuevo.");
    return;
  }

  await ctx.editMessageText("✅ Resumen marcado como pagado.");
  await ctx.reply(
    "Recordá descontar el item correspondiente a la percepción RG 5617 del total a pagar en pesos, correspondiente al 30% de tus gastos en dolares alcanzados por la Resolución General",
  );
  await ctx.reply(
    "*¿Querés adjuntar el comprobante de pago en ARS?*",
    { parse_mode: "Markdown", ...buildStmtPayARSKeyboard({ statementId, hasUSD: true }) },
  );
  ctx.wizard.selectStep(PAY_ARS_STEP);
}

/**
 * Pay flow: user selected "Pesos" as payment currency for USD portion. Prompts for TCV.
 * Callback: card_stmt_usd_pay_ars:{statementId}
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handlePayCurrencyARS(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "*Ingresá el tipo de cambio al que pagaste los dólares*",
    { parse_mode: "Markdown" },
  );
  ctx.wizard.selectStep(PAY_RATE_STEP);
}

/**
 * Pay flow: user chose to attach ARS payment receipt. Advances cursor to upload step.
 * Callback: card_stmt_pay_attach_ars:{statementId}
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handlePayAttachARS(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await ctx.editMessageText("Enviá la foto o PDF del comprobante de pago en ARS.");
  ctx.wizard.selectStep(PAY_ARS_UPLOAD_STEP);
}

/**
 * Pay flow: user skipped ARS receipt. Continues to USD receipt if needed, else shows summary.
 * Callback: card_stmt_pay_ars_skip:{statementId}:{0|1}
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handlePaySkipARS(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as CardStmtWizardState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];

  await ctx.editMessageText("Omitiste cargar el comprobante de pago en ARS.");

  if ((state.statementAmountUSD ?? 0) > 0) {
    await ctx.reply(
      "*¿Querés adjuntar el comprobante de pago en USD?*",
      { parse_mode: "Markdown", ...buildStmtPayUSDKeyboard(statementId) },
    );
    ctx.wizard.selectStep(PAY_USD_STEP);
    return;
  }

  try {
    const statement = await getStatementById(statementId);
    if (statement) {
      await ctx.reply(buildPaymentSummaryText(statement, state.cardLabel || ""), { parse_mode: "Markdown" });
    }
  } catch (error) {
    log.error("Error fetching statement for summary", error, { module: "card-stmt.scene", userId: ctx.from?.id.toString() ?? "" });
  }
  await ctx.scene.leave();
}

/**
 * Pay flow: user chose to attach USD payment receipt. Advances cursor to upload step.
 * Callback: card_stmt_pay_attach_usd:{statementId}
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handlePayAttachUSD(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await ctx.editMessageText("Enviá la foto o PDF del comprobante de pago en USD.");
  ctx.wizard.selectStep(PAY_USD_UPLOAD_STEP);
}

/**
 * Pay flow: user skipped USD receipt. Shows payment summary and leaves scene.
 * Callback: card_stmt_pay_usd_skip:{statementId}
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handlePaySkipUSD(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as CardStmtWizardState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statementId = ((ctx as any).match as string[])[1];

  await ctx.editMessageText("Omitiste cargar el comprobante de pago en USD.");

  try {
    const statement = await getStatementById(statementId);
    if (statement) {
      await ctx.reply(buildPaymentSummaryText(statement, state.cardLabel || ""), { parse_mode: "Markdown" });
    }
  } catch (error) {
    log.error("Error fetching statement for summary", error, { module: "card-stmt.scene", userId: ctx.from?.id.toString() ?? "" });
  }
  await ctx.scene.leave();
}

// -- Edit action handlers --

/**
 * Edit USD (paid in USD): stores currency, shows confirm keyboard.
 * Callback: card_stmt_edit_usd_pay_usd:{statementId}
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleEditUsdCurrencyUSD(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as CardStmtWizardState;
  state.usdPaymentCurrency = "usd";

  const pendingUSD = state.pendingEditUSD || 0;
  await ctx.editMessageText(
    `*Vas a cambiar el monto en dólares a ${formatUSD(pendingUSD)}. ¿Confirmás?*`,
    {
      parse_mode: "Markdown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: Markup.inlineKeyboard([[
        Markup.button.callback("Cancelar", "card_stmt_edit_cancel"),
        Markup.button.callback("Confirmar", "card_stmt_edit_ok_usd"),
      ]]).reply_markup as any,
    },
  );
  ctx.wizard.selectStep(EDIT_USD_CONFIRM_STEP);
}

/**
 * Edit USD (paid in pesos): stores currency choice, prompts for TCV.
 * Callback: card_stmt_edit_usd_pay_ars:{statementId}
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleEditUsdCurrencyARS(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as CardStmtWizardState;
  state.usdPaymentCurrency = "ars";

  const pendingUSD = state.pendingEditUSD || 0;
  await ctx.editMessageText(
    `*Monto en USD*: ${formatUSD(pendingUSD)}\n*Ingresá el tipo de cambio al que pagaste los dólares*`,
    { parse_mode: "Markdown" },
  );
  ctx.wizard.selectStep(EDIT_USD_TCV_STEP);
}

/**
 * Confirms and saves the new ARS amount, shows updated statement detail.
 * Callback: card_stmt_edit_ok_ars
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleConfirmEditArs(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as CardStmtWizardState;
  const statementId = state.statementId || "";
  const amount = state.pendingEditValue || 0;
  const telegramUserId = ctx.from?.id.toString() ?? "";

  try {
    await updateStatementAmountARS({ statementId, amount });
  } catch (error) {
    log.error("Error updating ARS amount", error, { module: "card-stmt.scene", userId: telegramUserId });
    await ctx.reply("Error al guardar el cambio. Intentá de nuevo.");
    return;
  }

  await ctx.editMessageText(`✅ Modificaste el monto en pesos. Nuevo monto: ${formatARS(amount)}.`);
  await ctx.scene.leave();

  const updatedStatement = await getStatementById(statementId);
  if (updatedStatement) {
    await ctx.reply(
      buildStatementDetailText(updatedStatement, state.cardLabel || ""),
      {
        parse_mode: "Markdown",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: buildStatementDetailKeyboard({
          statementId,
          cardId: updatedStatement.cardId,
          isPaid: updatedStatement.isPaid,
        }).reply_markup as any,
      },
    );
  }
}

/**
 * Confirms and saves the new USD amount (and TCV if applicable), shows updated detail.
 * Callback: card_stmt_edit_ok_usd
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleConfirmEditUsd(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as CardStmtWizardState;
  const statementId = state.statementId || "";
  const amountUSD = state.pendingEditUSD || 0;
  const telegramUserId = ctx.from?.id.toString() ?? "";

  try {
    await updateStatementUSDAndRate({
      statementId,
      amountUSD,
      exchangeRate: state.exchangeRate,
      usdPaymentCurrency: state.usdPaymentCurrency,
    });
  } catch (error) {
    log.error("Error updating USD amount", error, { module: "card-stmt.scene", userId: telegramUserId });
    await ctx.reply("Error al guardar el cambio. Intentá de nuevo.");
    return;
  }

  await ctx.editMessageText(`✅ Modificaste el monto en dólares. Nuevo monto: ${formatUSD(amountUSD)}.`);
  await ctx.scene.leave();

  const updatedStatement = await getStatementById(statementId);
  if (updatedStatement) {
    await ctx.reply(
      buildStatementDetailText(updatedStatement, state.cardLabel || ""),
      {
        parse_mode: "Markdown",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: buildStatementDetailKeyboard({
          statementId,
          cardId: updatedStatement.cardId,
          isPaid: updatedStatement.isPaid,
        }).reply_markup as any,
      },
    );
  }
}

/**
 * Confirms and saves the new due day, shows updated statement detail.
 * Callback: card_stmt_edit_ok_day
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleConfirmEditDay(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as CardStmtWizardState;
  const statementId = state.statementId || "";
  const newDay = state.dueDay || 0;
  const [, month] = (state.statementMonth || "").split("-");
  const telegramUserId = ctx.from?.id.toString() ?? "";

  try {
    await updateStatementDueDay({ statementId, newDay });
  } catch (error) {
    log.error("Error updating due day", error, { module: "card-stmt.scene", userId: telegramUserId });
    await ctx.reply("Error al guardar el cambio. Intentá de nuevo.");
    return;
  }

  await ctx.editMessageText(
    `✅ Modificaste el vencimiento. Nuevo vencimiento: ${String(newDay).padStart(2, "0")}/${month || "?"}.`,
  );
  await ctx.scene.leave();

  const updatedStatement = await getStatementById(statementId);
  if (updatedStatement) {
    await ctx.reply(
      buildStatementDetailText(updatedStatement, state.cardLabel || ""),
      {
        parse_mode: "Markdown",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: buildStatementDetailKeyboard({
          statementId,
          cardId: updatedStatement.cardId,
          isPaid: updatedStatement.isPaid,
        }).reply_markup as any,
      },
    );
  }
}

/**
 * Cancels the edit flow and leaves the scene.
 * Callback: card_stmt_edit_cancel
 *
 * @param {KakebotContext} ctx - Wizard context
 */
async function handleCancelEdit(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await ctx.scene.leave();
  await ctx.reply("Operación cancelada.");
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
 * Pay flow: uploads the ARS payment receipt and continues to USD step if needed.
 *
 * @param {KakebotContext} ctx - Wizard context
 * @param {string | null} documentFileId - PDF file_id when handling a document; null for photos
 */
async function handlePayARSReceiptUpload(ctx: KakebotContext, documentFileId: string | null): Promise<void> {
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
    const receiptUrl = await uploadStatementPaymentReceipt({
      telegramUserId, installmentId: statementId, fileBuffer, mimeType: resolvedMimeType,
    });
    await saveStatementReceiptUrlARS(statementId, receiptUrl);
    await ctx.reply("✅ Comprobante de pago en Pesos guardado.");

    if ((state.statementAmountUSD ?? 0) > 0) {
      await ctx.reply(
        "*¿Querés adjuntar el comprobante de pago en USD?*",
        { parse_mode: "Markdown", ...buildStmtPayUSDKeyboard(statementId) },
      );
      ctx.wizard.selectStep(PAY_USD_STEP);
    } else {
      const statement = await getStatementById(statementId);
      if (statement) {
        await ctx.reply(buildPaymentSummaryText(statement, state.cardLabel || ""), { parse_mode: "Markdown" });
      }
      await ctx.scene.leave();
    }
  } catch (error) {
    log.error("Error uploading ARS payment receipt", error, { module: "card-stmt.scene", userId: telegramUserId });
    await ctx.reply("Error al guardar el comprobante. Intentá de nuevo.");
  }
}

/**
 * Pay flow: uploads the USD payment receipt and shows the payment summary.
 *
 * @param {KakebotContext} ctx - Wizard context
 * @param {string | null} documentFileId - PDF file_id when handling a document; null for photos
 */
async function handlePayUSDReceiptUpload(ctx: KakebotContext, documentFileId: string | null): Promise<void> {
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
    const receiptUrl = await uploadStatementPaymentReceiptUSD({
      telegramUserId, installmentId: statementId, fileBuffer, mimeType: resolvedMimeType,
    });
    await saveStatementReceiptUrlUSD(statementId, receiptUrl);
    await ctx.reply("✅ Comprobante de pago en Dólares guardado.");

    const statement = await getStatementById(statementId);
    if (statement) {
      await ctx.reply(buildPaymentSummaryText(statement, state.cardLabel || ""), { parse_mode: "Markdown" });
    }
    await ctx.scene.leave();
  } catch (error) {
    log.error("Error uploading USD payment receipt", error, { module: "card-stmt.scene", userId: telegramUserId });
    await ctx.reply("Error al guardar el comprobante. Intentá de nuevo.");
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
  case PAY_CURRENCY_STEP:
    await ctx.reply(
      "*¿Con qué moneda pagaste los dólares?*",
      { parse_mode: "Markdown", ...buildStmtUsdCurrencyKeyboard({ statementId: state.statementId || "", flow: "pay" }) },
    );
    break;
  case PAY_RATE_STEP:
    await ctx.reply("*Ingresá el tipo de cambio al que pagaste los dólares*", { parse_mode: "Markdown" });
    break;
  case PAY_ARS_STEP:
    await ctx.reply(
      "*¿Querés adjuntar el comprobante de pago en ARS?*",
      {
        parse_mode: "Markdown",
        ...buildStmtPayARSKeyboard({ statementId: state.statementId || "", hasUSD: (state.statementAmountUSD ?? 0) > 0 }),
      },
    );
    break;
  case PAY_ARS_UPLOAD_STEP:
    await ctx.reply("Enviá la foto o PDF del comprobante en Pesos.");
    break;
  case PAY_USD_STEP:
    await ctx.reply(
      "*¿Querés adjuntar el comprobante de pago en USD?*",
      { parse_mode: "Markdown", ...buildStmtPayUSDKeyboard(state.statementId || "") },
    );
    break;
  case PAY_USD_UPLOAD_STEP:
    await ctx.reply("Enviá la foto o PDF del comprobante en Dólares.");
    break;
  case EDIT_ARS_INPUT_STEP:
    await ctx.reply("*Ingresá el nuevo monto en pesos:*", { parse_mode: "Markdown" });
    break;
  case EDIT_ARS_CONFIRM_STEP: {
    const arsAmount = (state as CardStmtWizardState).pendingEditValue || 0;
    await ctx.reply(
      `*Nuevo monto*: ${formatARS(arsAmount)}\n\n*¿Confirmar el cambio?*`,
      {
        parse_mode: "Markdown",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: Markup.inlineKeyboard([[
          Markup.button.callback("Cancelar", "card_stmt_edit_cancel"),
          Markup.button.callback("Confirmar", "card_stmt_edit_ok_ars"),
        ]]).reply_markup as any,
      },
    );
    break;
  }
  case EDIT_USD_INPUT_STEP:
    await ctx.reply("*Ingresá el nuevo monto en dólares:*", { parse_mode: "Markdown" });
    break;
  case EDIT_USD_CURRENCY_STEP:
    await ctx.reply(
      `*Nuevo monto U$S*: ${formatUSD((state as CardStmtWizardState).pendingEditUSD || 0)}\n`
      + "*¿Con qué moneda pagaste los dólares?*",
      {
        parse_mode: "Markdown",
        ...buildStmtUsdCurrencyKeyboard({ statementId: state.statementId || "", flow: "edit" }),
      },
    );
    break;
  case EDIT_USD_TCV_STEP:
    await ctx.reply("*Ingresá el tipo de cambio al que pagaste los dólares*", { parse_mode: "Markdown" });
    break;
  case EDIT_USD_CONFIRM_STEP: {
    const usdAmount = (state as CardStmtWizardState).pendingEditUSD || 0;
    const usdLines: string[] = [`*Nuevo monto*: ${formatUSD(usdAmount)}`];
    const rate = (state as CardStmtWizardState).exchangeRate;
    if (rate) {
      usdLines.push(`*Tipo de cambio*: ${formatARS(rate)}`);
      usdLines.push(`*Total*: ${formatARS(usdAmount * rate)}`);
    }
    usdLines.push("\n*¿Confirmar el cambio?*");
    await ctx.reply(
      usdLines.join("\n"),
      {
        parse_mode: "Markdown",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: Markup.inlineKeyboard([[
          Markup.button.callback("Cancelar", "card_stmt_edit_cancel"),
          Markup.button.callback("Confirmar", "card_stmt_edit_ok_usd"),
        ]]).reply_markup as any,
      },
    );
    break;
  }
  case EDIT_DAY_INPUT_STEP: {
    const dayMax = state.statementMonth ? getDaysInMonth(state.statementMonth) : 31;
    await ctx.reply(`*Ingresá el nuevo día (1-${dayMax}):*`, { parse_mode: "Markdown" });
    break;
  }
  case EDIT_DAY_CONFIRM_STEP: {
    const [, mon] = (state.statementMonth || "").split("-");
    const pendingDay = (state as CardStmtWizardState).dueDay || 0;
    await ctx.reply(
      `*Nuevo vencimiento*: ${String(pendingDay).padStart(2, "0")}/${mon || "?"}\n\n*¿Confirmar el cambio?*`,
      {
        parse_mode: "Markdown",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: Markup.inlineKeyboard([[
          Markup.button.callback("Cancelar", "card_stmt_edit_cancel"),
          Markup.button.callback("Confirmar", "card_stmt_edit_ok_day"),
        ]]).reply_markup as any,
      },
    );
    break;
  }
  case RECEIPT_ARS_STEP:
    await ctx.reply(
      `*Enviá el comprobante de pago en ARS del resumen ${monthLabelOf(state.statementMonth || "")} · ${state.cardLabel || ""}*`,
      { parse_mode: "Markdown" },
    );
    break;
  case RECEIPT_USD_STEP:
    await ctx.reply(
      `*Enviá el comprobante de pago en USD del resumen ${monthLabelOf(state.statementMonth || "")} · ${state.cardLabel || ""}*`,
      { parse_mode: "Markdown" },
    );
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
  stepGuardPayCurrency, // 9 = PAY_CURRENCY_STEP
  stepHandlePayRate, // 10 = PAY_RATE_STEP
  stepGuardPayArs, // 11 = PAY_ARS_STEP
  stepGuardPayArsUpload, // 12 = PAY_ARS_UPLOAD_STEP
  stepGuardPayUsd, // 13 = PAY_USD_STEP
  stepGuardPayUsdUpload, // 14 = PAY_USD_UPLOAD_STEP
  stepHandleEditArsInput, // 15 = EDIT_ARS_INPUT_STEP
  stepGuardEditArsConfirm, // 16 = EDIT_ARS_CONFIRM_STEP
  stepHandleEditUsdInput, // 17 = EDIT_USD_INPUT_STEP
  stepGuardEditUsdCurrency, // 18 = EDIT_USD_CURRENCY_STEP
  stepHandleEditTcvInput, // 19 = EDIT_USD_TCV_STEP
  stepGuardEditUsdConfirm, // 20 = EDIT_USD_CONFIRM_STEP
  stepHandleEditDayInput, // 21 = EDIT_DAY_INPUT_STEP
  stepGuardEditDayConfirm, // 22 = EDIT_DAY_CONFIRM_STEP
  stepGuardReceiptARS, // 23 = RECEIPT_ARS_STEP
  stepGuardReceiptUSD, // 24 = RECEIPT_USD_STEP
);

cardStmtScene.hears(CANCEL_REGEX, handleCancelWord);

cardStmtScene.action(/^card_stmt_month:(.+):(\d{4}-\d{2})$/, handleMonthSelected);
cardStmtScene.action(/^card_stmt_currency:(ars|usd|both)$/, handleCurrencySelected);
cardStmtScene.action("card_stmt_confirm", handleConfirm);
cardStmtScene.action("card_stmt_cancel", handleCancel);
cardStmtScene.action(/^card_stmt_attach:(.+)$/, handleAttachPdf);
cardStmtScene.action("card_stmt_skip", handleSkipPdf);
cardStmtScene.action(/^card_stmt_usd_pay_usd:(.+)$/, handlePayCurrencyUSD);
cardStmtScene.action(/^card_stmt_usd_pay_ars:(.+)$/, handlePayCurrencyARS);
cardStmtScene.action(/^card_stmt_pay_attach_ars:(.+)$/, handlePayAttachARS);
cardStmtScene.action(/^card_stmt_pay_ars_skip:(.+):(0|1)$/, handlePaySkipARS);
cardStmtScene.action(/^card_stmt_pay_attach_usd:(.+)$/, handlePayAttachUSD);
cardStmtScene.action(/^card_stmt_pay_usd_skip:(.+)$/, handlePaySkipUSD);
cardStmtScene.action(/^card_stmt_edit_usd_pay_usd:(.+)$/, handleEditUsdCurrencyUSD);
cardStmtScene.action(/^card_stmt_edit_usd_pay_ars:(.+)$/, handleEditUsdCurrencyARS);
cardStmtScene.action("card_stmt_edit_ok_ars", handleConfirmEditArs);
cardStmtScene.action("card_stmt_edit_ok_usd", handleConfirmEditUsd);
cardStmtScene.action("card_stmt_edit_ok_day", handleConfirmEditDay);
cardStmtScene.action("card_stmt_edit_cancel", handleCancelEdit);

cardStmtScene.on("photo", async (ctx) => {
  const cursor = ctx.wizard.cursor;
  if (cursor === CREATE_PDF_STEP || cursor === RECEIPT_PDF_STEP) {
    await handlePdfUpload(ctx, null);
    return;
  }
  if (cursor === PAY_ARS_UPLOAD_STEP || cursor === PAY_ARS_STEP) {
    await handlePayARSReceiptUpload(ctx, null);
    return;
  }
  if (cursor === PAY_USD_UPLOAD_STEP || cursor === PAY_USD_STEP) {
    await handlePayUSDReceiptUpload(ctx, null);
    return;
  }
  if (cursor === RECEIPT_ARS_STEP) {
    await handleStandaloneARSReceiptUpload(ctx, null);
    return;
  }
  if (cursor === RECEIPT_USD_STEP) {
    await handleStandaloneUSDReceiptUpload(ctx, null);
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
  if (cursor === PAY_ARS_UPLOAD_STEP || cursor === PAY_ARS_STEP) {
    await handlePayARSReceiptUpload(ctx, document.file_id);
    return;
  }
  if (cursor === PAY_USD_UPLOAD_STEP || cursor === PAY_USD_STEP) {
    await handlePayUSDReceiptUpload(ctx, document.file_id);
    return;
  }
  if (cursor === RECEIPT_ARS_STEP) {
    await handleStandaloneARSReceiptUpload(ctx, document.file_id);
    return;
  }
  if (cursor === RECEIPT_USD_STEP) {
    await handleStandaloneUSDReceiptUpload(ctx, document.file_id);
    return;
  }
  await repromptCurrentStep(ctx);
});
