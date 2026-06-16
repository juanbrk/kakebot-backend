import { CardStatement, CreditCardProcessor } from "./index";

export interface CreateCardParams {
  telegramUserId: string;
  lastFourDigits: string;
  bank: string;
  processor: CreditCardProcessor;
  expiryMonth: number;
  expiryYear: number;
}

export interface CreateStatementParams {
  cardId: string;
  telegramUserId: string;
  month: string;
  amountARS: number;
  amountUSD: number;
  dueDate: Date;
}

export interface CardConfirmTextParams {
  digits: string;
  bank: string;
  processor: CreditCardProcessor;
  expiry: string;
}

export interface StmtConfirmTextParams {
  cardLabel: string;
  monthLabel: string;
  amountARS: number;
  amountUSD: number;
  dueDay: number;
  stmtMonth: string;
}

export interface BuildStatementDetailKeyboardParams {
  statementId: string;
  cardId: string;
  isPaid: boolean;
}

export interface BuildStmtReceiptsKeyboardParams {
  statementId: string;
  hasReceipt: boolean;
  isPaid: boolean;
  hasReceiptARS: boolean;
  hasReceiptUSD: boolean;
  amountUSD: number;
}

export interface BuildStmtPayARSKeyboardParams {
  statementId: string;
  hasUSD: boolean;
}

export interface MarkStatementAsPaidParams {
  statementId: string;
  exchangeRate?: number;
  usdPaymentCurrency?: "usd" | "ars";
}

export interface UpdateStatementUSDAndRateParams {
  statementId: string;
  amountUSD: number;
  exchangeRate?: number;
  usdPaymentCurrency?: "usd" | "ars";
}

export interface BuildStmtUsdCurrencyKeyboardParams {
  statementId: string;
  flow: "pay" | "edit";
}

export interface BuildStatementListKeyboardParams {
  statements: CardStatement[];
  page: number;
  cardId: string;
  cardLabel: string;
}

export interface BuildStmtEditConfirmKeyboardParams {
  field: "ars" | "usd" | "day";
  statementId: string;
  value: string;
}

export interface UpdateStatementAmountARSParams {
  statementId: string;
  amount: number;
}

export interface UpdateStatementAmountUSDParams {
  statementId: string;
  amount: number;
}

export interface UpdateStatementDueDayParams {
  statementId: string;
  newDay: number;
}

/** Resolved card statement data for the Próximos Vencimientos report. */
export interface CardStatementForDue {
  cardLabel: string;
  amountARS: number;
  amountUSD: number;
  dueDate: FirebaseFirestore.Timestamp;
}
