import { Telegraf, Markup, Context } from "telegraf";
import { Expense, Session, PendingDescEntry } from "../../types/index";
import { getDb } from "../../services/db";
import {
  getSession, setSession, clearSession,
} from "../../services/session.service";
import {
  fetchExpenseCategories, assignCategoryToDesc, advanceOrFinish,
} from "../../services/category.service";
import { buildCategoryKeyboard, buildExpensePromptText } from "../keyboards/category";

async function startCategorizationFlow(
  ctx: Context,
  telegramUserId: string
): Promise<void> {
  const uncategorizedSnapshot = await getDb()
    .collection("expenses")
    .where("telegramUserId", "==", telegramUserId)
    .where("categoryId", "==", null)
    .get();

  if (uncategorizedSnapshot.empty) {
    await ctx.reply("No tenés gastos sin categorizar. 🎉");
    return;
  }

  const groupedDescs: Record<
    string,
    { displayName: string; totalAmount: number }
  > = {};

  uncategorizedSnapshot.docs.forEach((doc) => {
    const expenseData = doc.data() as Expense;
    const key = expenseData.normalizedDesc;
    if (!groupedDescs[key]) {
      groupedDescs[key] = {
        displayName: expenseData.description,
        totalAmount: 0,
      };
    }
    groupedDescs[key].totalAmount += expenseData.amount;
  });

  const pendingDescsKeys = Object.keys(groupedDescs);
  const firstDescKey = pendingDescsKeys[0];
  const firstDescData = groupedDescs[firstDescKey];

  const pendingDescsData: PendingDescEntry[] = pendingDescsKeys.slice(1)
    .map((key) => ({
      normalizedDesc: key,
      displayName: groupedDescs[key].displayName,
      totalAmount: groupedDescs[key].totalAmount,
    }));

  const categories = await fetchExpenseCategories();
  const keyboard = buildCategoryKeyboard(categories, 0);
  const total = pendingDescsKeys.length;
  const messageText = buildExpensePromptText(
    firstDescData.displayName,
    firstDescData.totalAmount,
    1,
    total
  );

  const sentMessage = await ctx.reply(messageText, {
    ...keyboard,
    parse_mode: "Markdown",
  });

  const newSession: Session = {
    telegramUserId,
    state: "categorizing",
    pendingDescs: pendingDescsData,
    currentDesc: firstDescKey,
    currentDisplayName: firstDescData.displayName,
    currentTotalAmount: firstDescData.totalAmount,
    currentPage: 0,
    messageId: sentMessage.message_id,
    chatId: ctx.chat?.id || 0,
    sessionExpenses: [],
  };

  await setSession(telegramUserId, newSession);
}

export function registerCategorizeHandler(bot: Telegraf<Context>): void {
  bot.command("categorizar", async (ctx) => {
    const telegramUserId = ctx.from?.id.toString() || "";
    await startCategorizationFlow(ctx, telegramUserId);
  });

  bot.action("menu_categorizar", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.deleteMessage();

    const telegramUserId = ctx.from?.id.toString() || "";
    await startCategorizationFlow(ctx, telegramUserId);
  });

  bot.action(/^cat_sel:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const categoryId = ctx.match[1];
    const telegramUserId = ctx.from?.id.toString() || "";

    const session = await getSession(telegramUserId);
    if (!session) {
      await ctx.editMessageText(
        "Esta sesión ya no está activa. Usá /categorizar para empezar."
      );
      return;
    }

    const categoryDoc = await getDb()
      .collection("categories")
      .doc(categoryId)
      .get();
    const categoryName = categoryDoc.exists ?
      (categoryDoc.data()?.name as string) :
      categoryId;

    const updatedSession = await assignCategoryToDesc(
      telegramUserId,
      session.currentDesc,
      session.currentDisplayName,
      categoryId,
      categoryName,
      session
    );

    await advanceOrFinish(ctx, updatedSession);
  });

  bot.action(/^cat_pg:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const page = parseInt(ctx.match[1], 10);
    const telegramUserId = ctx.from?.id.toString() || "";

    const session = await getSession(telegramUserId);
    if (!session) {
      await ctx.editMessageText(
        "Esta sesión ya no está activa. Usá /categorizar para empezar."
      );
      return;
    }

    const categories = await fetchExpenseCategories();
    const keyboard = buildCategoryKeyboard(categories, page);

    await setSession(telegramUserId, { ...session, currentPage: page });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.editMessageReplyMarkup(keyboard.reply_markup as any);
  });

  bot.action("cat_new", async (ctx) => {
    await ctx.answerCbQuery();

    const telegramUserId = ctx.from?.id.toString() || "";
    const session = await getSession(telegramUserId);

    if (!session) {
      await ctx.editMessageText(
        "Esta sesión ya no está activa. Usá /categorizar para empezar."
      );
      return;
    }

    await setSession(telegramUserId, {
      ...session,
      state: "awaiting_new_category_name",
    });

    await ctx.editMessageText(
      `Nueva categoría para "${session.currentDisplayName}":\n\n` +
      "Escribí el nombre de la nueva categoría.\n" +
      "_Enviá la palabra cancelar para salir._",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("Cancelar", "cat_cancel")],
        ]),
      }
    );
  });

  bot.action("cat_cancel", async (ctx) => {
    await ctx.answerCbQuery();

    const telegramUserId = ctx.from?.id.toString() || "";
    await clearSession(telegramUserId);

    await ctx.editMessageText(
      "Categorización cancelada." +
      " Los gastos sin categorizar quedan para después."
    );
  });
}
