import { Markup } from "telegraf";
import { formatARS } from "../../helpers/format";

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
 * Builds the confirmation text showing income amount and reason.
 *
 * @param {number} amount - The income amount
 * @param {string} reason - The income reason
 * @return {string} Formatted confirmation text
 */
export function buildIncomeConfirmText(
  amount: number,
  reason: string
): string {
  return `Registrar ingreso?\n${reason}  ${formatARS(amount)}`;
}
