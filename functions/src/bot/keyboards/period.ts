import { Markup } from "telegraf";
import { buildTwoColumnRows } from "./pagination";
import { BuildYearSelectorKeyboardParams } from "../../types/period.types";

/**
 * Builds the year selector shown before a month list when history spans more than one year.
 * Years go in a 2-column grid in the order given (callers pass them newest first),
 * followed by the caller's action rows (if any) and the back button row.
 *
 * @param {BuildYearSelectorKeyboardParams} params - Years, callback prefix, action rows, and back button
 * @return {Markup.Markup} Inline keyboard markup; each year emits `${callbackPrefix}:${year}`
 */
export function buildYearSelectorKeyboard({
  years,
  callbackPrefix,
  backCallback,
  backLabel = "← Volver",
  actionRows = [],
}: BuildYearSelectorKeyboardParams) {
  const rows = buildTwoColumnRows({
    items: years,
    buttonLabel: (year) => year,
    buttonCallback: (year) => `${callbackPrefix}:${year}`,
  });

  rows.push(...actionRows);
  rows.push([Markup.button.callback(backLabel, backCallback)]);
  return Markup.inlineKeyboard(rows);
}
