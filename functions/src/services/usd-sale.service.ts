import * as admin from "firebase-admin";
import { SaveUsdSaleParams, UsdSale } from "../types/usd-sale.types";
import { getDb } from "./db";

/**
 * Saves a USD sale record to Firestore. Derives and persists `amountARS`
 * (amountUSD × exchangeRate) so the monthly weighted average is a division
 * of two column sums.
 *
 * @return {string} The new document ID
 */
export async function saveUsdSale({
  telegramUserId,
  amountUSD,
  exchangeRate,
}: SaveUsdSaleParams): Promise<string> {
  const now = admin.firestore.Timestamp.now();
  const amountARS = amountUSD * exchangeRate;

  const docRef = await getDb().collection("usd_sales").add({
    telegramUserId,
    amountUSD,
    exchangeRate,
    amountARS,
    date: now,
    createdAt: now,
  });

  return docRef.id;
}

/**
 * Fetches all USD sales for a user within a date range.
 *
 * @param {string} telegramUserId - The user's Telegram ID
 * @param {Date} startOfMonth - Start of the period
 * @param {Date} endOfMonth - End of the period
 * @return {UsdSale[]} Array of USD sale records
 */
export async function getMonthlyUsdSales(
  telegramUserId: string,
  startOfMonth: Date,
  endOfMonth: Date
): Promise<UsdSale[]> {
  const snapshot = await getDb()
    .collection("usd_sales")
    .where("telegramUserId", "==", telegramUserId)
    .where("date", ">=", admin.firestore.Timestamp.fromDate(startOfMonth))
    .where("date", "<=", admin.firestore.Timestamp.fromDate(endOfMonth))
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      telegramUserId: data.telegramUserId,
      amountUSD: data.amountUSD,
      exchangeRate: data.exchangeRate,
      amountARS: data.amountARS,
      date: data.date,
      createdAt: data.createdAt,
    } as UsdSale;
  });
}
