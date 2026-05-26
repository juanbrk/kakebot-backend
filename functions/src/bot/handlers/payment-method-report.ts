import { Telegraf, Markup, Context } from "telegraf";
import { KakebotContext } from "../../types/telegraf-context.types";
import { generatePaymentMethodReport } from "../../services/payment-method-report.service";
import { buildBreadcrumb } from "../../helpers/breadcrumb";

/**
 * Registers the payment methods report handler.
 *
 * @param {Telegraf<Context>} bot - The Telegraf bot instance
 */
export function registerPaymentMethodReportHandler(bot: Telegraf<KakebotContext>): void {
  bot.action("menu_payment_methods", handlePaymentMethodsReport);
}

/**
 * Generates and sends the payment methods report grouped by paymentMethod.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handlePaymentMethodsReport(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  const report = await generatePaymentMethodReport(telegramUserId);

  const backKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback("← Volver", "rep_servicios")],
  ]);

  const header = buildBreadcrumb(["Reportes", "Servicios", "Métodos de Pago"]);

  if (!report) {
    await ctx.editMessageText(
      header + "No tenés servicios registrados.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { parse_mode: "Markdown", reply_markup: backKeyboard.reply_markup as any },
    );
    return;
  }

  await ctx.editMessageText(
    header + report,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "Markdown", reply_markup: backKeyboard.reply_markup as any },
  );
}
