import { Markup } from "telegraf";
import {
  Tax,
  TaxInstallment,
  BuildTaxInstallmentDetailKeyboardParams,
  BuildTaxInstallmentHistoryKeyboardParams,
  BuildTaxActionKeyboardParams,
} from "../../types/tax.types";
import { escapeHtml, formatARS, formatDueDateDayMonth, getMonthLabel } from "../../helpers/format";
import { buildBreadcrumb } from "../../helpers/breadcrumb";
import { getYear } from "../../helpers/period";
import { buildPaginatedKeyboardRows } from "./pagination";

const TAXES_PER_PAGE = 6;

/**
 * Builds the taxes section submenu keyboard.
 *
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildTaxesSubmenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Registrar impuesto", "tax_add")],
    [Markup.button.callback("Seleccionar impuesto", "tax_view")],
    [Markup.button.callback("\u2190 Volver al menú", "menu_back")],
  ]);
}

/**
 * Builds the taxes section submenu keyboard for the empty state
 * (user has no taxes registered): omits the "Mis impuestos" option.
 *
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildTaxesEmptyStateKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Registrar impuesto", "tax_add")],
    [Markup.button.callback("← Volver al menú", "menu_back")],
  ]);
}

/**
 * Builds a paginated 2-column keyboard for selecting a tax from the user's list.
 *
 * @param {Tax[]} taxes - Full list of taxes (all pages)
 * @param {number} page - Zero-based page index
 * @param {string} callbackPrefix - Callback prefix used for each tax button (e.g. "tax_pick")
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildTaxListKeyboard(
  taxes: Tax[],
  page: number,
  callbackPrefix: string,
) {
  const rows = buildPaginatedKeyboardRows({
    items: taxes,
    page,
    perPage: TAXES_PER_PAGE,
    buttonLabel: (tax) => tax.name,
    buttonCallback: (tax) => `${callbackPrefix}:${tax.id}`,
    navCallback: (navPage) => `tax_pg:${navPage}`,
  });

  rows.push([
    Markup.button.callback("\u2190 Volver a impuestos", "menu_impuestos"),
  ]);

  return Markup.inlineKeyboard(rows);
}

/**
 * Builds the action keyboard for a selected tax.
 * When payableInstallmentId is present, prepends a "Marcar como pagado" row.
 *
 * @param {BuildTaxActionKeyboardParams} params - taxId, optional paymentMethod, optional payableInstallmentId
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildTaxActionKeyboard({
  taxId,
  payableInstallmentId,
}: BuildTaxActionKeyboardParams) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[][] = [];
  if (payableInstallmentId) {
    rows.push([Markup.button.callback("Marcar como pagado", `tax_pay:${payableInstallmentId}`)]);
  }
  rows.push([
    Markup.button.callback("Nueva cuota", `tax_reg:${taxId}`),
    Markup.button.callback("Modificar", `tax_edit_pm:${taxId}`),
  ]);
  rows.push([Markup.button.callback("Historial de cuotas", `tax_hist:${taxId}`)]);
  rows.push([Markup.button.callback("\u2190 Volver a impuestos", "tax_view")]);
  return Markup.inlineKeyboard(rows);
}

/**
 * Builds the edit options keyboard for a selected tax.
 * Provides navigation to specific edit actions.
 *
 * @param {string} taxId - Tax document ID
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildTaxEditOptionsKeyboard(taxId: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Cambiar método de pago", `tax_chg_pm:${taxId}`)],
    [Markup.button.callback("\u2190 Volver a detalles de impuesto", `tax_back_tax:${taxId}`)],
  ]);
}

/**
 * Builds a month selector keyboard showing only months without an existing installment.
 *
 * @param {string[]} availableMonths - Months in "YYYY-MM" format with no existing installment
 * @param {string} taxId - Tax document ID used in callback data
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildFilteredTaxMonthKeyboard(
  availableMonths: string[],
  taxId: string,
) {
  const rows = availableMonths.map((dueMonth) =>
    [Markup.button.callback(getMonthLabel(dueMonth), `tax_month:${taxId}:${dueMonth}`)]);

  return Markup.inlineKeyboard(rows);
}

/**
 * Builds the prompt keyboard asking whether to mark a new installment as paid.
 *
 * @param {string} installmentId - Tax installment document ID
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildTaxPaidPromptKeyboard(installmentId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("No", `tax_paid_no:${installmentId}`),
      Markup.button.callback("Si", `tax_paid_yes:${installmentId}`),
    ],
  ]);
}

/**
 * Builds the post-payment prompt keyboard asking whether to attach a receipt.
 *
 * @param {string} installmentId - Tax installment document ID
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildTaxReceiptPromptKeyboard(installmentId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Omitir", "tax_skip_receipt"),
      Markup.button.callback("Adjuntar", `tax_attach:${installmentId}`),
    ],
  ]);
}

const TAX_INSTALLMENTS_PER_PAGE = 6;

/**
 * Keyboard shown when a tax has no installments yet: register one, or go back to the tax.
 *
 * @param {string} taxId - Tax document ID
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildTaxHistoryEmptyStateKeyboard(taxId: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Nueva cuota", `tax_reg:${taxId}`)],
    [Markup.button.callback("\u2190 Volver al impuesto", `tax_back_tax:${taxId}`)],
  ]);
}

/**
 * Builds the paginated installment list of one year in Impuestos → Historial.
 * Buttons show only the month name (plus ✅ when paid) — the year lives in the breadcrumb.
 * No "Nueva cuota": new installments only go to upcoming months, so it makes no sense from the
 * history — it lives on the tax view (and on the history's empty state).
 *
 * @param {BuildTaxInstallmentHistoryKeyboardParams} params - Installments of the year (newest first),
 *   year, page, tax ID, and back button
 * @return {Markup.Markup} Inline keyboard markup; each installment emits `tax_inst:{id}`
 */
