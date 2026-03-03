import { Telegraf, Context } from "telegraf";
import { getSession, clearSession } from "../../services/session.service";
import { saveBulkExpenses } from "../../services/expense.service";
import { buildBulkSummaryText } from "../../helpers/bulk-parse";

export function registerBulkHandler(bot: Telegraf<Context>): void {
  bot.action("bulk_confirm", async (ctx) => {
    await ctx.answerCbQuery();

    const telegramUserId = ctx.from?.id.toString() || "";
    const session = await getSession(telegramUserId);

    if (
      !session || session.state !== "bulk_pending" || !session.bulkExpenses
    ) {
      await ctx.editMessageText(
        "La sesión expiró. Enviá los gastos de nuevo."
      );
      return;
    }

    await saveBulkExpenses(telegramUserId, session.bulkExpenses);
    await clearSession(telegramUserId);
    await ctx.editMessageText(buildBulkSummaryText(session.bulkExpenses));
  });

  bot.action("bulk_cancel", async (ctx) => {
    await ctx.answerCbQuery();

    const telegramUserId = ctx.from?.id.toString() || "";
    await clearSession(telegramUserId);
    await ctx.editMessageText("Carga masiva cancelada.");
  });
}
