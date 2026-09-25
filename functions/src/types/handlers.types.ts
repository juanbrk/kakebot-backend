import { Context } from "telegraf";
import { ServiceInstallment } from "./service.types";
import { CardStatement } from "./index";
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
  year: string;
  page: number;
  serviceId: string;
  serviceName: string;
}

/**
 * Parameters for fetchAndRenderInstallmentsList.
 */
export interface FetchAndRenderInstallmentsListParams {
  ctx: Context;
  serviceId: string;
  year: string;
  page: number;
}

/**
 * Parameters for renderStatementList.
 */
export interface RenderStatementListParams {
  ctx: Context;
  statements: CardStatement[];
  year: string;
  page: number;
  cardId: string;
  cardLabel: string;
}

/**
 * Parameters for fetchAndRenderStatementList.
 */
export interface FetchAndRenderStatementListParams {
  ctx: Context;
  cardId: string;
  year: string;
  page: number;
}

/**
 * Parameters for the invoice scene's internal file-attach helper.
 * Used by handleAttachFile() in invoice.scene.ts for both invoice and receipt flows.
 */
export interface AttachFileParams {
  ctx: KakebotContext;
  state: InvoiceWizardState;
  telegramUserId: string;
  installmentId: string;
  successMessage: string;
}

