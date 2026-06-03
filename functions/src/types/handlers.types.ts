import { Context } from "telegraf";
import { Session } from "./index";
import { ServiceInstallment } from "./service.types";
import { InvoiceWizardState, KakebotContext } from "./telegraf-context.types";

/**
 * Parameters for text input handlers that require context, user ID, session, and message text.
 * Used by handlers: handleServiceAmount, handleServiceDay, handleEditServiceNameText,
 * handleEditServiceAmountText, handleEditServiceDayText,
 * handleCardDigits, handleCardBank, handleCardExpiry, handleCardStmtArs,
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
 * Parameters for the invoice scene's internal file-attach helper.
 * Used by attachFile() in invoice.scene.ts for both invoice and receipt flows.
 */
export interface AttachFileParams {
  ctx: KakebotContext;
  state: InvoiceWizardState;
  telegramUserId: string;
  installmentId: string;
  successMessage: string;
}

/**
 * Parameters for uploading a statement payment receipt (ARS or USD).
 */
export interface StatementReceiptUploadParams {
  ctx: Context;
  telegramUserId: string;
  session: Session;
  fileType: import("./index").PendingFileType;
  documentFileId?: string;
}
