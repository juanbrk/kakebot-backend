import { Telegraf } from "telegraf";
import { KakebotContext } from "../../types/telegraf-context.types";
import { generateMonthlyReport } from "../../services/report.service";
import { replyOrEdit } from "../../helpers/telegram";

export function registerReportHandler(bot: Telegraf<KakebotContext>): void {
  bot.command("reporte", async (ctx) => {
    const telegramUserId = ctx.from?.id.toString() || "";
    const report = await generateMonthlyReport(telegramUserId);

    if (!report) {
      await ctx.reply("No hay gastos registrados este mes.");
      return;
    }

    await ctx.reply(report.detail, { parse_mode: "Markdown" });
    await ctx.reply(report.balance, { parse_mode: "Markdown" });
  });

  bot.action("menu_reporte", async (ctx) => {
    await ctx.answerCbQuery();

    const telegramUserId = ctx.from?.id.toString() || "";
    const report = await generateMonthlyReport(telegramUserId);

    if (!report) {
      await replyOrEdit(ctx, "No hay gastos registrados este mes.");
      return;
    }

    await replyOrEdit(ctx, report.detail, {
      parse_mode: "Markdown",
    });
    await ctx.reply(report.balance, { parse_mode: "Markdown" });
  });
}
