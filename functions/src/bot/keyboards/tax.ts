import { Markup } from "telegraf";
import { Tax, TaxInstallment, BuildTaxInstallmentDetailKeyboardParams, BuildTaxActionKeyboardParams } from "../../types/tax.types";
import { formatARS, formatDueDateDayMonth, MONTH_NAMES } from "../../helpers/format";

const TAXES_PER_PAGE = 6;

/**
 * Builds the taxes section submenu keyboard.
 *
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildTaxesSubmenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Registrar impuesto", "tax_add")],
    [Markup.button.callback("Mis impuestos", "menu_mis_impuestos")],
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
 * Builds the "Mis impuestos" submenu keyboard.
 *
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildTaxMisImpuestosKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Seleccionar impuesto", "tax_view")],
    [Markup.button.callback("Listar impuestos", "tax_list")],
    [Markup.button.callback("\u2190 Volver a impuestos", "menu_impuestos")],
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
  const start = page * TAXES_PER_PAGE;
  const end = start + TAXES_PER_PAGE;
  const pageTaxes = taxes.slice(start, end);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];

  for (let i = 0; i < pageTaxes.length; i += 2) {
    const row = [];
    const tax1 = pageTaxes[i];
    row.push(Markup.button.callback(tax1.name, `${callbackPrefix}:${tax1.id}`));
    if (i + 1 < pageTaxes.length) {
      const tax2 = pageTaxes[i + 1];
      row.push(
        Markup.button.callback(tax2.name, `${callbackPrefix}:${tax2.id}`),
      );
    }
    rows.push(row);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navRow: any[] = [];
  if (page > 0) {
    navRow.push(
      Markup.button.callback("← Página anterior", `tax_pg:${page - 1}`),
    );
  }
  if (end < taxes.length) {
    navRow.push(
      Markup.button.callback("Página siguiente →", `tax_pg:${page + 1}`),
    );
  }
  if (navRow.length > 0) {
    rows.push(navRow);
  }

  rows.push([
    Markup.button.callback("\u2190 Volver a impuestos", "menu_impuestos"),
  ]);

  return Markup.inlineKeyboard(rows);
}

/**
 * Builds the action keyboard for a selected tax.
 *
 * @param {BuildTaxActionKeyboardParams} params - taxId and optional paymentMethod
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildTaxActionKeyboard({
  taxId,
}: BuildTaxActionKeyboardParams) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Nueva cuota", `tax_reg:${taxId}`),
      Markup.button.callback("Modificar", `tax_edit_pm:${taxId}`),
    ],
    [Markup.button.callback("Historial de cuotas", `tax_hist:${taxId}`)],
    [Markup.button.callback("\u2190 Volver a impuestos", "tax_view")],
  ]);
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
 * Builds a month selector keyboard for registering a new tax installment.
 * Shows current month and the next 2 months.
 *
 * @param {string} taxId - Tax document ID used in callback data
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildTaxMonthKeyboard(taxId: string) {
  const now = new Date();
  const months = [];

  for (let i = 0; i < 3; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const dueMonth = `${year}-${month}`;
    const label = `${MONTH_NAMES[date.getMonth()]} ${year}`;
    months.push([
      Markup.button.callback(label, `tax_month:${taxId}:${dueMonth}`),
    ]);
  }

  months.push([
    Markup.button.callback("\u2190 Volver a impuestos", "tax_view"),
  ]);

  return Markup.inlineKeyboard(months);
}

/**
 * Builds a month selector keyboard showing only months without an existing installment.
 *
 * @param {string[]} availableMonths - Months in "YYYY-MM" format with no existing installment
 * @param {string} taxId - Tax document ID used in callback data
 * @param {boolean} showBackButton - Whether to include a "Volver a impuestos" back button
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildFilteredTaxMonthKeyboard(
  availableMonths: string[],
  taxId: string,
) {
  const rows = availableMonths.map((dueMonth) => {
    const [year, month] = dueMonth.split("-");
    const label = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
    return [Markup.button.callback(label, `tax_month:${taxId}:${dueMonth}`)];
  });

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
 * Builds a paginated 2-column keyboard listing all installments for a tax (history view).
 *
 * @param {TaxInstallment[]} installments - Full list of installments (all pages), sorted ascending (oldest first)
 * @param {number} page - Zero-based page index
 * @param {string} taxId - Tax document ID used in pagination callbacks
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildTaxInstallmentHistoryKeyboard(
  installments: TaxInstallment[],
  page: number,
  taxId: string,
) {
  const start = page * TAX_INSTALLMENTS_PER_PAGE;
  const end = start + TAX_INSTALLMENTS_PER_PAGE;
  const pageInstallments = installments.slice(start, end);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];

  for (let i = 0; i < pageInstallments.length; i += 2) {
    const row = [];
    const inst1 = pageInstallments[i];
    const [y1, m1] = inst1.dueMonth.split("-");
    const label1 = `${MONTH_NAMES[parseInt(m1, 10) - 1]} ${y1}`;
    row.push(Markup.button.callback(label1, `tax_inst:${inst1.id}`));
    if (i + 1 < pageInstallments.length) {
      const inst2 = pageInstallments[i + 1];
      const [y2, m2] = inst2.dueMonth.split("-");
      const label2 = `${MONTH_NAMES[parseInt(m2, 10) - 1]} ${y2}`;
      row.push(Markup.button.callback(label2, `tax_inst:${inst2.id}`));
    }
    rows.push(row);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navRow: any[] = [];
  if (page > 0) {
    navRow.push(
      Markup.button.callback("← Página anterior", `tax_hist_pg:${taxId}:${page - 1}`),
    );
  }
  if (end < installments.length) {
    navRow.push(
      Markup.button.callback("Página siguiente →", `tax_hist_pg:${taxId}:${page + 1}`),
    );
  }
  if (navRow.length > 0) {
    rows.push(navRow);
  }

  rows.push([Markup.button.callback("\u2190 Volver al impuesto", `tax_back_tax:${taxId}`)]);

  return Markup.inlineKeyboard(rows);
}

/**
 * Builds the action keyboard for a single installment in the history view.
 * Shows conditional buttons based on payment and receipt status.
 *
 * @return {Markup.Markup} Inline keyboard markup
 */
export function buildTaxInstallmentDetailKeyboard({
  installmentId,
  isPaid,
  hasReceipt,
  taxId,
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
    rows.push([Markup.button.callback("Descargar comprobante", `tax_dl_rec:${installmentId}`)]);
  }
  rows.push([Markup.button.callback("Cambiar vencimiento", `tax_edit_due:${installmentId}`)]);

  rows.push([Markup.button.callback("\u2190 Volver al historial", `tax_back_hist:${taxId}`)]);

  return Markup.inlineKeyboard(rows);
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
    ? "*Estado*: ✅ Pagado"
    : "*Estado*: Pendiente";

  return (
    `*Cuota: ${installment.taxName}*\n\n`
    + `*Monto*: ${formatARS(installment.amount)}\n`
    + `*Vencimiento*: ${formatDueDateDayMonth(installment.dueDate)}\n`
    + statusLine
  );
}
