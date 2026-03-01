import { Telegraf } from "telegraf";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
export const telegramBot = new Telegraf(BOT_TOKEN);

telegramBot.start(async (ctx) => {
  const name = ctx.from?.first_name || "Usuario";
  await ctx.reply(`¡Hola ${name}! Bienvenido a KakeBot.`);
});

telegramBot.catch((err: unknown) => {
  console.error("Bot error:", err);
});
