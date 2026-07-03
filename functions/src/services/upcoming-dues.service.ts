import { getUpcomingUnpaidInstallments } from "./service.service";
import { getUpcomingUnpaidTaxInstallments } from "./tax.service";
import { getUpcomingUnpaidCardStatements } from "./card.service";
import {
  UpcomingDueItem,
  UpcomingDuesBucket,
  UpcomingDuesResult,
} from "../types/upcoming-dues.types";

/**
 * Bucket definitions: label, days cap, and lower bound in days from today.
 * The first bucket ("Vencen hoy") uses an INCLUSIVE lower bound (captures dueDate === today);
 * the rest use an EXCLUSIVE lower bound so buckets don't overlap.
 */
const BUCKETS: { label: string; days: number; fromDay: number }[] = [
  { label: "Vencen hoy", days: 0, fromDay: 0 },
  { label: "Próximos 3 días", days: 3, fromDay: 0 },
  { label: "Próximos 5 días", days: 5, fromDay: 3 },
  { label: "Próximos 7 días", days: 7, fromDay: 5 },
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
 * Groups a flat list of due items into non-overlapping time buckets.
 * The first bucket ("Vencen hoy") captures items in [todayStart, days]; the rest
 * capture items in (fromDay, days] so no item is duplicated across buckets.
 *
 * @param {UpcomingDueItem[]} items - All items sorted by dueDate ascending
 * @param {Date} todayStart - Start of today
 * @return {UpcomingDuesBucket[]} Non-empty buckets only
 */
function groupIntoBuckets(
  items: UpcomingDueItem[],
  todayStart: Date
): UpcomingDuesBucket[] {
  return BUCKETS.reduce<UpcomingDuesBucket[]>((acc, { label, days, fromDay }, index) => {
    const lowerBound = addDays(todayStart, fromDay);
    const upperBound = addDays(todayStart, days);
    const isTodayBucket = index === 0;

    const bucketItems = items.filter((item) => {
      const t = item.dueDate.getTime();
      const passesLowerBound = isTodayBucket
        ? t >= lowerBound.getTime()
        : t > lowerBound.getTime();
      return passesLowerBound && t <= upperBound.getTime();
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
