import { CategorizeWizardState } from "./telegraf-context.types";

/**
 * Parameters for assigning a category to a normalized description.
 */
export interface AssignCategoryParams {
  telegramUserId: string;
  normalizedDesc: string;
  displayName: string;
  categoryId: string;
  categoryName: string;
  wizardState: CategorizeWizardState;
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
