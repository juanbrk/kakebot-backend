import * as admin from "firebase-admin";

export type ServicePaymentMethod = "credit_card" | "auto_debit" | "manual";

export interface Service {
  id?: string;
  telegramUserId: string;
  name: string;
  normalizedName: string;
  createdAt: admin.firestore.Timestamp;
  paymentMethod?: ServicePaymentMethod;
}

export interface ServiceInstallment {
  id?: string;
  telegramUserId: string;
  serviceId: string;
  serviceName: string;
  amount: number;
  dueDate: admin.firestore.Timestamp;
  dueMonth: string;
  isPaid: boolean;
  paidAt?: admin.firestore.Timestamp;
  receiptUrl?: string;
  invoiceUrl?: string;
  createdAt: admin.firestore.Timestamp;
}

/**
 * Parameters for saving a service installment.
 */
export interface SaveInstallmentParams {
  telegramUserId: string;
  serviceId: string;
  serviceName: string;
  amount: number;
  dueDate: Date;
  dueMonth: string;
}

/**
 * Parameters for buildInstallmentListKeyboard.
 */
export interface BuildInstallmentListKeyboardParams {
  installments: any[];
  page: number;
  serviceId: string;
  serviceName: string;
}

/**
 * Parameters for buildInstallmentDetailKeyboard.
 */
export interface BuildInstallmentDetailKeyboardParams {
  installmentId: string;
  isPaid: boolean;
  hasReceipt: boolean;
  hasInvoice: boolean;
  backCallback?: string;
  backLabel?: string;
}
