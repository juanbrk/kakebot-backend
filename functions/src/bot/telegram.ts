import { Telegraf, session, Scenes } from "telegraf";
import { log } from "../helpers/logger";
import { KakebotContext } from "../types/telegraf-context.types";
import { buildTelegrafSessionStore } from "../services/telegraf-session.store";
import { incomeScene } from "./scenes/income.scene";
import { taxScene } from "./scenes/tax.scene";
import { bulkScene } from "./scenes/bulk.scene";
import { expenseScene } from "./scenes/expense.scene";
import { docRouterScene } from "./scenes/doc-router.scene";
import { invoiceScene } from "./scenes/invoice.scene";
import { categorizeScene } from "./scenes/categorize.scene";
import { authMiddleware } from "./middleware/auth";
import { registerStartHandler } from "./handlers/start";
import { registerMenuHandler } from "./handlers/menu";
import { registerReportHandler } from "./handlers/report";
import { registerReportHistoryHandler } from "./handlers/report-history";
import { registerCategorizeHandler } from "./handlers/categorize";
import { registerServiceHandler } from "./handlers/service";
import { registerIncomeHandler } from "./handlers/income";
import { registerCardHandler } from "./handlers/card";
import { registerTaxHandler } from "./handlers/tax";
import { registerUpcomingDuesHandler } from "./handlers/upcoming-dues";
import { registerPaymentMethodReportHandler } from "./handlers/payment-method-report";
import { registerPhotoHandler } from "./handlers/photo";
import { registerTextHandler } from "./handlers/text";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

export const telegramBot = new Telegraf<KakebotContext>(BOT_TOKEN);

telegramBot.use(authMiddleware);
telegramBot.use(session({
  store: buildTelegrafSessionStore(),
  getSessionKey: (ctx) => ctx.from?.id.toString(),
}));

const stage = new Scenes.Stage<KakebotContext>([
  incomeScene, taxScene, bulkScene, expenseScene, docRouterScene, invoiceScene, categorizeScene,
]);
telegramBot.use(stage.middleware());

registerStartHandler(telegramBot);
registerMenuHandler(telegramBot);
registerReportHandler(telegramBot);
registerReportHistoryHandler(telegramBot);
registerCategorizeHandler(telegramBot);
registerServiceHandler(telegramBot);
registerIncomeHandler(telegramBot);
registerCardHandler(telegramBot);
registerTaxHandler(telegramBot);
registerUpcomingDuesHandler(telegramBot);
registerPaymentMethodReportHandler(telegramBot);
registerPhotoHandler(telegramBot);
registerTextHandler(telegramBot);

telegramBot.catch((err: unknown) => {
  log.error("Unhandled bot error", err, { module: "telegram" });
});
