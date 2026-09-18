import { KakebotContext } from "../types/telegraf-context.types";

/**
 * Extracts the trimmed text of the incoming message, if any.
 *
 * @param {KakebotContext} ctx - Telegraf context
 * @return {string | undefined} The message text, or undefined for non-text updates.
 */
export function getMessageText(ctx: KakebotContext): string | undefined {
  const message = ctx.message;
  if (message && "text" in message) {
    return message.text.trim();
  }
  return undefined;
}

/** Longest name accepted for a service, a tax, a card bank or a category. */
export const MAX_ENTITY_NAME_LENGTH = 60;

/** Longest reason accepted when registering an income. */
export const MAX_INCOME_REASON_LENGTH = 30;

/** Longest description accepted for an expense. */
export const MAX_EXPENSE_DESCRIPTION_LENGTH = 100;

/** Control characters that are not whitespace, which the \\s+ collapse below misses. */
// eslint-disable-next-line no-control-regex
const NON_WHITESPACE_CONTROL_CHARS = /[\u0000-\u0008\u000E-\u001F\u007F-\u009F]/g;

/**
 * Normalizes free text typed by the user before it is persisted: drops control
 * characters, collapses every run of whitespace (newlines included) into a
 * single space, and trims.
 *
 * It never rejects a character the user is entitled to type - keeping a name
 * like "Netflix_AR" intact is deliberate, and the render-side escaping is what
 * makes it safe to display. It does not cap the length either: callers compare
 * against the MAX_* constants above and re-prompt, because silently truncating
 * a name surprises the user.
 *
 * @param {string} input - Raw text as typed by the user
 * @return {string} Single-line, trimmed text with no control characters
 */
export function normalizeUserText(input: string): string {
  return input
    .replace(NON_WHITESPACE_CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
}
