import { Service, ServiceInstallment } from "../types/service.types";
import { getServicesByUser, getInstallmentsForMonth } from "./service.service";
import { formatARS } from "../helpers/format";

const UPCOMING_DAYS = 7;

interface ServiceWithInstallment {
  service: Service;
  currentInstallment: ServiceInstallment | null;
}

interface BuildSectionParams {
  label: string;
  items: ServiceWithInstallment[];
  formatLine: (item: ServiceWithInstallment) => string;
  sortByDueDate: boolean;
}

/**
 * Returns the current month in "YYYY-MM" format.
 *
 * @return {string} Current year-month string
 */
function getCurrentMonth(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

/**
 * Formats a due date as "dd/mm".
 *
 * @param {FirebaseFirestore.Timestamp} dueDate - Firestore timestamp of the due date
 * @return {string} Formatted date string
 */
function formatDueDate(dueDate: FirebaseFirestore.Timestamp): string {
  const date = dueDate.toDate();
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

/**
 * Formats a line for a service whose current installment is already overdue.
 *
 * @param {ServiceWithInstallment} item - Service and its current month installment
 * @return {string} Formatted line, e.g. "• Name  $ X.XXX,XX (venció dd/mm)"
 */
function formatOverdueLine({ service, currentInstallment }: ServiceWithInstallment): string {
  const amountStr = formatARS(currentInstallment!.amount);
  const dateStr = formatDueDate(currentInstallment!.dueDate);
  return `• ${service.name}  ${amountStr} (venció ${dateStr})`;
}

/**
 * Formats a line for a service whose current installment is not yet due.
 *
 * @param {ServiceWithInstallment} item - Service and its current month installment
 * @return {string} Formatted line, e.g. "• Name  $ X.XXX,XX (vence dd/mm)"
 */
function formatUpcomingLine({ service, currentInstallment }: ServiceWithInstallment): string {
  const amountStr = formatARS(currentInstallment!.amount);
  const dateStr = formatDueDate(currentInstallment!.dueDate);
  return `• ${service.name}  ${amountStr} (vence ${dateStr})`;
}

/**
 * Formats a line for a service whose current installment is already paid.
 *
 * @param {ServiceWithInstallment} item - Service and its current month installment
 * @return {string} Formatted line, e.g. "• Name  $ X.XXX,XX ✅"
 */
function formatPaidLine({ service, currentInstallment }: ServiceWithInstallment): string {
  return `• ${service.name}  ${formatARS(currentInstallment!.amount)} ✅`;
}

/**
 * Formats a line for a service with no installment registered for the current month.
 *
 * @param {ServiceWithInstallment} item - Service and its current month installment
 * @return {string} Formatted line, e.g. "• Name  Sin cuota este mes"
 */
function formatNoInstallmentLine({ service }: ServiceWithInstallment): string {
  return `• ${service.name}  Sin cuota este mes`;
}

/**
 * Sorts entries ascending by their current installment's due date.
 *
 * @param {ServiceWithInstallment[]} items - Entries to sort, all with a non-null installment
 * @return {ServiceWithInstallment[]} New array sorted ascending by due date
 */
function sortByDueDateAscending(items: ServiceWithInstallment[]): ServiceWithInstallment[] {
  return [...items].sort(
    (a, b) => a.currentInstallment!.dueDate.toMillis() - b.currentInstallment!.dueDate.toMillis()
  );
}

/**
 * Builds a single report section. Returns an empty string if there are no items,
 * so the caller can filter it out. Entries without a current installment (e.g. the
 * "Sin cuota" section) have no due date to sort by, so sorting must stay opt-in.
 *
 * @param {BuildSectionParams} params - Section label, entries, line formatter, and sort flag
 * @return {string} Formatted section text or empty string
 */
function buildSection({ label, items, formatLine, sortByDueDate }: BuildSectionParams): string {
  if (items.length === 0) {
    return "";
  }
  const orderedItems = sortByDueDate ? sortByDueDateAscending(items) : items;
  const lines = orderedItems.map(formatLine).join("\n");
  return `*${label}*\n${lines}`;
}

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

  if (services.length === 0) {
    return null;
  }

  const installmentByServiceId = new Map<string, ServiceInstallment>(
    installments.map((installment) => [installment.serviceId, installment])
  );

  const today = new Date();
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  const upcomingThreshold = new Date(today);
  upcomingThreshold.setDate(upcomingThreshold.getDate() + UPCOMING_DAYS);
  upcomingThreshold.setHours(23, 59, 59, 999);

  const overdue: ServiceWithInstallment[] = [];
  const upcoming: ServiceWithInstallment[] = [];
  const paid: ServiceWithInstallment[] = [];
  const pending: ServiceWithInstallment[] = [];
  const withoutInstallment: ServiceWithInstallment[] = [];

  for (const service of services) {
    const currentInstallment = installmentByServiceId.get(service.id!) ?? null;
    const item: ServiceWithInstallment = { service, currentInstallment };

    if (!currentInstallment) {
      withoutInstallment.push(item);
    } else if (currentInstallment.isPaid) {
      paid.push(item);
    } else if (currentInstallment.dueDate.toDate() < todayStart) {
      overdue.push(item);
    } else if (currentInstallment.dueDate.toDate() <= upcomingThreshold) {
      upcoming.push(item);
    } else {
      pending.push(item);
    }
  }

  const sections = [
    buildSection({ label: "Vencidos", items: overdue, formatLine: formatOverdueLine, sortByDueDate: true }),
    buildSection({ label: "Próximos a vencer", items: upcoming, formatLine: formatUpcomingLine, sortByDueDate: true }),
    buildSection({ label: "Pagados", items: paid, formatLine: formatPaidLine, sortByDueDate: true }),
    buildSection({ label: "Pendientes", items: pending, formatLine: formatUpcomingLine, sortByDueDate: true }),
    buildSection({
      label: "Sin cuota",
      items: withoutInstallment,
      formatLine: formatNoInstallmentLine,
      sortByDueDate: false,
    }),
  ].filter((section) => section.length > 0);

  if (sections.length === 0) {
    return null;
  }

  return `*Estado de Servicios*\n\n${sections.join("\n\n")}`;
}
