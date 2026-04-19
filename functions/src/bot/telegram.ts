import { Telegraf } from "telegraf";
import { log } from "../helpers/logger";
import { authMiddleware } from "./middleware/auth";
import { registerStartHandler } from "./handlers/start";
import { registerMenuHandler } from "./handlers/menu";
import { registerReportHandler } from "./handlers/report";
import { registerReportHistoryHandler } from "./handlers/report-history";
import { registerCategorizeHandler } from "./handlers/categorize";
import { registerServiceHandler } from "./handlers/service";
import { registerExpenseHandler } from "./handlers/expense";
import { registerBulkHandler } from "./handlers/bulk";
import { registerIncomeHandler } from "./handlers/income";
import { registerInvoiceHandler } from "./handlers/invoice";
import { registerReceiptDirectHandler } from "./handlers/receipt-direct";
import { registerCardHandler } from "./handlers/card";
import { registerTaxHandler } from "./handlers/tax";
import { registerUpcomingDuesHandler } from "./handlers/upcoming-dues";
import { registerPhotoHandler } from "./handlers/photo";
import { registerTextHandler } from "./handlers/text";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

export const telegramBot = new Telegraf(BOT_TOKEN);

telegramBot.use(authMiddleware);

registerStartHandler(telegramBot);
registerMenuHandler(telegramBot);
registerReportHandler(telegramBot);
registerReportHistoryHandler(telegramBot);
registerCategorizeHandler(telegramBot);
registerServiceHandler(telegramBot);
registerExpenseHandler(telegramBot);
registerBulkHandler(telegramBot);
registerIncomeHandler(telegramBot);
registerInvoiceHandler(telegramBot);
registerReceiptDirectHandler(telegramBot);
registerCardHandler(telegramBot);
registerTaxHandler(telegramBot);
registerUpcomingDuesHandler(telegramBot);
registerPhotoHandler(telegramBot);
registerTextHandler(telegramBot);

telegramBot.catch((err: unknown) => {
  log.error("Unhandled bot error", err, { module: "telegram" });
});