export function buildTaxInstallmentHistoryKeyboard({
  installments,
  year,
  page,
  taxId,
  backCallback,
  backLabel,
}: BuildTaxInstallmentHistoryKeyboardParams) {
  const rows = buildPaginatedKeyboardRows({
    items: installments,
    page,
    perPage: TAX_INSTALLMENTS_PER_PAGE,
    buttonLabel: (installment) => {
      const monthName = getMonthLabel(installment.dueMonth, true);
      return installment.isPaid ? `${monthName} ✅` : monthName;
    },
    buttonCallback: (installment) => `tax_inst:${installment.id}`,
    navCallback: (navPage) => `tax_hist_pg:${taxId}:${year}:${navPage}`,
  });
  rows.push([Markup.button.callback(backLabel, backCallback)]);
  return Markup.inlineKeyboard(rows);
}

/**
 * Builds the action keyboard for a single installment in the history view.
 * Shows conditional buttons based on payment and receipt status.
 * Back returns to the month list of the installment's own year.
 *
 * @param {BuildTaxInstallmentDetailKeyboardParams} params - Installment ID, paid/receipt flags, tax ID, due month
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildTaxInstallmentDetailKeyboard({
  installmentId,
  isPaid,
  hasReceipt,
  taxId,
  dueMonth,
}: BuildTaxInstallmentDetailKeyboardParams) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[][] = [];

  if (!isPaid) {
    rows.push([Markup.button.callback("Marcar como pagado", `tax_pay:${installmentId}`)]);
  }
  if (isPaid && !hasReceipt) {
    rows.push([Markup.button.callback("Adjuntar comprobante", `tax_attach:${installmentId}`)]);
  }
  if (isPaid && hasReceipt) {
    rows.push([
      Markup.button.callback("Descargar comprobante", `tax_dl_rec:${installmentId}`),
      Markup.button.callback("Modificar comprobante", `tax_replace_rec:${installmentId}`),
    ]);
  }
  if (isPaid) {
    rows.push([Markup.button.callback("Marcar como no pagada", `tax_unpay:${installmentId}`)]);
  }
  rows.push([Markup.button.callback("Cambiar vencimiento", `tax_edit_due:${installmentId}`)]);

  rows.push([Markup.button.callback("\u2190 Volver al historial", `tax_hist_y:${taxId}:${getYear(dueMonth)}`)]);

  return Markup.inlineKeyboard(rows);
}

/**
 * Builds the tax selector shown by the tax-receipt scene, listing only taxes that have
 * at least one unpaid installment.
 *
 * Deliberately not `buildTaxListKeyboard`: that one emits `tax_pick:` callbacks handled by the
 * global tax handler and appends a "Volver a impuestos" row, both of which would pull the user
 * out of the scene mid-flow. Inside the scene the only exit is typing "cancelar".
 *
 * @param {Tax[]} taxes - Taxes with pending installments (all pages)
 * @param {number} page - Zero-based page index
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildTaxReceiptTaxPickerKeyboard(taxes: Tax[], page: number) {
  const rows = buildPaginatedKeyboardRows({
    items: taxes,
    page,
    perPage: TAXES_PER_PAGE,
    buttonLabel: (tax) => tax.name,
    buttonCallback: (tax) => `taxr_pick:${tax.id}`,
    navCallback: (navPage) => `taxr_pg:${navPage}`,
  });

  return Markup.inlineKeyboard(rows);
}

/**
 * Builds the installment selector shown by the tax-receipt scene, listing the unpaid
 * installments of the chosen tax in ascending chronological order.
 *
 * @param {TaxInstallment[]} installments - Unpaid installments of one tax, sorted ascending by dueMonth
 * @param {number} page - Zero-based page index
 * @param {string} taxId - Tax document ID, embedded in the pagination callbacks
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildTaxReceiptInstallmentPickerKeyboard(
  installments: TaxInstallment[],
  page: number,
  taxId: string,
) {
  const rows = buildPaginatedKeyboardRows({
    items: installments,
    page,
    perPage: TAX_INSTALLMENTS_PER_PAGE,
    buttonLabel: (installment) => getMonthLabel(installment.dueMonth),
    buttonCallback: (installment) => `taxr_inst:${installment.id}`,
    navCallback: (navPage) => `taxr_inst_pg:${taxId}:${navPage}`,
  });

  return Markup.inlineKeyboard(rows);
}

/**
 * Builds the keyboard prompting what to do with the receipt after unmarking an installment.
 *
 * @param {string} installmentId - Installment document ID
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildUnpayReceiptDecisionKeyboard(installmentId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Borrar", `tax_unpay_del:${installmentId}`),
      Markup.button.callback("Conservar", `tax_unpay_keep:${installmentId}`),
    ],
  ]);
}

/**
 * Returns formatted detail text for a tax installment.
 *
 * @param {TaxInstallment} installment - The installment to display
 * @return {string} Markdown-formatted detail string
 */
