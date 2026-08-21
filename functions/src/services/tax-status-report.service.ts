import { TaxInstallment } from "../types/tax.types";
import { StatusReportEntry } from "../types/report.types";
import { getTaxesByUser, getTaxInstallmentsForMonth } from "./tax.service";
import { getCurrentMonth } from "../helpers/format";
import { buildStatusReportText } from "../helpers/status-report";

/**
 * Generates the tax status report: all of a user's taxes grouped by their
 * current month's installment status (Vencidos / Próximos a vencer / Pagados /
 * Pendientes / Sin cuota). Empty sections are omitted. Shares its grouping and
 * formatting with the service status report via buildStatusReportText.
 *
 * @param {string} telegramUserId - The user's Telegram ID
 * @return {Promise<string | null>} Formatted Markdown text, or null if user has no taxes
 */
export async function generateTaxStatusReport(telegramUserId: string): Promise<string | null> {
  const currentMonth = getCurrentMonth();

  const [taxes, installments] = await Promise.all([
    getTaxesByUser(telegramUserId),
    getTaxInstallmentsForMonth(telegramUserId, currentMonth),
  ]);

  const installmentByTaxId = new Map<string, TaxInstallment>(
    installments.map((installment) => [installment.taxId, installment])
  );

  const entries: StatusReportEntry[] = taxes.map((tax) => ({
    name: tax.name,
    installment: installmentByTaxId.get(tax.id!) ?? null,
  }));

  return buildStatusReportText({ title: "Estado de Impuestos", entries });
}
