import { Telegraf, Markup, Context } from "telegraf";
import { KakebotContext } from "../../types/telegraf-context.types";
import { generateServiceStatusReport } from "../../services/service-status-report.service";
import { buildBreadcrumb } from "../../helpers/breadcrumb";
import { replyOrEdit } from "../../helpers/telegram";

/**
 * Registers the service status report handler.
 *
 * @param {Telegraf<KakebotContext>} bot - The Telegraf bot instance
 */
export function registerServiceStatusReportHandler(bot: Telegraf<KakebotContext>): void {
  bot.action("menu_service_status", handleServiceStatusReport);
}

/**
 * Generates and sends the service status report, grouped by due date and payment status.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleServiceStatusReport(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  const report = await generateServiceStatusReport(telegramUserId);

  const backKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback("← Volver", "rep_servicios")],
  ]);

  const header = buildBreadcrumb(["Reportes", "Servicios", "Estado de servicios"]);

  if (!report) {
    await replyOrEdit(
      ctx,
      header + "No tenés servicios registrados.",
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
