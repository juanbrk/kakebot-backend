import { Telegraf, Context } from "telegraf";
import {
  getSession,
  clearSession,
  setSession,
  emptySessionForPartial,
} from "../../services/session.service";
import { saveIncome } from "../../services/income.service";
import { formatARS } from "../../helpers/format";
import { replyOrEdit } from "../../helpers/telegram";

/**
 * Registers all income-related handlers.
 *
 * @param {Telegraf<Context>} bot - The Telegraf bot instance
 */
export function registerIncomeHandler(bot: Telegraf<Context>): void {
  bot.command("ingreso", handleIncomeCommand);
  bot.action("menu_ingreso", handleIncomeFromMenu);
  bot.action("inc_confirm", handleIncomeConfirm);
  bot.action("inc_cancel", handleIncomeCancel);
}

/**
 * Starts the income registration flow from /ingreso command.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleIncomeCommand(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id.toString() || "";

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "inc_awaiting_amount",
  });

  await ctx.reply(
    `*Ingresa el monto percibido* 
      _Escribí "cancelar" o "salir" para anular._`,
    { parse_mode: "Markdown" },
  );
}

/**
 * Starts the income registration flow from menu button.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleIncomeFromMenu(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "inc_awaiting_amount",
  });

  await ctx.editMessageText(
    "*Estás registrando un nuevo ingreso*\n" +
      "_Escribí cancelar en cualquier momento para salir._",
    { parse_mode: "Markdown" },
  );

  await ctx.reply("*Ingresa el monto percibido*", { parse_mode: "Markdown" });
}

/**
 * Confirms and saves the income to Firestore.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleIncomeConfirm(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  const session = await getSession(telegramUserId);

  const hasRequiredIncomeData =
    session && session.partialAmount && session.partialDescription;

  if (!hasRequiredIncomeData) {
    await replyOrEdit(ctx, "Error: datos de sesión incompletos.");
    return;
  }

  const amount = session.partialAmount as number;
  const reason = session.partialDescription as string;

  await clearSession(telegramUserId);
  await saveIncome(telegramUserId, amount, reason);

  await replyOrEdit(
    ctx,
    `✅ Ingreso registrado: ${reason}  ${formatARS(amount)}`,
  );
}

/**
 * Cancels the income flow.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleIncomeCancel(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";

  await clearSession(telegramUserId);
  await replyOrEdit(ctx, "Ingreso anulado.");
}
