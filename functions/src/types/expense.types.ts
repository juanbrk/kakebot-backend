import * as admin from "firebase-admin";

export interface Expense {
  id?: string;
  telegramUserId: string;
  description: string;
  normalizedDesc: string;
  amount: number;
  categoryId: string | null;
  date: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface BulkExpenseEntry {
  description: string;
  amount: number;
}

export interface SaveExpenseParams {
  telegramUserId: string;
  description: string;
  amount: number;
  date?: admin.firestore.Timestamp;
}
