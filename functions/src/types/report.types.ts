import * as admin from "firebase-admin";
import { Context } from "telegraf";

export interface MonthlyReport {
  detail: string;
  balance: string;
}

export interface ShowMonthSelectorParams {
  ctx: Context;
  year: string;
  allPastMonths: string[];
  backCallback: string;
}

/**
 * Minimal installment shape needed to classify an entity by payment status.
 * Both ServiceInstallment and TaxInstallment satisfy it structurally.
 */
export interface StatusInstallment {
  amount: number;
  dueDate: admin.firestore.Timestamp;
  isPaid: boolean;
}

/**
 * A named entity paired with its installment for the reported month,
 * or null when no installment exists for that month.
 */
export interface StatusReportEntry {
  name: string;
  installment: StatusInstallment | null;
}

/**
 * Parameters for buildStatusReportText.
 */
export interface BuildStatusReportTextParams {
  title: string;
  entries: StatusReportEntry[];
}
