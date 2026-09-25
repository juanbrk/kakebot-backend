import { Markup } from "telegraf";
import { BuildPaginatedKeyboardRowsParams } from "../../types/period.types";

/**
 * Builds the 2-column item grid plus pagination nav row shared by every paginated
 * keyboard. Callers append any trailing action/back-button rows themselves.
 *
 * @param {BuildPaginatedKeyboardRowsParams} params - Items, page, page size, and label/callback builders
 * @return {Array} Keyboard rows, ready for Markup.inlineKeyboard (optionally with more rows appended)
 */
export function buildPaginatedKeyboardRows<T>({
  items,
  page,
  perPage,
  buttonLabel,
  buttonCallback,
  navCallback,
}: BuildPaginatedKeyboardRowsParams<T>) {
  const start = page * perPage;
  const end = start + perPage;
  const pageItems = items.slice(start, end);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[][] = [];

  for (let i = 0; i < pageItems.length; i += 2) {
    const row = [Markup.button.callback(buttonLabel(pageItems[i]), buttonCallback(pageItems[i]))];
    if (i + 1 < pageItems.length) {
      row.push(Markup.button.callback(buttonLabel(pageItems[i + 1]), buttonCallback(pageItems[i + 1])));
    }
    rows.push(row);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navRow: any[] = [];
  if (page > 0) {
    navRow.push(Markup.button.callback("← Anterior", navCallback(page - 1)));
  }
  if (end < items.length) {
    navRow.push(Markup.button.callback("Más →", navCallback(page + 1)));
  }
  if (navRow.length > 0) {
    rows.push(navRow);
  }

  return rows;
}
