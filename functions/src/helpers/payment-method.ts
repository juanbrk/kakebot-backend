import { Markup } from "telegraf";
import { ServicePaymentMethod } from "../types/index";

/**
 * Parameters for buildPaymentMethodKeyboard.
 */
export interface BuildPaymentMethodKeyboardParams {
  /** Callback prefix for payment method buttons (e.g. "tax_pm"). Callback will be "${callbackPrefix}:${method}". */
  callbackPrefix: string;
  /** Callback data for the back button. Omit to hide the back button (e.g. during creation flows). */
  backAction?: string;
}

/**
 * Builds a reusable inline keyboard for ServicePaymentMethod selection.
 * Configurable callback prefix allows reuse across Tax, Service, and other domains.
 * Selection is mandatory — no skip option is provided.
 *
 * @param {BuildPaymentMethodKeyboardParams} params - Keyboard configuration
 * @return {object} Telegraf inline keyboard markup
 */
export function buildPaymentMethodKeyboard({
  callbackPrefix,
  backAction,
}: BuildPaymentMethodKeyboardParams) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [
    [Markup.button.callback("Tarjeta de Crédito", `${callbackPrefix}:credit_card`)],
    [Markup.button.callback("Débito Automático", `${callbackPrefix}:auto_debit`)],
    [Markup.button.callback("Manual", `${callbackPrefix}:manual`)],
  ];
  if (backAction) {
    rows.push([Markup.button.callback("← Volver", backAction)]);
  }
  return Markup.inlineKeyboard(rows);
}

/**
 * Returns a human-readable display label for a ServicePaymentMethod value.
 *
 * @param {ServicePaymentMethod} method - The payment method value
 * @return {string} Display label in Spanish
 */
export function formatServicePaymentMethod(method: ServicePaymentMethod): string {
  const labels: Record<ServicePaymentMethod, string> = {
    credit_card: "Tarjeta de Crédito",
    auto_debit: "Débito automático",
    manual: "Manual",
  };
  return labels[method];
}
