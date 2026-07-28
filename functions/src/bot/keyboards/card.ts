import { Markup } from "telegraf";
import { CreditCard, CardStatement } from "../../types/index";
import {
  CardConfirmTextParams,
  StmtConfirmTextParams,
  BuildStatementDetailKeyboardParams,
  BuildStatementListKeyboardParams,
  BuildStmtEditConfirmKeyboardParams,
  BuildStmtReceiptsKeyboardParams,
  BuildStmtPayARSKeyboardParams,
  BuildStmtUsdCurrencyKeyboardParams,
} from "../../types/card.types";
import { formatARS, formatUSD, MONTH_NAMES } from "../../helpers/format";

const CARDS_PER_PAGE = 6;
const STATEMENTS_PER_PAGE = 6;

/**
 * Builds the label displayed on card list buttons (includes bank).
 *
 * @param {CreditCard} card
 * @return {string} e.g. "Visa 5477 Galicia" or "MasterCard 7599 Frances"
 */
export function buildCardButtonLabel(card: CreditCard): string {
  const processorLabel = card.processor === "VISA" ? "Visa" : "Master";
  return `${processorLabel} ${card.lastFourDigits} ${card.bank}`;
}

/**
 * Builds the full card label with hyphen separator (for breadcrumbs/detail).
 *
 * @param {CreditCard} card
 * @return {string} e.g. "Visa 5477 - Galicia"
 */
export function buildCardLabel(card: CreditCard): string {
  const processorLabel = card.processor === "VISA" ? "Visa" : "Master";
  return `${processorLabel} ${card.lastFourDigits} - ${card.bank}`;
}

/**
 * Builds a paginated 2-column grid of credit cards.
 *
 * @param {CreditCard[]} cards
 * @param {number} page - Zero-indexed page number
 * @return {Markup} Inline keyboard markup
 */
export function buildCardListKeyboard(cards: CreditCard[], page: number) {
  const start = page * CARDS_PER_PAGE;
  const end = start + CARDS_PER_PAGE;
  const pageCards = cards.slice(start, end);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];

  for (let i = 0; i < pageCards.length; i += 2) {
    const row = [];
    const card1 = pageCards[i];
    row.push(
      Markup.button.callback(
        buildCardButtonLabel(card1),
        `card_pick:${card1.id}`,
      ),
    );
    if (i + 1 < pageCards.length) {
      const card2 = pageCards[i + 1];
      row.push(
        Markup.button.callback(
          buildCardButtonLabel(card2),
          `card_pick:${card2.id}`,
        ),
      );
    }
    rows.push(row);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navRow: any[] = [];
  if (page > 0) {
    navRow.push(
      Markup.button.callback("← Página anterior", `card_pg:${page - 1}`),
    );
  }
  if (end < cards.length) {
    navRow.push(
      Markup.button.callback("Página siguiente →", `card_pg:${page + 1}`),
    );
  }
  if (navRow.length > 0) {
    rows.push(navRow);
  }

  rows.push([Markup.button.callback("← Volver", "menu_tarjetas")]);

  return Markup.inlineKeyboard(rows);
}

/**
 * Processor selection keyboard for card creation.
 *
 * @return {object} Inline keyboard markup
 */
export function buildCardProcessorKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("VISA", "card_proc:VISA"),
      Markup.button.callback("MASTERCARD", "card_proc:MASTERCARD"),
    ],
  ]);
}

/**
 * Confirm/cancel keyboard for card creation.
 *
 * @return {object} Inline keyboard markup
 */
export function buildCardConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Cancelar", "card_cancel"),
      Markup.button.callback("Confirmar", "card_confirm"),
    ],
  ]);
}

/**
 * Month selection keyboard for statement registration.
 *
 * @param {string} cardId
 * @param {string[]} existingMonths - YYYY-MM strings to skip (already have a statement)
 * @return {object} Inline keyboard markup
 */
export function buildCardStmtMonthKeyboard(cardId: string, existingMonths: string[] = []) {
  const now = new Date();
  const months = [];

  for (let i = 0; i < 3; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const dueMonth = `${year}-${month}`;

    if (existingMonths.includes(dueMonth)) continue;

    const label = `${MONTH_NAMES[date.getMonth()]} ${year}`;
    months.push([
      Markup.button.callback(label, `card_stmt_month:${cardId}:${dueMonth}`),
    ]);
  }

  months.push([Markup.button.callback("Cancelar", "card_stmt_cancel")]);

  return Markup.inlineKeyboard(months);
}

