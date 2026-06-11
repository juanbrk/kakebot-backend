
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
  receiptUrlARS?: string;
  receiptUrlUSD?: string;
  exchangeRate?: number;
  usdPaymentCurrency?: "usd" | "ars";
  createdAt: FirebaseFirestore.Timestamp;
}

export type SessionState = "categorizing";

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
}
