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
