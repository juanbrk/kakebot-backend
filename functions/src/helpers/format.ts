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
