import { Telegraf, Markup, Context } from "telegraf";

export function registerMenuHandler(bot: Telegraf<Context>): void {
  bot.command("menu", async (ctx) => {
    await ctx.reply(
      "¿Qué querés hacer?",
      Markup.inlineKeyboard([
        [Markup.button.callback("Reporte", "menu_reporte")],
        [Markup.button.callback("Categorizar gastos", "menu_categorizar")],
        [Markup.button.callback("Servicios", "menu_servicios")],
      ])
    );
  });
}
