import { Telegraf, Context } from "telegraf";
import { saveExpense } from "../../services/expense.service";
import { formatARS } from "../../helpers/format";
import { replyOrEdit } from "../../helpers/telegram";

export function registerExpenseHandler(bot: Telegraf<Context>): void {
  bot.action(/^confirm:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const description = ctx.match[1];
    const amount = parseFloat(ctx.match[2]);
    const telegramUserId = ctx.from?.id.toString() || "";

    const categoryId = await saveExpense({ telegramUserId, description, amount });

    const categoryLabel = categoryId ?
      ` (${categoryId})` :
      "";

    await replyOrEdit(
      ctx,
      `Gasto registrado: ${description} ${formatARS(amount)}${categoryLabel}`
    );
  });

  bot.action("cancel", async (ctx) => {
    await ctx.answerCbQuery();
    await replyOrEdit(ctx, "Gasto anulado.");
  });
}
