import { Telegraf } from "telegraf";
import { KakebotContext } from "../../types/telegraf-context.types";
import { USD_SALE_SCENE_ID } from "../scenes/usd-sale.scene";

/**
 * Registers the USD sale flow entry point.
 * The flow itself lives in the USD sale wizard scene.
 *
 * @param {Telegraf<KakebotContext>} bot - The Telegraf bot instance
 */
export function registerUsdSaleHandler(bot: Telegraf<KakebotContext>): void {
  bot.command("ventausd", handleUsdSaleCommand);
}

/**
 * Enters the USD sale wizard from the /ventausd command.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleUsdSaleCommand(ctx: KakebotContext): Promise<void> {
  await ctx.reply("Vas a registrar la venta de dólares a pesos");
  await ctx.scene.enter(USD_SALE_SCENE_ID);
}
