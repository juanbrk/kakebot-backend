import { Markup } from "telegraf";
import { CreditCard, CardStatement } from "../../types/index";
import { formatARS, formatUSD, MONTH_NAMES } from "../../helpers/format";

const CARDS_PER_PAGE = 6;

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

  rows.push([Markup.button.callback("Agregar tarjeta", "card_add")]);
  rows.push([Markup.button.callback("← Volver al menú", "menu_back")]);

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
    [Markup.button.callback("Cancelar", "card_cancel")],
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
 * @return {object} Inline keyboard markup
 */
export function buildCardStmtMonthKeyboard(cardId: string) {
  const now = new Date();
  const months = [];

  for (let i = 0; i < 3; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const dueMonth = `${year}-${month}`;
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
 * Card detail keyboard with back button and option to load a new statement.
 *
 * @param {string} cardId
 * @return {object} Inline keyboard markup
 */
export function buildCardDetailBackKeyboard(cardId: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Cargar nuevo resumen", `card_stmt_reg:${cardId}`)],
    [Markup.button.callback("← Volver a tarjetas", "card_list")],
  ]);
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
    `Vencimiento tarjeta: ${expiryStr}`,
    `Procesador: ${card.processor}`,
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
    lines.push(`Monto: ${formatARS(statement.amountARS)}`);
    if (statement.amountUSD > 0) {
      lines.push(`Dólares: ${formatUSD(statement.amountUSD)}`);
    }
    lines.push(`Vence: ${day}/${mo}`);
  } else {
    lines.push("");
    lines.push(`Sin resumen registrado para ${monthName} ${year}.`);
  }

  return lines.join("\n");
}

/**
 * Builds the card creation confirmation text.
 *
 * @param {object} params
 * @param {string} params.digits
 * @param {string} params.bank
 * @param {string} params.processor
 * @param {string} params.expiry - Raw "MM/AA" string
 * @return {string}
 */
export function buildCardConfirmText({
  digits,
  bank,
  processor,
  expiry,
}: {
  digits: string;
  bank: string;
  processor: string;
  expiry: string;
}): string {
  return (
    "*Vas a agregar la siguiente tarjeta*\n\n" +
    `Últimos 4 dígitos: ${digits}\n` +
    `Banco: ${bank}\n` +
    `Procesador: ${processor}\n` +
    `Vencimiento: ${expiry}`
  );
}

/**
 * Builds the statement creation confirmation text.
 *
 * @param {object} params
 * @param {string} params.cardLabel - e.g. "Visa 5477 - Galicia"
 * @param {string} params.monthLabel - e.g. "Marzo 2026"
 * @param {number} params.amountARS
 * @param {number} params.amountUSD
 * @param {number} params.dueDay
 * @param {string} params.stmtMonth - YYYY-MM, used to derive DD/MM due date
 * @return {string}
 */
export function buildStmtConfirmText({
  cardLabel,
  monthLabel,
  amountARS,
  amountUSD,
  dueDay,
  stmtMonth,
}: {
  cardLabel: string;
  monthLabel: string;
  amountARS: number;
  amountUSD: number;
  dueDay: number;
  stmtMonth: string;
}): string {
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
