import { Telegraf } from "telegraf";
import { KakebotContext } from "../../types/telegraf-context.types";
import { INCOME_SCENE_ID } from "../scenes/income.scene";

/**
 * Registers the income flow entry points.
 * The flow itself lives in the income wizard scene.
 *
 * @param {Telegraf<KakebotContext>} bot - The Telegraf bot instance
 */
export function registerIncomeHandler(bot: Telegraf<KakebotContext>): void {
  bot.command("ingreso", handleIncomeCommand);
  bot.action("menu_ingreso", handleIncomeFromMenu);
}

/**
 * Enters the income wizard from the /ingreso command.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleIncomeCommand(ctx: KakebotContext): Promise<void> {
  await ctx.scene.enter(INCOME_SCENE_ID);
}

/**
 * Enters the income wizard from the menu button.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleIncomeFromMenu(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "*Estás registrando un nuevo ingreso*\n" +
      "_Escribí cancelar en cualquier momento para salir._",
    { parse_mode: "Markdown" },
  );
  await ctx.scene.enter(INCOME_SCENE_ID);
}
