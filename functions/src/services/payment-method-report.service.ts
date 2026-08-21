import { Service, ServiceInstallment, ServicePaymentMethod } from "../types/service.types";
import { getServicesByUser, getInstallmentsForMonth } from "./service.service";
import { formatARS, formatDueDateDayMonth, getCurrentMonth } from "../helpers/format";

const SECTION_LABEL: Record<ServicePaymentMethod, string> = {
  credit_card: "Tarjeta de Crédito",
  auto_debit: "Débito Automático",
  manual: "Pago Manual",
};

interface ServiceWithInstallment {
  service: Service;
  currentInstallment: ServiceInstallment | null;
}

/**
 * Formats a single service line for the payment methods report.
 * Shows current month's installment amount and due date if available, otherwise "$ -".
 *
 * @param {ServiceWithInstallment} item - Service and its current month installment
 * @return {string} Formatted line: "• Name  $ X.XXX,XX (dd/mm)" or "• Name  $ -"
 */
function formatServiceLine({ service, currentInstallment }: ServiceWithInstallment): string {
  if (!currentInstallment) {
    return `  • ${service.name}  $ -`;
  }
  const amountStr = formatARS(currentInstallment.amount);
  const dateStr = formatDueDateDayMonth(currentInstallment.dueDate);
  return `  • ${service.name}  ${amountStr} (${dateStr})`;
}

/**
 * Orders services within a section: those with a current installment first,
 * ascending by due date; services without an installment go last.
 *
 * @param {ServiceWithInstallment[]} items - Services in a single section
 * @return {ServiceWithInstallment[]} New array sorted by ascending due date, null-installment last
 */
function sortByDueDateAscending(items: ServiceWithInstallment[]): ServiceWithInstallment[] {
  return [...items].sort((a, b) => {
    if (!a.currentInstallment && !b.currentInstallment) return 0;
    if (!a.currentInstallment) return 1;
    if (!b.currentInstallment) return -1;
    return a.currentInstallment.dueDate.toMillis() - b.currentInstallment.dueDate.toMillis();
  });
}

/**
 * Builds a report section for a given list of services.
 * Returns an empty string if the list is empty (section is omitted).
 *
 * @param {string} label - Section header label
 * @param {ServiceWithInstallment[]} items - Services in this section
 * @return {string} Formatted section text or empty string
 */
function buildSection(label: string, items: ServiceWithInstallment[]): string {
  if (items.length === 0) {
    return "";
  }
  const lines = sortByDueDateAscending(items).map(formatServiceLine).join("\n");
  return `*${label}*\n${lines}`;
}

/**
 * Generates the payment methods report for a user's services.
 * Groups services by paymentMethod and shows the current month's installment amount and due date.
 * Sections with no services are omitted. Services without a paymentMethod appear
 * under "Sin método asignado".
 *
 * @param {string} telegramUserId - The user's Telegram ID
 * @return {Promise<string | null>} Formatted Markdown text, or null if user has no services
 */
export async function generatePaymentMethodReport(telegramUserId: string): Promise<string | null> {
  const currentMonth = getCurrentMonth();

  const [services, installments] = await Promise.all([
    getServicesByUser(telegramUserId),
    getInstallmentsForMonth(telegramUserId, currentMonth),
  ]);

  if (services.length === 0) {
    return null;
  }

  const installmentByServiceId = new Map<string, ServiceInstallment>(
    installments.map((inst) => [inst.serviceId, inst])
  );

  const items: ServiceWithInstallment[] = services.map((svc) => ({
    service: svc,
    currentInstallment: installmentByServiceId.get(svc.id!) ?? null,
  }));

  const byCreditCard: ServiceWithInstallment[] = [];
  const byAutoDebit: ServiceWithInstallment[] = [];
  const byManual: ServiceWithInstallment[] = [];
  const byNone: ServiceWithInstallment[] = [];

  for (const item of items) {
    switch (item.service.paymentMethod) {
    case "credit_card":
      byCreditCard.push(item);
      break;
    case "auto_debit":
      byAutoDebit.push(item);
      break;
    case "manual":
      byManual.push(item);
      break;
    default:
      byNone.push(item);
    }
  }

  const sections = [
    buildSection(SECTION_LABEL.credit_card, byCreditCard),
    buildSection(SECTION_LABEL.auto_debit, byAutoDebit),
    buildSection(SECTION_LABEL.manual, byManual),
    buildSection("Sin método asignado", byNone),
  ].filter((s) => s.length > 0);

  if (sections.length === 0) {
    return null;
  }

  return `*Métodos de Pago — Servicios*\n\n${sections.join("\n\n")}`;
}
