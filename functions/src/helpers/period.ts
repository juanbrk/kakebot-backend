/**
 * Extracts the year from a "YYYY-MM" string.
 *
 * @param {string} yearMonth - Month in "YYYY-MM" format
 * @return {string} Year as "YYYY"
 */
export function getYear(yearMonth: string): string {
  return yearMonth.split("-")[0];
}

/**
 * Returns the distinct years present in a list of "YYYY-MM" strings, newest first.
 *
 * @param {string[]} yearMonths - Months in "YYYY-MM" format, in any order
 * @return {string[]} Unique years as "YYYY", sorted descending
 */
export function getAvailableYears(yearMonths: string[]): string[] {
  const years = new Set(yearMonths.map(getYear));
  return [...years].sort((a, b) => b.localeCompare(a));
}

/**
 * Filters items to those falling in the given year, sorted newest month first.
 *
 * @param {T[]} items - Items to filter (not mutated)
 * @param {string} year - Year as "YYYY"
 * @param {Function} getYearMonth - Extracts the item's "YYYY-MM" month
 * @return {T[]} Items of that year, sorted descending by month
 */
export function getItemsForYearDesc<T>(items: T[], year: string, getYearMonth: (item: T) => string): T[] {
  return items
    .filter((item) => getYear(getYearMonth(item)) === year)
    .sort((a, b) => getYearMonth(b).localeCompare(getYearMonth(a)));
}
