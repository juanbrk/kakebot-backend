import { Markup } from "telegraf";
import { getMonthLabel } from "../../helpers/format";
import { BuildReportMonthListKeyboardParams } from "../../types/report.types";
import { buildPaginatedKeyboardRows } from "./pagination";

const REPORT_MONTHS_PER_PAGE = 6;

/**
 * Builds the paginated month list of one year in Reportes → Balances → Anteriores.
 * Buttons show only the month name — the year lives in the breadcrumb.
 *
 * @param {BuildReportMonthListKeyboardParams} params - Months of the year (newest first), year, page, back callback
 * @return {Markup.Markup} Inline keyboard markup; each month emits `rep_month:YYYY-MM`
 */
export function buildReportMonthListKeyboard({
  yearMonths,
  year,
  page,
  backCallback,
}: BuildReportMonthListKeyboardParams) {
  const rows = buildPaginatedKeyboardRows({
    items: yearMonths,
    page,
    perPage: REPORT_MONTHS_PER_PAGE,
    buttonLabel: (yearMonth) => getMonthLabel(yearMonth, true),
    buttonCallback: (yearMonth) => `rep_month:${yearMonth}`,
    navCallback: (navPage) => `rep_year_pg:${year}:${navPage}`,
  });
  rows.push([Markup.button.callback("← Volver", backCallback)]);
  return Markup.inlineKeyboard(rows);
}
