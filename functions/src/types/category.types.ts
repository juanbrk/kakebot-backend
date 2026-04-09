import { Session } from "./index";

/**
 * Parameters for assigning a category to a normalized description.
 */
export interface AssignCategoryParams {
  telegramUserId: string;
  normalizedDesc: string;
  displayName: string;
  categoryId: string;
  categoryName: string;
  session: Session;
}

/**
 * Parameters for buildExpensePromptText keyboard builder.
 */
export interface BuildExpensePromptTextParams {
  displayName: string;
  totalAmount: number;
  current: number;
  total: number;
}
