import { Scenes } from "telegraf";
import { ServicePaymentMethod } from "./service.types";
import { BulkExpenseEntry } from "./expense.types";
import { PendingFileType } from "./index";

/**
 * Persistent state for the income wizard, held in `ctx.wizard.state`.
 * Fields are filled progressively across the scene steps.
 */
export interface IncomeWizardState {
  amount?: number;
  reason?: string;
  reportMonth?: string;
}

/**
 * Persistent state for the tax wizard, held in `ctx.wizard.state`.
 * Covers both full tax creation and installment-only entry paths.
 */
export interface TaxWizardState {
  /** Tax display name, set in step 1 of the creation flow. */
  taxName?: string;
  /** Estimated monthly due day (1-31), set in step 2 of the creation flow. */
  estimatedDueDay?: number;
  /** Payment method selected during creation; passed to createTax. */
  paymentMethod?: ServicePaymentMethod;
  /** Firestore ID of the created/selected tax entity. */
  taxId?: string;
  /** Selected month in YYYY-MM format for the installment being registered. */
  selectedMonth?: string;
  /** Firestore ID of the saved installment, set after saving in stepHandleAmount. */
  installmentId?: string;
}

/**
 * Persistent state for the expense wizard, held in `ctx.wizard.state`.
 * Covers four entry paths: full, partial description, partial amount, and retroactive.
 */
export interface ExpenseWizardState {
  description?: string;
  amount?: number;
  /** YYYY-MM target month for retroactive (past-month) expense registration. */
  reportMonth?: string;
}

/**
 * Persistent state for the bulk expense wizard, held in `ctx.wizard.state`.
 * Always entered with `bulkExpenses` pre-populated by the text handler.
 */
export interface BulkWizardState {
  bulkExpenses?: BulkExpenseEntry[];
}

/**
 * Persistent state for the invoice/receipt wizard, held in `ctx.wizard.state`.
 * Handles both flows (invoice and receipt) via the `flow` discriminator.
 * Always entered from the doc-router scene with `pendingFileId` and `pendingFileType` pre-set.
 */
export interface InvoiceWizardState {
  flow: "invoice" | "receipt";
  pendingFileId: string;
  pendingFileType: PendingFileType;
  serviceId?: string;
  serviceName?: string;
  selectedMonth?: string;
  /** Due day as a string, stored between stepHandleDay and stepHandleAmount. */
  partialDescription?: string;
  isNewService?: boolean;
}

/**
 * Persistent state for the categorize wizard, held in `ctx.wizard.state`.
 * Note: categorization loop state (pendingDescs, currentDesc, etc.) is managed
 * in the Firestore session via getSession/setSession to leverage existing helpers
 * in category.service.ts without changes to their signatures.
 */
export interface CategorizeWizardState {
  // No wizard-level state — all loop state lives in the Firestore session.
}

/**
 * Persistent state for the doc-router wizard, held in `ctx.wizard.state`.
 * Bridge scene: captures the uploaded file info and routes to the invoice or receipt flow
 * by entering invoice.scene with pendingFileId/pendingFileType pre-set in InvoiceWizardState.
 */
export interface DocRouterWizardState {
  pendingFileId: string;
  pendingFileType: PendingFileType;
}

/**
 * Persistent state for the service wizard, held in `ctx.wizard.state`.
 * Covers seven entry flows: create, installment, edit_name, edit_amount, edit_day, receipt, invoice.
 */
export interface ServiceWizardState {
  flow?: "create" | "installment" | "edit_name" | "edit_amount" | "edit_day" | "receipt" | "invoice";
  serviceId?: string;
  serviceName?: string;
  installmentId?: string;
  selectedMonth?: string;
  /** Pre-computed list of available months (YYYY-MM) for the month picker. */
  availableMonths?: string[];
  /** Due day (1-31) stored between stepHandleDay and stepHandleAmount. */
  dueDay?: number;
  /** Temporary amount stored while awaiting duplicate resolution. */
  partialAmount?: number;
}

/**
 * Session object persisted per user by the Telegraf `session()` middleware.
 * Carries the active scene and step cursor under `__scenes`.
 */
export type KakebotWizardSession = Scenes.WizardSession<Scenes.WizardSessionData>;

/** Bot context with scene + wizard capabilities enabled. */
export type KakebotContext = Scenes.WizardContext;