/**
 * Currency selection keyboard for statement registration.
 * Replaces the old Yes/No USD keyboard.
 *
 * @return {object} Inline keyboard markup
 */
export function buildCardCurrencyKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Pesos", "card_stmt_currency:ars"),
      Markup.button.callback("Dólares", "card_stmt_currency:usd"),
      Markup.button.callback("Ambos", "card_stmt_currency:both"),
    ],
  ]);
}

/**
 * Confirm/cancel keyboard for statement creation.
 *
 * @return {object} Inline keyboard markup
 */
export function buildCardStmtConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Cancelar", "card_stmt_cancel"),
      Markup.button.callback("Confirmar", "card_stmt_confirm"),
    ],
  ]);
}

/**
 * Receipt attachment prompt after statement creation.
 *
 * @param {string} statementId
 * @return {object} Inline keyboard markup
 */
export function buildCardStmtReceiptKeyboard(statementId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Omitir", "card_stmt_skip"),
      Markup.button.callback("Adjuntar", `card_stmt_attach:${statementId}`),
    ],
  ]);
}

/**
 * Post-card-creation prompt to register a statement immediately.
 *
 * @param {string} cardId
 * @return {object} Inline keyboard markup
 */
export function buildCardStmtAfterCreateKeyboard(cardId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Omitir", "card_stmt_no"),
      Markup.button.callback("Añadir", `card_stmt_reg:${cardId}`),
    ],
  ]);
}

/**
 * Card detail keyboard with primary navigation options.
 * "Añadir Resumen" is shown only when no statement exists for the current month.
 * PDF actions are available from the individual statement detail, not here.
 *
 * @param {string} cardId
 * @param {CardStatement | null} statement - Current month statement, if any
 * @return {object} Inline keyboard markup
 */
export function buildCardDetailKeyboard(
  cardId: string,
  statement: CardStatement | null,
) {
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];

  if (!statement) {
    rows.push([
      Markup.button.callback("Añadir Resumen", `card_stmt_reg:${cardId}`),
      Markup.button.callback("Resúmenes", `card_stmts:${cardId}`),
    ]);
  } else {
    rows.push([Markup.button.callback("Resúmenes", `card_stmts:${cardId}`)]);
  }

  rows.push([Markup.button.callback("← Volver a tarjetas", "card_list")]);
  return Markup.inlineKeyboard(rows);
}

/**
 * Builds the card detail text for the read-only view.
 *
 * @param {CreditCard} card
 * @param {CardStatement | null} statement - Current month statement, if any
 * @return {string} Formatted detail text
 */
export function buildCardDetailText(
  card: CreditCard,
  statement: CardStatement | null,
): string {
  const label = buildCardLabel(card);
  const expiryStr = `${String(card.expiryMonth).padStart(2, "0")}/${card.expiryYear}`;

  const lines = [
    `*${label}*`,
    "",
    `*Vencimiento tarjeta*: ${expiryStr}`,
    `*Procesador*: ${card.processor}`,
  ];

  const now = new Date();
  const monthName = MONTH_NAMES[now.getMonth()];
  const year = now.getFullYear();

  if (statement) {
    const dueDate = statement.dueDate.toDate();
    const day = String(dueDate.getDate()).padStart(2, "0");
    const mo = String(dueDate.getMonth() + 1).padStart(2, "0");

    lines.push("");
    lines.push(`*Resumen ${monthName} ${year}:*`);
    lines.push(` • Monto: ${formatARS(statement.amountARS)}`);
    if (statement.amountUSD > 0) {
      lines.push(` • Dólares: ${formatUSD(statement.amountUSD)}`);
    }
    lines.push(` • Vence: ${day}/${mo}`);
    lines.push(
      ` • Estado: ${statement.isPaid ? "✅ Pagado" : "Pendiente de pago"}`,
    );
  } else {
    lines.push("");
    lines.push(`Sin resumen registrado para ${monthName} ${year}.`);
  }

  return lines.join("\n");
}

