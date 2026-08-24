import * as admin from "firebase-admin";

/** Currency an income was received in. USD amounts are never converted to ARS. */
export type IncomeCurrency = "ars" | "usd";

export interface Income {
  id?: string;
  telegramUserId: string;
  amount: number;
  currency: IncomeCurrency;
  reason: string;
  date: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface SaveIncomeParams {
  telegramUserId: string;
  amount: number;
  currency: IncomeCurrency;
  reason: string;
  date?: admin.firestore.Timestamp;
}
