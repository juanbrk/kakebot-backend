import * as admin from "firebase-admin";
import { ServicePaymentMethod } from "./service.types";

export interface Tax {
  id?: string;
  telegramUserId: string;
  name: string;
  normalizedName: string;
  paymentMethod?: ServicePaymentMethod;
  createdAt: admin.firestore.Timestamp;
}

/**
 * Parameters for createTax.
 */
export interface CreateTaxParams {
  telegramUserId: string;
  name: string;
  paymentMethod?: ServicePaymentMethod;
}

/**
 * Parameters for updateTaxPaymentMethod.
 * Set paymentMethod to undefined to remove it.
 */
export interface UpdateTaxPaymentMethodParams {
  taxId: string;
  paymentMethod?: ServicePaymentMethod;
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

/**
 * Parameters for saving a tax installment.
 */
export interface SaveTaxInstallmentParams {
  telegramUserId: string;
  taxId: string;
  taxName: string;
  amount: number;
  dueDate: Date;
  dueMonth: string;
}

/**
 * Parameters for buildTaxInstallmentDetailKeyboard.
 */
export interface BuildTaxInstallmentDetailKeyboardParams {
  installmentId: string;
  isPaid: boolean;
  hasReceipt: boolean;
  taxId: string;
}

/**
 * Parameters for buildTaxActionKeyboard.
 */
export interface BuildTaxActionKeyboardParams {
  taxId: string;
  paymentMethod?: ServicePaymentMethod;
}
