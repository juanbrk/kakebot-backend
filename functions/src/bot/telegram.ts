import { Telegraf } from "telegraf";
import { authMiddleware } from "./middleware/auth";
import { registerStartHandler } from "./handlers/start";
import { registerMenuHandler } from "./handlers/menu";
import { registerReportHandler } from "./handlers/report";
import { registerCategorizeHandler } from "./handlers/categorize";
import { registerServiceHandler } from "./handlers/service";
import { registerExpenseHandler } from "./handlers/expense";
import { registerBulkHandler } from "./handlers/bulk";
import { registerTextHandler } from "./handlers/text";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

export const telegramBot = new Telegraf(BOT_TOKEN);

telegramBot.use(authMiddleware);

registerStartHandler(telegramBot);
registerMenuHandler(telegramBot);
registerReportHandler(telegramBot);
registerCategorizeHandler(telegramBot);
registerServiceHandler(telegramBot);
registerExpenseHandler(telegramBot);
registerBulkHandler(telegramBot);
registerTextHandler(telegramBot);

telegramBot.catch((err: unknown) => {
  console.error("Bot error:", err);
});
