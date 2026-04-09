import * as admin from "firebase-admin";
import { Income, SaveIncomeParams } from "../types/income.types";
import { getDb } from "./db";

/**
 * Saves an income record to Firestore.
 *
 * @return {string} The new document ID
 */
export async function saveIncome({
  telegramUserId,
  amount,
  reason,
  date,
}: SaveIncomeParams): Promise<string> {
  const now = admin.firestore.Timestamp.now();

  const docRef = await getDb().collection("incomes").add({
    telegramUserId,
    amount,
    reason,
    date: date ?? now,
    createdAt: now,
  });

  return docRef.id;
}

/**
 * Fetches all incomes for a user within a date range.
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

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  } as Income));
}
