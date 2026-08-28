import { Markup } from "telegraf";
import { formatARS, formatUSD } from "../../helpers/format";

/**
 * Builds the confirmation keyboard for a new USD sale.
 * Shown inside the scene, so it carries no back row — the only exit is typing "cancelar".
 *
 * @return {object} Telegraf inline keyboard markup
 */
export function buildUsdSaleConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Cancelar", "sale_cancel"),
      Markup.button.callback("Confirmar", "sale_confirm"),
    ],
  ]);
}

/**
 * Builds the confirmation text showing the full sale calculation.
 *
 * @param {number} amountUSD - Dollar amount being sold
 * @param {number} exchangeRate - Exchange rate the sale was made at
 * @return {string} Formatted confirmation text
 */
export function buildUsdSaleConfirmText(amountUSD: number, exchangeRate: number): string {
  const amountARS = amountUSD * exchangeRate;
  return "*Registrar venta de dólares?*\n"
    + `${formatUSD(amountUSD)} × ${formatARS(exchangeRate)} = ${formatARS(amountARS)}`;
}