/**
 * Builds the card creation confirmation text.
 *
 * @param {CardConfirmTextParams} params
 * @return {string}
 */
export function buildCardConfirmText(params: CardConfirmTextParams): string {
  const { digits, bank, processor, expiry } = params;

  return (
    "*Vas a agregar la siguiente tarjeta*\n\n" +
    ` • Últimos 4 dígitos: ${digits}\n` +
    ` • Banco: ${bank}\n` +
    ` • Procesador: ${processor}\n` +
    ` • Vencimiento: ${expiry}`
  );
}

/**
 * Hub keyboard for the cards main menu.
 *
 * @return {object} Inline keyboard markup
 */
export function buildCardsHubKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Seleccionar tarjeta", "card_select"),
      Markup.button.callback("Ver como listado", "card_list_view"),
    ],
    [Markup.button.callback("Añadir tarjeta", "card_add")],
    [Markup.button.callback("← Volver al menú", "menu_back")],
  ]);
}

/**
 * Back keyboard for the card list view screen.
 *
 * @return {object} Inline keyboard markup
 */
export function buildCardListViewKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("← Volver a tarjetas", "menu_tarjetas")],
  ]);
}

/**
 * Keyboard shown when the user has no cards registered yet.
 *
 * @return {object} Inline keyboard markup
 */
export function buildCardEmptyStateKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Añadir tarjeta", "card_add")],
    [Markup.button.callback("← Volver a tarjetas", "menu_tarjetas")],
  ]);
}

/**
 * Builds a paginated 2-column grid of statement buttons, ordered oldest to newest.
 *
 * @param {BuildStatementListKeyboardParams} params
 * @return {object} Inline keyboard markup
 */
export function buildStatementListKeyboard({
  statements,
  page,
  cardId,
  cardLabel,
}: BuildStatementListKeyboardParams) {
  const start = page * STATEMENTS_PER_PAGE;
  const end = start + STATEMENTS_PER_PAGE;
  const pageStmts = statements.slice(start, end);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];

  for (let i = 0; i < pageStmts.length; i += 2) {
    const row = [];
    const stmt1 = pageStmts[i];
    const [year1, month1] = stmt1.month.split("-");
    const baseLabel1 = `${MONTH_NAMES[parseInt(month1, 10) - 1]} ${year1}`;
    const label1 = stmt1.isPaid ? `${baseLabel1} ✅` : baseLabel1;
    row.push(Markup.button.callback(label1, `card_stmt_detail:${stmt1.id}`));
    if (i + 1 < pageStmts.length) {
      const stmt2 = pageStmts[i + 1];
      const [year2, month2] = stmt2.month.split("-");
      const baseLabel2 = `${MONTH_NAMES[parseInt(month2, 10) - 1]} ${year2}`;
      const label2 = baseLabel2;
      row.push(Markup.button.callback(label2, `card_stmt_detail:${stmt2.id}`));
    }
    rows.push(row);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navRow: any[] = [];
  if (page > 0) {
    navRow.push(
      Markup.button.callback(
        "← Anterior",
        `card_stmts_pg:${cardId}:${page - 1}`,
      ),
    );
  }
  if (end < statements.length) {
    navRow.push(
      Markup.button.callback("Más →", `card_stmts_pg:${cardId}:${page + 1}`),
    );
  }
  if (navRow.length > 0) rows.push(navRow);

  rows.push([Markup.button.callback("Añadir Resumen", `card_stmt_add:${cardId}`)]);
  rows.push([Markup.button.callback(`← Volver a ${cardLabel}`, `card_pick:${cardId}`)]);
  return Markup.inlineKeyboard(rows);
}

/**
 * Builds the detail text for a single statement.
 *
 * @param {CardStatement} statement
 * @param {string} cardLabel - e.g. "Visa 5477 - Galicia"
 * @return {string}
 */
