import { BulkExpenseEntry } from "./expense.types";
import { ServicePaymentMethod } from "./service.types";

export interface SubcategoryMapping {
  id?: string;
  normalizedDesc: string;
  displayName: string;
  categoryId: string;
  telegramUserId: string;
  createdAt: FirebaseFirestore.Timestamp;
}

export type CategoryType = "income" | "expense" | "both";

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  icon?: string;
  color?: string;
  subcategories?: string[];
  isFixed?: boolean;
}

export interface PendingDescEntry {
  normalizedDesc: string;
  displayName: string;
  totalAmount: number;
}

export interface SessionExpenseEntry {
  desc: string;
  displayName: string;
  amount: number;
  categoryName: string;
}

export type PendingFileType = "photo" | "pdf";
export type CreditCardProcessor = "VISA" | "MASTERCARD";
export type StatementCurrency = "ars" | "usd" | "both";

export interface CreditCard {
  id?: string;
  telegramUserId: string;
  lastFourDigits: string;
  bank: string;
  processor: CreditCardProcessor;
  expiryMonth: number;
  expiryYear: number;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface CardStatement {
  id?: string;
  cardId: string;
  telegramUserId: string;
  month: string;
  amountARS: number;
  amountUSD: number;
  dueDate: FirebaseFirestore.Timestamp;
  isPaid: boolean;
  paidAt?: FirebaseFirestore.Timestamp;
  receiptUrl?: string;
  paymentReceiptUrl?: string;
  createdAt: FirebaseFirestore.Timestamp;
}

export type ExpenseSessionState =
  | "awaiting_amount"
  | "awaiting_description"
  | "bulk_pending"
  | "rep_awaiting_expense";

export type CategorySessionState =
  | "categorizing"
  | "awaiting_new_category_name";

export type ServiceSessionState =
  | "svc_awaiting_name"
  | "svc_awaiting_amount"
  | "svc_awaiting_day"
  | "svc_awaiting_edit_name"
  | "svc_awaiting_edit_amount"
  | "svc_awaiting_edit_day"
  | "svc_awaiting_receipt"
  | "svc_awaiting_invoice";

export type DocSessionState = "doc_awaiting_type";

export type InvoiceSessionState =
  | "invoice_awaiting_service"
  | "invoice_awaiting_name"
  | "invoice_awaiting_month"
  | "invoice_awaiting_day"
  | "invoice_awaiting_amount";

export type ReceiptSessionState =
  | "comp_awaiting_service"
  | "comp_awaiting_name"
  | "comp_awaiting_month"
  | "comp_awaiting_day"
  | "comp_awaiting_amount";

export type IncomeSessionState =
  | "inc_awaiting_amount"
  | "inc_awaiting_reason";

export type CardSessionState =
  | "card_awaiting_digits"
  | "card_awaiting_bank"
  | "card_awaiting_expiry"
  | "card_stmt_awaiting_month"
  | "card_stmt_awaiting_ars"
  | "card_stmt_awaiting_usd"
  | "card_stmt_awaiting_day"
  | "card_awaiting_receipt"
  | "card_stmt_awaiting_receipt"
  | "card_stmt_edit_awaiting_ars"
  | "card_stmt_edit_awaiting_usd"
  | "card_stmt_edit_awaiting_day";

export type TaxSessionState =
  | "tax_awaiting_name"
  | "tax_awaiting_day"
  | "tax_awaiting_payment_method"
  | "tax_awaiting_amount"
  | "tax_awaiting_receipt";

export type SessionState =
  | ExpenseSessionState
  | CategorySessionState
  | ServiceSessionState
  | DocSessionState
  | InvoiceSessionState
  | ReceiptSessionState
  | IncomeSessionState
  | CardSessionState
  | TaxSessionState;

export interface Session {
  telegramUserId: string;
  state: SessionState;
  pendingDescs: PendingDescEntry[];
  currentDesc: string;
  currentDisplayName: string;
  currentTotalAmount: number;
  currentPage: number;
  messageId: number;
  chatId: number;
  sessionExpenses: SessionExpenseEntry[];
  partialDescription?: string;
  partialAmount?: number;
  bulkExpenses?: BulkExpenseEntry[];
  serviceId?: string;
  serviceName?: string;
  installmentId?: string;
  selectedMonth?: string;
  pendingFileId?: string;
  pendingFileType?: PendingFileType;
  isNewService?: boolean;
  cardId?: string;
  cardLabel?: string;
  cardProcessor?: CreditCardProcessor;
  statementId?: string;
  statementMonth?: string;
  partialAmountUSD?: number;
  statementCurrency?: StatementCurrency;
  reportMonth?: string;
  taxId?: string;
  taxName?: string;
  taxInstallmentId?: string;
  taxPaymentMethod?: ServicePaymentMethod;
  pendingEditValue?: string;
}
