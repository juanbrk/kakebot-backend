import { Telegraf } from "telegraf";
import { KakebotContext, BulkWizardState, ExpenseWizardState } from "../../types/telegraf-context.types";
import { parseArgentineAmount, parseExpenseMessage } from "../../helpers/parse-amount";
import { isBulkMessage, parseBulkLines, MAX_BULK_LINES } from "../../helpers/bulk-parse";
import { BULK_SCENE_ID } from "../scenes/bulk.scene";
import { EXPENSE_SCENE_ID } from "../scenes/expense.scene";

export function registerTextHandler(bot: Telegraf<KakebotContext>): void {
  bot.on("text", async (ctx) => {
    const messageText = ctx.message.text;

    if (messageText.startsWith("/")) return;

    if (isBulkMessage(messageText)) {
      const nonEmptyLines = messageText.split("\n").filter((l) => l.trim().length > 0);
      if (nonEmptyLines.length > MAX_BULK_LINES) {
        await ctx.reply(
          `El mensaje tiene ${nonEmptyLines.length} líneas. El máximo es ${MAX_BULK_LINES}.`
        );
        return;
      }
      const { parsed, failedLines } = parseBulkLines(messageText);
      if (failedLines.length > 0) {
        const errorLines = failedLines.map((line) => `• ${line}`);
        await ctx.reply(
          `No pude interpretar ${failedLines.length} línea(s):\n\n` +
          errorLines.join("\n") +
          "\n\nRevisá el formato: descripcion monto"
        );
        return;
      }
      await ctx.scene.enter(BULK_SCENE_ID, { bulkExpenses: parsed } as BulkWizardState);
      return;
    }

    const expense = parseExpenseMessage(messageText);
    if (expense) {
      await ctx.scene.enter(EXPENSE_SCENE_ID, {
        description: expense.description,
        amount: expense.amount,
      } as ExpenseWizardState);
      return;
    }

    const trimmed = messageText.trim();

    const isJustAmount = /^[\d.,]+$/.test(trimmed);
    if (isJustAmount) {
      const amount = parseArgentineAmount(trimmed);
      if (amount !== null && amount > 0) {
        await ctx.scene.enter(EXPENSE_SCENE_ID, { amount } as ExpenseWizardState);
        return;
      }
    }

    const isJustText = !/\d/.test(trimmed);
    if (isJustText) {
      await ctx.scene.enter(EXPENSE_SCENE_ID, { description: trimmed } as ExpenseWizardState);
      return;
    }

    await ctx.reply(
      "No pude interpretar el mensaje.\n" +
      "Formato: <descripcion> <monto>\n" +
      "Ej: Panaderia 5000"
    );
  });
}

