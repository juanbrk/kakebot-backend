import * as admin from "firebase-admin";

export interface Income {
  id?: string;
  telegramUserId: string;
  amount: number;
  reason: string;
  date: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface SaveIncomeParams {
  telegramUserId: string;
  amount: number;
  reason: string;
  date?: admin.firestore.Timestamp;
}
