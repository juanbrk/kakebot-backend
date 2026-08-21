import { ServiceInstallment } from "../types/service.types";
import { StatusReportEntry } from "../types/report.types";
import { getServicesByUser, getInstallmentsForMonth } from "./service.service";
import { getCurrentMonth } from "../helpers/format";
import { buildStatusReportText } from "../helpers/status-report";

/**
 * Generates the service status report: all of a user's services grouped by
 * their current month's installment status (Vencidos / Próximos a vencer /
 * Pagados / Pendientes / Sin cuota). Empty sections are omitted.
 *
 * @param {string} telegramUserId - The user's Telegram ID
 * @return {Promise<string | null>} Formatted Markdown text, or null if user has no services
 */
export async function generateServiceStatusReport(telegramUserId: string): Promise<string | null> {
  const currentMonth = getCurrentMonth();

  const [services, installments] = await Promise.all([
    getServicesByUser(telegramUserId),
    getInstallmentsForMonth(telegramUserId, currentMonth),
  ]);

  const installmentByServiceId = new Map<string, ServiceInstallment>(
    installments.map((installment) => [installment.serviceId, installment])
  );

  const entries: StatusReportEntry[] = services.map((service) => ({
    name: service.name,
    installment: installmentByServiceId.get(service.id!) ?? null,
  }));

  return buildStatusReportText({ title: "Estado de Servicios", entries });
}
