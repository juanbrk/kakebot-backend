import { Context, MiddlewareFn } from "telegraf";

const AUTHORIZED_USER_ID = process.env.AUTHORIZED_USER_ID || "";

export function isAuthorizedUser(telegramUserId?: number): boolean {
  return telegramUserId?.toString() === AUTHORIZED_USER_ID;
}

export const authMiddleware: MiddlewareFn<Context> = async (ctx, next) => {
  if (!isAuthorizedUser(ctx.from?.id)) {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }
    return;
  }

  await next();
};
