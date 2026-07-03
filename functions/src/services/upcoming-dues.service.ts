import { getUpcomingUnpaidInstallments } from "./service.service";
import { getUpcomingUnpaidTaxInstallments } from "./tax.service";
import { getUpcomingUnpaidCardStatements } from "./card.service";
import {
  UpcomingDueItem,
  UpcomingDuesBucket,
  UpcomingDuesResult,
} from "../types/upcoming-dues.types";

/**
 * Bucket definitions: label plus the inclusive calendar-day window [fromDay, days]
 * counted from today (day 0 = today). Windows are contiguous and non-overlapping:
 * "Vencen hoy" is day 0, "Próximos 3 días" is days 1-3, and so on. Each window spans
 * the full day range regardless of time of day, so a dueDate carrying a time component
 * (not exactly midnight) still lands in the correct bucket.
 */
const BUCKETS: { label: string; days: number; fromDay: number }[] = [
  { label: "Vencen hoy", days: 0, fromDay: 0 },
  { label: "Próximos 3 días", days: 3, fromDay: 1 },
  { label: "Próximos 5 días", days: 5, fromDay: 4 },
  { label: "Próximos 7 días", days: 7, fromDay: 6 },
];

/**
 * Returns a Date set to midnight (00:00:00.000) of the current day in server time.
 *
 * @return {Date} Start of today
 */
function getTodayStart(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Returns a Date N full days after the given base date (same time of day).
 *
 * @param {Date} base - Reference date
 * @param {number} days - Number of days to add
 * @return {Date} Resulting date
 */
function addDays(base: Date, days: number): Date {
  const result = new Date(base);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Groups a flat list of due items into non-overlapping, contiguous day-window buckets.
 * Each bucket captures items whose dueDate falls anywhere within its inclusive calendar-day
 * window [fromDay, days] from today — the half-open range [todayStart + fromDay days,
 * todayStart + (days + 1) days). Using the full day as the window (instead of an exact
 * midnight match) keeps bucketing correct even if a dueDate carries a time component.
 *
 * @param {UpcomingDueItem[]} items - All items sorted by dueDate ascending
 * @param {Date} todayStart - Start of today
 * @return {UpcomingDuesBucket[]} Non-empty buckets only
 */
function groupIntoBuckets(
  items: UpcomingDueItem[],
  todayStart: Date
): UpcomingDuesBucket[] {
  return BUCKETS.reduce<UpcomingDuesBucket[]>((acc, { label, days, fromDay }) => {
    const lowerBound = addDays(todayStart, fromDay);
    const upperBoundExclusive = addDays(todayStart, days + 1);

    const bucketItems = items.filter((item) => {
      const t = item.dueDate.getTime();
      return t >= lowerBound.getTime() && t < upperBoundExclusive.getTime();
    });

    if (bucketItems.length === 0) {
      return acc;
    }

    const subtotal = bucketItems.reduce((sum, item) => sum + item.amount, 0);
    acc.push({ label, days, items: bucketItems, subtotal });
    return acc;
  }, []);
}

/**
 * Fetches and groups upcoming unpaid dues for services and taxes into non-overlapping
 * 3-day, 5-day, and 7-day buckets.
 *
 * @param {string} telegramUserId - User's Telegram ID
 * @return {UpcomingDuesResult} Populated buckets and a flag indicating if any exist
 */
export async function getUpcomingDues(
  telegramUserId: string
): Promise<UpcomingDuesResult> {
  const [serviceInstallments, taxInstallments, cardStatements] = await Promise.all([
    getUpcomingUnpaidInstallments(telegramUserId, 7),
    getUpcomingUnpaidTaxInstallments(telegramUserId, 7),
    getUpcomingUnpaidCardStatements(telegramUserId, 7),
  ]);

  const serviceItems: UpcomingDueItem[] = serviceInstallments.map((inst) => ({
    entityName: inst.serviceName,
    amount: inst.amount,
    dueDate: inst.dueDate.toDate(),
    entityType: "service",
  }));

  const taxItems: UpcomingDueItem[] = taxInstallments.map((inst) => ({
    entityName: inst.taxName,
    amount: inst.amount,
    dueDate: inst.dueDate.toDate(),
    entityType: "tax",
  }));

  const cardItems: UpcomingDueItem[] = cardStatements.map((stmt) => ({
    entityName: stmt.cardLabel,
    amount: stmt.amountARS,
    amountUSD: stmt.amountUSD,
    dueDate: stmt.dueDate.toDate(),
    entityType: "card",
  }));

  const allItems = [...serviceItems, ...taxItems, ...cardItems].sort(
    (a, b) => a.dueDate.getTime() - b.dueDate.getTime()
  );

  const todayStart = getTodayStart();
  const buckets = groupIntoBuckets(allItems, todayStart);

  return { buckets, hasAny: buckets.length > 0 };
}
