import { Telegraf, Markup, Context } from "telegraf";
import { KakebotContext } from "../../types/telegraf-context.types";
import { generateTaxStatusReport } from "../../services/tax-status-report.service";
import { buildBreadcrumb } from "../../helpers/breadcrumb";
import { replyOrEdit } from "../../helpers/telegram";

/**
 * Registers the tax status report handler.
 *
 * @param {Telegraf<KakebotContext>} bot - The Telegraf bot instance
 */
export function registerTaxStatusReportHandler(bot: Telegraf<KakebotContext>): void {
  bot.action("menu_tax_status", handleTaxStatusReport);
}

/**
 * Generates and sends the tax status report, grouped by due date and payment status.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleTaxStatusReport(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  const report = await generateTaxStatusReport(telegramUserId);

  const backKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback("← Volver", "rep_impuestos")],
  ]);

  const header = buildBreadcrumb(["Reportes", "Impuestos", "Estado de impuestos"]);

  if (!report) {
    await replyOrEdit(
      ctx,
      header + "No tenés impuestos registrados.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { parse_mode: "Markdown", reply_markup: backKeyboard.reply_markup as any },
    );
    return;
  }

  await replyOrEdit(
    ctx,
    header + report,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "Markdown", reply_markup: backKeyboard.reply_markup as any },
  );
}
