import { Scenes } from "telegraf";
import { ServicePaymentMethod } from "./service.types";
import { BulkExpenseEntry } from "./expense.types";
import { PendingFileType, CreditCardProcessor, PendingDescEntry, SessionExpenseEntry } from "./index";

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
  /** Payment method selected during creation; passed to createTax. */
  paymentMethod?: ServicePaymentMethod;
  /** Firestore ID of the created/selected tax entity. */
  taxId?: string;
  /** Selected month in YYYY-MM format for the installment being registered/edited. */
  selectedMonth?: string;
  /** Installment amount, stored between stepHandleAmount and stepHandleInstallmentDueDay. */
  amount?: number;
  /** Firestore ID of the saved/edited installment. */
  installmentId?: string;
  /** True when entering the scene to edit an existing installment's due day. */
  editDueDay?: boolean;
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
 * All loop state (pending descriptions, session expenses, message context)
 * is stored here and persisted via the Telegraf session middleware.
 */
export interface CategorizeWizardState {
  /** Remaining expense descriptions to categorize, after the current one. */
  pendingDescs: PendingDescEntry[];
  /** Normalized description key of the expense currently being categorized. */
  currentDesc: string;
  /** Human-readable display name for the current expense description. */
  currentDisplayName: string;
  /** Summed amount of all uncategorized expenses with currentDesc. */
  currentTotalAmount: number;
  /** Current page index of the category keyboard. */
  currentPage: number;
  /** Telegram message ID of the category picker message (for editMessageText). */
  messageId: number;
  /** Telegram chat ID (for editMessageText). */
  chatId: number;
  /** Accumulated results of this categorization session (including skipped items). */
  sessionExpenses: SessionExpenseEntry[];
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
}

/**
 * Persistent state for the card creation wizard, held in `ctx.wizard.state`.
 * Covers the full card creation flow: bank → processor → digits → expiry → confirm.
 */
export interface CardCreateWizardState {
  /** Bank name (user-entered text), e.g. "Galicia", "BBVA". */
  bank?: string;
  /** Last four digits of the card. */
  lastFourDigits?: string;
  /** Card network processor (VISA or MASTERCARD). */
  processor?: CreditCardProcessor;
  /** Card expiry month (1-12). */
  expiryMonth?: number;
  /** Card expiry year (4-digit, e.g. 2028). */
  expiryYear?: number;
}

/**
 * Persistent state for the card statement wizard, held in `ctx.wizard.state`.
 * Covers eight entry flows via the `flow` discriminator: create, pay,
 * edit_ars, edit_usd, edit_day, receipt_ars, receipt_usd, receipt_pdf.
 */
export interface CardStmtWizardState {
  flow: "create" | "pay" | "edit_ars" | "edit_usd" | "edit_day"
      | "receipt_ars" | "receipt_usd" | "receipt_pdf";
  cardId?: string;
  cardLabel?: string;
  statementId?: string;
  /** Statement month in YYYY-MM format. */
  statementMonth?: string;
  /** Currency mix selected during creation. */
  statementCurrency?: "ars" | "usd" | "both";
  /** Peso consumos amount, set during creation. */
  amountARS?: number;
  /** Dollar consumos amount, set during creation. */
  amountUSD?: number;
  /** Statement due day (1-31), set during creation. */
  dueDay?: number;
  /** YYYY-MM months already registered, used to filter the create month picker. */
  existingMonths?: string[];
  /** USD amount of the statement being paid; drives the ARS→USD receipt follow-up. */
  statementAmountUSD?: number;
  /** Currency used to settle the USD portion (payment and edit-USD flows). */
  usdPaymentCurrency?: "usd" | "ars";
  /** Exchange rate (TCV) entered when paying the USD portion in pesos. */
  exchangeRate?: number;
  /** New USD amount pending confirmation in the edit-USD flow. */
  pendingEditUSD?: number;
  /** Whether the statement is already paid (gates the edit-USD currency/TCV sub-flow). */
  isPaid?: boolean;
  /** Generic pending edit value (ARS amount or due day) awaiting confirmation. */
  pendingEditValue?: number;
}

/**
 * Session object persisted per user by the Telegraf `session()` middleware.
 * Carries the active scene and step cursor under `__scenes`.
 */
export type KakebotWizardSession = Scenes.WizardSession<Scenes.WizardSessionData>;

/** Bot context with scene + wizard capabilities enabled. */
export type KakebotContext = Scenes.WizardContext;
