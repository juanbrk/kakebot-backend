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
