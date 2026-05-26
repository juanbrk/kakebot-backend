import { Scenes } from "telegraf";

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
 * Session object persisted per user by the Telegraf `session()` middleware.
 * Carries the active scene and step cursor under `__scenes`.
 */
export type KakebotWizardSession = Scenes.WizardSession<Scenes.WizardSessionData>;

/** Bot context with scene + wizard capabilities enabled. */
export type KakebotContext = Scenes.WizardContext;
