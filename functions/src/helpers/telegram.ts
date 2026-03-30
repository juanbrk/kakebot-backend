import { Context } from "telegraf";

/**
 * Edits the current message if triggered from a callback query,
 * otherwise sends a new message. Silently ignores "message is not modified"
 * errors from Telegram.
 *
 * @param {Context} ctx - Telegraf context
 * @param {string} text - Message text
 * @param {object} extra - Optional extra parameters (parse_mode, reply_markup, etc.)
 */
export async function replyOrEdit(
  ctx: Context,
  text: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extra?: Record<string, any>
): Promise<void> {
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, extra);
    } catch {
      // Telegram throws if message content didn't change — safe to ignore
    }
  } else {
    await ctx.reply(text, extra);
  }
}