export function buildStatementDetailText(
  statement: CardStatement,
  cardLabel: string,
): string {
  const [year, month] = statement.month.split("-");
  const monthName = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  const dueDate = statement.dueDate.toDate();
  const day = String(dueDate.getDate()).padStart(2, "0");

  const lines = [
    `*Resumen ${monthName}*`,
    ` • *Tarjeta*: ${cardLabel}`,
    ` • *Consumos en pesos*: ${formatARS(statement.amountARS)}`,
  ];

  if (statement.amountUSD > 0) {
    lines.push(` • *Consumos en dólares*: ${formatUSD(statement.amountUSD)}`);
  }

  lines.push(` • *Vencimiento*: ${day}/${month}`);
  lines.push(` • *Estado*: ${statement.isPaid ? "✅ Pagado" : "Pendiente"}`);

  if (statement.isPaid && statement.amountUSD > 0 && statement.exchangeRate) {
    lines.push(` • *Tipo de cambio USD*: ${formatARS(statement.exchangeRate)}`);
  }

  return lines.join("\n");
}

/**
 * Builds the action keyboard for a statement detail screen.
 *
 * @param {BuildStatementDetailKeyboardParams} params
 * @return {object} Inline keyboard markup
 */
export function buildStatementDetailKeyboard({
  statementId,
  cardId,
  isPaid,
}: BuildStatementDetailKeyboardParams) {
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];

  if (!isPaid) {
    rows.push([
      Markup.button.callback("Marcar como pagado", `card_stmt_pay:${statementId}`),
    ]);
  }

  rows.push([Markup.button.callback("Comprobantes", `card_stmt_receipts:${statementId}`)]);
  rows.push([Markup.button.callback("Modificar", `card_stmt_edit:${statementId}`)]);
  rows.push([Markup.button.callback("← Volver", `card_stmts:${cardId}`)]);
  return Markup.inlineKeyboard(rows);
}

/**
 * Builds the edit field selection keyboard for a statement.
 * Back button returns to the statement detail view.
 *
 * @param {string} statementId
 * @return {object} Inline keyboard markup
 */
export function buildStatementEditMenuKeyboard(statementId: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Monto ARS", `card_edit_ars:${statementId}`)],
    [Markup.button.callback("Monto U$S", `card_edit_usd:${statementId}`)],
    [Markup.button.callback("Vencimiento", `card_edit_day:${statementId}`)],
    [Markup.button.callback("← Volver", `card_stmt_detail:${statementId}`)],
  ]);
}

/**
 * Confirm/cancel keyboard for a statement field edit.
 *
 * @param {BuildStmtEditConfirmKeyboardParams} params
 * @return {object} Inline keyboard markup
 */
export function buildStmtEditConfirmKeyboard({
  field,
  statementId,
  value,
}: BuildStmtEditConfirmKeyboardParams) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Cancelar", `card_stmt_edit:${statementId}`),
      Markup.button.callback(
        "Confirmar",
        `card_edit_ok:${field}:${statementId}:${value}`,
      ),
    ],
  ]);
}

/**
 * Post-payment ARS receipt prompt keyboard.
 * Encodes hasUSD in the skip callback so the handler knows whether to continue to USD step.
 *
 * @param {BuildStmtPayARSKeyboardParams} params
 * @return {object} Inline keyboard markup
 */
export function buildStmtPayARSKeyboard({ statementId, hasUSD }: BuildStmtPayARSKeyboardParams) {
  const skipCallback = `card_stmt_pay_ars_skip:${statementId}:${hasUSD ? "1" : "0"}`;
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Omitir", skipCallback),
      Markup.button.callback("Adjuntar ARS", `card_stmt_pay_attach_ars:${statementId}`),
    ],
  ]);
}

/**
 * Post-payment USD receipt prompt keyboard.
 *
 * @param {string} statementId
 * @return {object} Inline keyboard markup
 */
export function buildStmtPayUSDKeyboard(statementId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Omitir", `card_stmt_pay_usd_skip:${statementId}`),
      Markup.button.callback("Adjuntar USD", `card_stmt_pay_attach_usd:${statementId}`),
    ],
  ]);
}

/**
 * Receipts submenu keyboard — shows bank PDF and per-currency payment receipt options.
 * Displayed via the "Comprobantes" button in the statement detail screen.
 *
 * @param {BuildStmtReceiptsKeyboardParams} params
 * @return {object} Inline keyboard markup
 */
