import { Context } from "telegraf";
import { log } from "./logger";

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

/**
 * Extracts a lowercased reason string from an unknown Telegram error.
 * Telegraf surfaces the API reason on `.description`, falling back to `.message`.
 *
 * @param {unknown} error - The caught error from a failed Telegram API call.
 * @return {string} Lowercased error text, or empty string when none is available.
 */
function getTelegramErrorText(error: unknown): string {
  const candidate = error as { description?: string; message?: string };
  return (candidate?.description ?? candidate?.message ?? "").toLowerCase();
}

/**
 * Edits the current message; on any edit failure other than "message is not
 * modified", falls back to a fresh reply so a flow that already persisted data
 * never abandons the user. Use at write-then-edit sites (a Firestore write
 * followed by a confirmation edit); for plain dual-context edits use
 * `replyOrEdit` instead.
 *
 * @param {Context} ctx - Telegraf context
 * @param {string} text - Message text
 * @param {object} extra - Optional extra parameters (parse_mode, reply_markup, etc.)
 * @return {Promise<void>} Resolves once the message is edited or re-sent.
 */
export async function editOrReply(
  ctx: Context,
  text: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extra?: Record<string, any>
): Promise<void> {
  try {
    await ctx.editMessageText(text, extra);
  } catch (error) {
    const reason = getTelegramErrorText(error);
    if (reason.includes("message is not modified")) {
      return;
    }
    log.warn("editMessageText failed; falling back to reply", {
      module: "helpers/telegram",
      userId: ctx.from?.id.toString() ?? "",
      reason,
    });
    await ctx.reply(text, extra);
  }
}
