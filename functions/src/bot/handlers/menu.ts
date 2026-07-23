import { Telegraf, Markup } from "telegraf";
import { KakebotContext } from "../../types/telegraf-context.types";
import { replyOrEdit } from "../../helpers/telegram";

const MAIN_MENU_KEYBOARD = Markup.inlineKeyboard([
  [Markup.button.callback("Reportes", "menu_reportes")],
  [Markup.button.callback("Servicios", "menu_servicios")],
  [Markup.button.callback("Impuestos", "menu_impuestos")],
  [Markup.button.callback("Tarjetas", "menu_tarjetas")],
  [
    Markup.button.callback("Categorizar gastos", "menu_categorizar"),
    Markup.button.callback("Nuevo ingreso", "menu_ingreso"),
  ],
]);

const MAIN_MENU_TEXT = "¿Qué querés hacer?";

export function registerMenuHandler(bot: Telegraf<KakebotContext>): void {
  bot.command("menu", async (ctx) => {
    await ctx.reply(MAIN_MENU_TEXT, MAIN_MENU_KEYBOARD);
  });

  bot.action("menu_back", async (ctx) => {
    await ctx.answerCbQuery();
    await replyOrEdit(ctx, MAIN_MENU_TEXT, MAIN_MENU_KEYBOARD);
  });
}