export function buildStmtReceiptsKeyboard({
  statementId,
  hasReceipt,
  isPaid,
  hasReceiptARS,
  hasReceiptUSD,
  amountUSD,
}: BuildStmtReceiptsKeyboardParams) {
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];

  if (hasReceipt) {
    rows.push([Markup.button.callback("Descargar Resumen PDF", `card_stmt_download:${statementId}`)]);
  } else {
    rows.push([Markup.button.callback("Subir Resumen PDF", `card_hist_attach:${statementId}`)]);
  }

  if (isPaid) {
    if (hasReceiptARS) {
      rows.push([Markup.button.callback("Descargar Comprobante ARS", `card_stmt_pay_download_ars:${statementId}`)]);
    } else {
      rows.push([Markup.button.callback("Adjuntar Comprobante ARS", `card_stmt_receipts_attach_ars:${statementId}`)]);
    }

    if (amountUSD > 0) {
      if (hasReceiptUSD) {
        rows.push([Markup.button.callback("Descargar Comprobante USD", `card_stmt_pay_download_usd:${statementId}`)]);
      } else {
        rows.push([Markup.button.callback("Adjuntar Comprobante USD", `card_stmt_receipts_attach_usd:${statementId}`)]);
      }
    }
  }

  rows.push([Markup.button.callback("← Volver", `card_stmt_detail:${statementId}`)]);
  return Markup.inlineKeyboard(rows);
}

/**
 * Builds the statement creation confirmation text.
 *
 * @param {StmtConfirmTextParams} params
 * @return {string}
 */
export function buildStmtConfirmText(params: StmtConfirmTextParams): string {
  const { cardLabel, monthLabel, amountARS, amountUSD, dueDay, stmtMonth } =
    params;

  const monthNum = stmtMonth.split("-")[1];
  const dueDateStr = `${String(dueDay).padStart(2, "0")}/${monthNum}`;

  const lines = [
    "*Confirmar datos nuevo resumen*",
    "",
    `*Tarjeta*: ${cardLabel}`,
    `*Mes*: ${monthLabel}`,
  ];
  if (amountARS > 0) {
    lines.push(`*Consumos en pesos*: ${formatARS(amountARS)}`);
  }
  if (amountUSD > 0) {
    lines.push(`*Consumos en dólares*: ${formatUSD(amountUSD)}`);
  }
  lines.push(`*Vencimiento*: ${dueDateStr}`);

  return lines.join("\n");
}

/**
 * Keyboard for selecting the currency used to pay the USD portion of a statement.
 * Used in both the payment flow and the edit-USD flow.
 *
 * @param {BuildStmtUsdCurrencyKeyboardParams} params
 * @return {object} Inline keyboard markup
 */
export function buildStmtUsdCurrencyKeyboard({ statementId, flow }: BuildStmtUsdCurrencyKeyboardParams) {
  const prefix = flow === "pay" ? "card_stmt_usd_pay" : "card_stmt_edit_usd_pay";
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Dólares", `${prefix}_usd:${statementId}`),
      Markup.button.callback("Pesos", `${prefix}_ars:${statementId}`),
    ],
  ]);
}

/**
 * Builds the payment summary text shown at the end of the pay flow.
 * Shown after all receipt decisions have been made.
 *
 * @param {CardStatement} statement - Re-fetched statement with all payment fields set
 * @param {string} cardLabel - e.g. "Visa 5477 - Galicia"
 * @return {string}
 */
export function buildPaymentSummaryText(statement: CardStatement, cardLabel: string): string {
  const yearMonth = statement.month.split("-");
  const year = yearMonth[0];
  const month = yearMonth[1];
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  const lines = [`*Resumen ${monthLabel} de ${cardLabel} marcado como pagado*`];

  if (statement.amountUSD > 0) {
    let usdLine = formatUSD(statement.amountUSD);
    if (statement.usdPaymentCurrency === "ars" && statement.exchangeRate) {
      const arsEquiv = formatARS(statement.amountUSD * statement.exchangeRate);
      const rateFormatted = formatARS(statement.exchangeRate);
      usdLine += ` (${arsEquiv} | ${rateFormatted})`;
    }
    lines.push(` • *Monto en Dólares*: ${usdLine}`);
  }

  lines.push(` • *Monto en Pesos*: ${formatARS(statement.amountARS)}`);

  return lines.join("\n");
}
