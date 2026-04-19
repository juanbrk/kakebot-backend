import { Context } from "telegraf";
import { Session, ServiceInstallment } from "./index";

/**
 * Parameters for text input handlers that require context, user ID, session, and message text.
 * Used by handlers: handleAwaitingAmount, handleAwaitingDescription, handleCategorizingText,
 * handleServiceAmount, handleServiceDay, handleEditServiceNameText, handleEditServiceAmountText,
 * handleEditServiceDayText, handleInvoiceServiceName, handleInvoiceDay, handleInvoiceAmount,
 * handleCompServiceName, handleCompDay, handleCompAmount, handleIncomeAmount, handleIncomeReason,
 * handleRepAwaitingExpense, handleCardDigits, handleCardBank, handleCardExpiry, handleCardStmtArs,
 * handleCardStmtUsd, handleCardStmtDay.
 */
export interface TextHandlerParams {
  ctx: Context;
  telegramUserId: string;
  session: Session;
  messageText: string;
}

/**
 * Parameters for showing a single installment detail view.
 */
export interface ShowInstallmentDetailParams {
  ctx: Context;
  installmentId: string;
  backLabel?: string;
  breadcrumbSegments?: string[];
  hasReceipt?: boolean;
  hasInvoice?: boolean;
  serviceId?: string;
}

/**
 * Parameters for rendering an installments list with pagination.
 */
export interface RenderInstallmentsListParams {
  ctx: Context;
  installments: ServiceInstallment[];
  page: number;
  serviceId: string;
  serviceName: string;
}

/**
 * Parameters for attaching an invoice file to a service installment.
 */
export interface AttachInvoiceParams {
  ctx: Context;
  telegramUserId: string;
  installmentId: string;
  session: Session;
  successMessage?: string;
}

/**
 * Parameters for attaching a receipt file to a service installment.
 */
export interface AttachReceiptParams {
  ctx: Context;
  telegramUserId: string;
  installmentId: string;
  session: Session;
  successMessage?: string;
}
