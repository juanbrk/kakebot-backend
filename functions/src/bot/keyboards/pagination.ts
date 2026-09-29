import { Markup } from "telegraf";
import { InlineKeyboardButton } from "telegraf/types";
import { BuildPaginatedKeyboardRowsParams, BuildTwoColumnRowsParams } from "../../types/pagination.types";

/**
 * Lays items out in a 2-column button grid, in the order given. The last row holds a single
 * button when the item count is odd.
 *
 * @param {BuildTwoColumnRowsParams} params - Items and their label/callback builders
 * @return {Array} Grid rows, ready to be combined with other rows
 */
export function buildTwoColumnRows<T>({
  items,
  buttonLabel,
  buttonCallback,
}: BuildTwoColumnRowsParams<T>): InlineKeyboardButton[][] {
  const rows: InlineKeyboardButton[][] = [];

  for (let i = 0; i < items.length; i += 2) {
    const row: InlineKeyboardButton[] = [Markup.button.callback(buttonLabel(items[i]), buttonCallback(items[i]))];
    if (i + 1 < items.length) {
      row.push(Markup.button.callback(buttonLabel(items[i + 1]), buttonCallback(items[i + 1])));
    }
    rows.push(row);
  }

  return rows;
}

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
}: BuildPaginatedKeyboardRowsParams<T>): InlineKeyboardButton[][] {
  const start = page * perPage;
  const end = start + perPage;
  const rows = buildTwoColumnRows({ items: items.slice(start, end), buttonLabel, buttonCallback });

  const navRow: InlineKeyboardButton[] = [];
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
