import * as admin from "firebase-admin";
import { Income, IncomeCurrency, SaveIncomeParams } from "../types/income.types";
import { getDb } from "./db";

/**
 * Saves an income record to Firestore.
 *
 * @return {string} The new document ID
 */
export async function saveIncome({
  telegramUserId,
  amount,
  currency,
  reason,
  date,
}: SaveIncomeParams): Promise<string> {
  const now = admin.firestore.Timestamp.now();

  const docRef = await getDb().collection("incomes").add({
    telegramUserId,
    amount,
    currency,
    reason,
    date: date ?? now,
    createdAt: now,
  });

  return docRef.id;
}

/**
 * Fetches all incomes for a user within a date range.
 * Incomes stored before the currency field existed are normalized to "ars" here on read,
 * so no data migration is needed — but this is not the collection's only read path:
 * `getPastMonthsWithData` (report.service.ts) queries `incomes` directly and does not
 * go through this normalization (harmless today, since it never reads `currency`).
 *
 * @param {string} telegramUserId - The user's Telegram ID
 * @param {Date} startOfMonth - Start of the period
 * @param {Date} endOfMonth - End of the period
 * @return {Income[]} Array of income records
 */
export async function getMonthlyIncomes(
  telegramUserId: string,
  startOfMonth: Date,
  endOfMonth: Date
): Promise<Income[]> {
  const snapshot = await getDb()
    .collection("incomes")
    .where("telegramUserId", "==", telegramUserId)
    .where("date", ">=", admin.firestore.Timestamp.fromDate(startOfMonth))
    .where("date", "<=", admin.firestore.Timestamp.fromDate(endOfMonth))
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      telegramUserId: data.telegramUserId,
      amount: data.amount,
      currency: (data.currency as IncomeCurrency) ?? "ars",
      reason: data.reason,
      date: data.date,
      createdAt: data.createdAt,
    } as Income;
  });
}
