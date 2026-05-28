import { Scenes } from "telegraf";
import { ServicePaymentMethod } from "./service.types";

/**
 * Persistent state for the income wizard, held in `ctx.wizard.state`.
 * Fields are filled progressively across the scene steps.
 */
export interface IncomeWizardState {
  amount?: number;
  reason?: string;
  reportMonth?: string;
}

/**
 * Persistent state for the tax wizard, held in `ctx.wizard.state`.
 * Covers both full tax creation and installment-only entry paths.
 */
export interface TaxWizardState {
  /** Tax display name, set in step 1 of the creation flow. */
  taxName?: string;
  /** Estimated monthly due day (1-31), set in step 2 of the creation flow. */
  estimatedDueDay?: number;
  /** Payment method selected during creation; passed to createTax. */
  paymentMethod?: ServicePaymentMethod;
  /** Firestore ID of the created/selected tax entity. */
  taxId?: string;
  /** Selected month in YYYY-MM format for the installment being registered. */
  selectedMonth?: string;
  /** Firestore ID of the saved installment, set after saving in stepHandleAmount. */
  installmentId?: string;
}

/**
 * Session object persisted per user by the Telegraf `session()` middleware.
 * Carries the active scene and step cursor under `__scenes`.
 */
export type KakebotWizardSession = Scenes.WizardSession<Scenes.WizardSessionData>;

/** Bot context with scene + wizard capabilities enabled. */
export type KakebotContext = Scenes.WizardContext;
