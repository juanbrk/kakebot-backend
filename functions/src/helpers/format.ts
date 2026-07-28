import * as admin from "firebase-admin";

export const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre",
  "Diciembre",
];

/**
 * Returns the number of days in a given month, accounting for leap years.
 *
 * @param {string} yearMonth - Month string in "YYYY-MM" format
 * @return {number} Days in that month (28-31)
 */
export function getDaysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split("-");
  return new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();
}

export function formatARS(amount: number): string {
  return "$ " + amount.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Returns a Firestore Timestamp for the last day of a given month at 20:00 UTC
 * (17:00 ART). Used for backdating expenses and incomes to closed past months.
 *
 * @param {string} yearMonth - Month in "YYYY-MM" format
 * @return {FirebaseFirestore.Timestamp} Backdated timestamp
 */
export function buildBackdatedTimestamp(yearMonth: string): FirebaseFirestore.Timestamp {
  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = getDaysInMonth(yearMonth);
  const date = new Date(Date.UTC(year, month - 1, lastDay, 20, 0, 0));
  return admin.firestore.Timestamp.fromDate(date);
}

/**
 * Builds a due-date Date anchored at 12:00 UTC (noon) of the given calendar day.
 * Noon UTC guarantees the day survives a round-trip through local Date getters
 * (getDate/getMonth/getFullYear) in both the production process (UTC, Cloud
 * Functions) and the local emulator process (ART, UTC-3): the offset margin to
 * either UTC day boundary is at least 9 hours, well above any real timezone
 * offset this app will ever run under. This differs intentionally from
 * buildBackdatedTimestamp's 20:00 UTC anchor, which serves a different purpose
 * (end-of-month backdating, not a specific due day).
 *
 * @param {number} year - Full year, e.g. 2026
 * @param {number} month - Calendar month, 1-indexed (1 = January, 12 = December)
 * @param {number} day - Day of month, 1-indexed
 * @return {Date} Date instance anchored at 12:00:00 UTC of the given day
 */
export function buildDueDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

/**
 * Returns a human-readable month label from a YYYY-MM string.
 *
 * @param {string} dueMonth - Month in "YYYY-MM" format
 * @param {boolean} monthNameOnly - If true, returns only the month name (e.g. "Abril");
 *   otherwise appends the year (e.g. "Abril2026")
 * @return {string} Formatted month label
 */
export function getMonthLabel(dueMonth: string, monthNameOnly = false): string {
  const [year, month] = dueMonth.split("-");
  const monthIndex = parseInt(month, 10) - 1;
  const monthName = MONTH_NAMES[monthIndex];
  return monthNameOnly ? monthName : `${monthName}${year}`;
}

/**
 * Formats a Firestore Timestamp as a "DD/MM" day-month string.
 *
 * @param {admin.firestore.Timestamp} dueDate - Due date timestamp
 * @return {string} Formatted string, e.g. "20/04"
 */
export function formatDueDateDayMonth(dueDate: admin.firestore.Timestamp): string {
  const date = dueDate.toDate();
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

/**
 * Builds a bullet list of entity names, used as the body of a section submenu
 * message so the user can tell at a glance which entities already exist.
 *
 * @param {string[]} names - Entity names, in the order they should be displayed
 * @return {string} One "• name" line per entry, newline-separated
 */
export function buildNameListText(names: string[]): string {
  return names.map((name) => `• ${name}`).join("\n");
}

/**
 * Formats a number as USD currency string using Argentine locale conventions.
 *
 * @param {number} amount - Dollar amount to format
 * @return {string} Formatted string, e.g. "U$S 49,47"
 */
export function formatUSD(amount: number): string {
  return "U$S " + amount.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
