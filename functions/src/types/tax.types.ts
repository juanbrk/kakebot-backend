import * as admin from "firebase-admin";
import { ServicePaymentMethod } from "./service.types";

export interface Tax {
  id?: string;
  telegramUserId: string;
  name: string;
  normalizedName: string;
  /** Estimated day of month (1-31) when this tax is due. */
  estimatedDueDay: number;
  paymentMethod?: ServicePaymentMethod;
  createdAt: admin.firestore.Timestamp;
}

/**
 * Parameters for createTax.
 */
export interface CreateTaxParams {
  telegramUserId: string;
  name: string;
  estimatedDueDay: number;
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

/**
 * Parameters for updateTaxEstimatedDueDay.
 */
export interface UpdateTaxEstimatedDueDayParams {
  taxId: string;
  estimatedDueDay: number;
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
