import { CreditCardProcessor } from "./index";

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
