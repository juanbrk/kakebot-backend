import { Markup } from "telegraf";
import { formatIncomeAmount } from "../../helpers/format";
import { IncomeCurrency } from "../../types/income.types";

/**
 * Builds the confirmation keyboard for a new income.
 *
 * @return {object} Telegraf inline keyboard markup
 */
export function buildIncomeConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Cancelar", "inc_cancel"),
      Markup.button.callback("Confirmar", "inc_confirm"),
    ],
  ]);
}

/**
 * Builds the currency selection keyboard for a new income.
 * Shown inside the scene, so it carries no back row — the only exit is typing "cancelar".
 *
 * @return {object} Telegraf inline keyboard markup
 */
export function buildIncomeCurrencyKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Pesos", "inc_currency:ars"),
      Markup.button.callback("Dólares", "inc_currency:usd"),
    ],
  ]);
}

/**
 * Builds the confirmation text showing income amount and reason.
 *
 * @param {number} amount - The income amount
 * @param {string} reason - The income reason
 * @param {IncomeCurrency} currency - Currency the income was received in
 * @return {string} Formatted confirmation text
 */
export function buildIncomeConfirmText(
  amount: number,
  reason: string,
  currency: IncomeCurrency
): string {
  return `Registrar ingreso?\n${reason}  ${formatIncomeAmount(amount, currency)}`;
}
