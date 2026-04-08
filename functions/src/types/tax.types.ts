import * as admin from "firebase-admin";

export interface Tax {
  id?: string;
  telegramUserId: string;
  name: string;
  normalizedName: string;
  /** Estimated day of month (1-28) when this tax is due. */
  estimatedDueDay: number;
  createdAt: admin.firestore.Timestamp;
}

export interface TaxInstallment {
  id?: string;
  telegramUserId: string;
  taxId: string;
  taxName: string;
  amount: number;
  dueDate: admin.firestore.Timestamp;
  /** Month in "YYYY-MM" format. */
  dueMonth: string;
  isPaid: boolean;
  paidAt?: admin.firestore.Timestamp;
  receiptUrl?: string;
  createdAt: admin.firestore.Timestamp;
}
