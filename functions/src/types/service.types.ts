/**
 * Parameters for saving a service installment.
 */
export interface SaveInstallmentParams {
  telegramUserId: string;
  serviceId: string;
  serviceName: string;
  amount: number;
  dueDate: Date;
  dueMonth: string;
}

/**
 * Parameters for buildInstallmentListKeyboard.
 */
export interface BuildInstallmentListKeyboardParams {
  installments: any[];
  page: number;
  serviceId: string;
  serviceName: string;
}

/**
 * Parameters for buildInstallmentDetailKeyboard.
 */
export interface BuildInstallmentDetailKeyboardParams {
  installmentId: string;
  isPaid: boolean;
  hasReceipt: boolean;
  hasInvoice: boolean;
  backCallback?: string;
  backLabel?: string;
}
