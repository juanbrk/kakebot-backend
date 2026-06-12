import { Context } from "telegraf";
import { ServiceInstallment } from "./service.types";
import { InvoiceWizardState, KakebotContext } from "./telegraf-context.types";

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

