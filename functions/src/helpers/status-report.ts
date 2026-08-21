import {
  BuildStatusReportTextParams,
  StatusReportEntry,
} from "../types/report.types";
import { formatARS, formatDueDateDayMonth } from "./format";

const UPCOMING_DAYS = 7;

interface BuildSectionParams {
  label: string;
  items: StatusReportEntry[];
  formatLine: (item: StatusReportEntry) => string;
  sortByDueDate: boolean;
}

/**
 * Formats a line for an entry whose installment is already overdue.
 *
 * @param {StatusReportEntry} item - Entry and its installment for the reported month
 * @return {string} Formatted line, e.g. "• Name  $ X.XXX,XX (venció dd/mm)"
 */
function formatOverdueLine({ name, installment }: StatusReportEntry): string {
  const amountStr = formatARS(installment!.amount);
  const dateStr = formatDueDateDayMonth(installment!.dueDate);
  return `• ${name}  ${amountStr} (venció ${dateStr})`;
}

/**
 * Formats a line for an entry whose installment is not yet due.
 *
 * @param {StatusReportEntry} item - Entry and its installment for the reported month
 * @return {string} Formatted line, e.g. "• Name  $ X.XXX,XX (vence dd/mm)"
 */
function formatUpcomingLine({ name, installment }: StatusReportEntry): string {
  const amountStr = formatARS(installment!.amount);
  const dateStr = formatDueDateDayMonth(installment!.dueDate);
  return `• ${name}  ${amountStr} (vence ${dateStr})`;
}

/**
 * Formats a line for an entry whose installment is already paid.
 *
 * @param {StatusReportEntry} item - Entry and its installment for the reported month
 * @return {string} Formatted line, e.g. "• Name  $ X.XXX,XX ✅"
 */
function formatPaidLine({ name, installment }: StatusReportEntry): string {
  return `• ${name}  ${formatARS(installment!.amount)} ✅`;
}

/**
 * Formats a line for an entry with no installment registered for the reported month.
 *
 * @param {StatusReportEntry} item - Entry with a null installment
 * @return {string} Formatted line, e.g. "• Name  Sin cuota este mes"
 */
function formatNoInstallmentLine({ name }: StatusReportEntry): string {
  return `• ${name}  Sin cuota este mes`;
}

/**
 * Sorts entries ascending by their installment's due date.
 *
 * @param {StatusReportEntry[]} items - Entries to sort, all with a non-null installment
 * @return {StatusReportEntry[]} New array sorted ascending by due date
 */
function sortByDueDateAscending(items: StatusReportEntry[]): StatusReportEntry[] {
  return [...items].sort(
    (a, b) => a.installment!.dueDate.toMillis() - b.installment!.dueDate.toMillis()
  );
}

/**
 * Builds a single report section. Returns an empty string if there are no items,
 * so the caller can filter it out. Entries without an installment (e.g. the
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
 * Builds a status report: named entries grouped by their installment status for
 * the reported month (Vencidos / Próximos a vencer / Pagados / Pendientes /
 * Sin cuota). Empty sections are omitted. Shared by the service and tax status
 * reports so both stay behaviourally identical.
 *
 * @param {BuildStatusReportTextParams} params - Report title and the entries to group
 * @return {string | null} Formatted Markdown text, or null if there is nothing to report
 */
export function buildStatusReportText({
  title,
  entries,
}: BuildStatusReportTextParams): string | null {
  if (entries.length === 0) {
    return null;
  }

  const today = new Date();
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  const upcomingThreshold = new Date(today);
  upcomingThreshold.setDate(upcomingThreshold.getDate() + UPCOMING_DAYS);
  upcomingThreshold.setHours(23, 59, 59, 999);

  const overdue: StatusReportEntry[] = [];
  const upcoming: StatusReportEntry[] = [];
  const paid: StatusReportEntry[] = [];
  const pending: StatusReportEntry[] = [];
  const withoutInstallment: StatusReportEntry[] = [];

  for (const entry of entries) {
    const { installment } = entry;

    if (!installment) {
      withoutInstallment.push(entry);
    } else if (installment.isPaid) {
      paid.push(entry);
    } else if (installment.dueDate.toDate() < todayStart) {
      overdue.push(entry);
    } else if (installment.dueDate.toDate() <= upcomingThreshold) {
      upcoming.push(entry);
    } else {
      pending.push(entry);
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

  return `*${title}*\n\n${sections.join("\n\n")}`;
}
