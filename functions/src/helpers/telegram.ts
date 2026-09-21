import { Context } from "telegraf";
import { log } from "./logger";

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
 * True when Telegram rejected the payload because it could not parse its
 * formatting entities - an unescaped `<` under parse_mode "HTML", an unbalanced
 * `_` under "Markdown". The text itself is deliverable; only the markup is bad,
 * so the same payload sent without parse_mode goes through.
 *
 * @param {string} reason - Lowercased error text from getTelegramErrorText
 * @return {boolean} True when the failure was a markup parse failure
 */
function isParseEntitiesError(reason: string): boolean {
  return reason.includes("can't parse entities");
}

/**
 * Retries an edit that Telegram rejected for malformed markup, with the
 * formatting stripped. Showing the screen unformatted beats not showing it at
 * all: every escaping gap in the codebase degrades to a cosmetic defect instead
 * of a dead screen. Never throws - the caller is a cosmetic edit path.
 *
 * @param {Context} ctx - Telegraf context
 * @param {string} text - Message text from the rejected edit
 * @param {object} extra - Extra parameters from the rejected edit
 * @return {Promise<void>} Resolves once the retry lands or the failure is logged.
 */
async function retryEditWithoutFormatting(
  ctx: Context,
  text: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extra?: Record<string, any>
): Promise<void> {
  const plainExtra = { ...(extra ?? {}) };
  delete plainExtra.parse_mode;

  try {
    await ctx.editMessageText(text, plainExtra);
  } catch (error) {
    log.warn("Plain-text retry of a malformed-markup edit also failed", {
      module: "helpers/telegram",
      userId: ctx.from?.id.toString() ?? "",
      reason: getTelegramErrorText(error),
    });
  }
}

/**
 * Edits the current message if triggered from a callback query,
 * otherwise sends a new message. A failed edit never aborts the caller:
 * "message is not modified" (the double-tap no-op) is ignored silently, a
 * markup parse failure is retried once with the formatting stripped, and any
 * other reason is logged as a warning before being swallowed.
 * Use for cosmetic edits only; for confirmations after a write use
 * `editOrReply`, whose reply fallback guarantees delivery.
 *
 * @param {Context} ctx - Telegraf context
 * @param {string} text - Message text
 * @param {object} extra - Optional extra parameters (parse_mode, reply_markup, etc.)
 * @return {Promise<void>} Resolves once the message is edited, re-sent or the failure is logged.
 */
export async function replyOrEdit(
  ctx: Context,
  text: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extra?: Record<string, any>
): Promise<void> {
  if (!ctx.callbackQuery) {
    await ctx.reply(text, extra);
    return;
  }

  try {
    await ctx.editMessageText(text, extra);
  } catch (error) {
    const reason = getTelegramErrorText(error);
    if (reason.includes("message is not modified")) {
      return;
    }
    if (isParseEntitiesError(reason)) {
      log.warn("Edit rejected for malformed markup; retrying unformatted", {
        module: "helpers/telegram",
        userId: ctx.from?.id.toString() ?? "",
        reason,
      });
      await retryEditWithoutFormatting(ctx, text, extra);
      return;
    }
    log.warn("Cosmetic editMessageText failed; screen not updated", {
      module: "helpers/telegram",
      userId: ctx.from?.id.toString() ?? "",
      reason,
    });
  }
}

/**
 * Delivers `text` as a new message after an edit already failed, degrading the
 * payload instead of repeating it verbatim: first as-is, then — if Telegram
 * rejects it again — stripped of `parse_mode`, because a malformed-markup
 * payload (an unescaped `<` in a user-supplied name) fails identically
 * on every retry. Losing the formatting beats losing the message.
 * Never throws: the caller already persisted data, so an undelivered
 * confirmation must not abort the rest of the flow.
 *
 * @param {Context} ctx - Telegraf context
 * @param {string} text - Message text
 * @param {object} extra - Extra parameters from the original edit attempt
 * @return {Promise<void>} Resolves once the message is delivered or the failure is logged.
 */
async function replyAfterFailedEdit(
  ctx: Context,
  text: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extra?: Record<string, any>
): Promise<void> {
  const userId = ctx.from?.id.toString() ?? "";

  try {
    await ctx.reply(text, extra);
    return;
  } catch (error) {
    log.warn("Reply fallback rejected; retrying as plain text", {
      module: "helpers/telegram",
      userId,
      reason: getTelegramErrorText(error),
    });
  }

  const plainExtra = { ...(extra ?? {}) };
  delete plainExtra.parse_mode;

  try {
    await ctx.reply(text, plainExtra);
  } catch (error) {
    log.error("Message undeliverable after a failed edit", error, {
      module: "helpers/telegram",
      userId,
    });
  }
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
    await replyAfterFailedEdit(ctx, text, extra);
  }
}