export function buildTaxInstallmentDetailText(
  installment: TaxInstallment,
): string {
  const statusLine = installment.isPaid
    ? "<b>Estado</b>: ✅ Pagado"
    : "<b>Estado</b>: Pendiente";

  return (
    `<b>Cuota: ${escapeHtml(installment.taxName)}</b>\n\n`
    + `<b>Monto</b>: ${formatARS(installment.amount)}\n`
    + `<b>Vencimiento</b>: ${formatDueDateDayMonth(installment.dueDate)}\n`
    + statusLine
  );
}

/**
 * Builds the full detail-screen payload (breadcrumb + text + keyboard) for a single
 * tax installment. For callers that need to send it as a brand-new message — e.g.
 * after an unrelated edit has already consumed the "edit slot" of the triggering
 * message — rather than through replyOrEdit/editOrReply.
 *
 * @param {TaxInstallment} installment - The installment to display
 * @return {{ text: string, extra: Record<string, unknown> }} Message text and extra params
 */
export function buildTaxInstallmentDetailPayload(
  installment: TaxInstallment,
): { text: string; extra: Record<string, unknown> } {
  const installmentId = installment.id ?? "";
  const monthLabel = getMonthLabel(installment.dueMonth);

  const text =
    buildBreadcrumb(["Impuestos", installment.taxName, "Historial", monthLabel])
    + buildTaxInstallmentDetailText(installment);
  const keyboard = buildTaxInstallmentDetailKeyboard({
    installmentId,
    isPaid: installment.isPaid,
    hasReceipt: !!installment.receiptUrl,
    taxId: installment.taxId,
    dueMonth: installment.dueMonth,
  });

  return {
    text,
    extra: {
      parse_mode: "HTML",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: keyboard.reply_markup as any,
    },
  };
}
