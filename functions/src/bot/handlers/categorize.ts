import { Telegraf } from "telegraf";
import { KakebotContext } from "../../types/telegraf-context.types";
import { CATEGORIZE_SCENE_ID } from "../scenes/categorize.scene";

/**
 * Registers the entry points for the categorization WizardScene.
 * All categorization logic (cat_sel, cat_pg, cat_new, cat_cancel) lives in categorize.scene.ts.
 *
 * @param {Telegraf<KakebotContext>} bot - Telegraf bot instance.
 */
export function registerCategorizeHandler(bot: Telegraf<KakebotContext>): void {
  bot.command("categorizar", async (ctx) => {
    await ctx.scene.enter(CATEGORIZE_SCENE_ID);
  });

  bot.action("menu_categorizar", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.deleteMessage();
    await ctx.scene.enter(CATEGORIZE_SCENE_ID);
  });
}
