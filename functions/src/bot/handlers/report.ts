import { Telegraf, Context } from "telegraf";
import { generateMonthlyReport } from "../../services/report.service";

export function registerReportHandler(bot: Telegraf<Context>): void {
  bot.command("reporte", async (ctx) => {
    const telegramUserId = ctx.from?.id.toString() || "";
    const report = await generateMonthlyReport(telegramUserId);

    if (!report) {
      await ctx.reply("No hay gastos registrados este mes.");
      return;
    }

    await ctx.reply(report, { parse_mode: "Markdown" });
  });

  bot.action("menu_reporte", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.deleteMessage();

    const telegramUserId = ctx.from?.id.toString() || "";
    const report = await generateMonthlyReport(telegramUserId);

    if (!report) {
      await ctx.reply("No hay gastos registrados este mes.");
      return;
    }

    await ctx.reply(report, { parse_mode: "Markdown" });
  });
}
