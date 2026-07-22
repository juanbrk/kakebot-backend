import { Telegraf, Markup, Context } from "telegraf";
import { KakebotContext } from "../../types/telegraf-context.types";
import { getUpcomingDues } from "../../services/upcoming-dues.service";
import { formatARS, formatUSD } from "../../helpers/format";
import { buildBreadcrumb } from "../../helpers/breadcrumb";
import { UpcomingDueItem, UpcomingDuesBucket } from "../../types/upcoming-dues.types";
import { replyOrEdit } from "../../helpers/telegram";

/**
 * Registers the upcoming dues report handler.
 *
 * @param {Telegraf<Context>} bot - The Telegraf bot instance
 */
export function registerUpcomingDuesHandler(bot: Telegraf<KakebotContext>): void {
  bot.action("menu_upcoming", handleUpcomingDues);
}

/**
 * Formats a single due item line as a bullet point.
 *
 * @param {UpcomingDueItem} item - The due item to format
 * @return {string} Formatted line
 */
function formatDueItemLine(item: UpcomingDueItem): string {
  const day = item.dueDate.getDate().toString().padStart(2, "0");
  const month = (item.dueDate.getMonth() + 1).toString().padStart(2, "0");
  const usdPart = item.amountUSD && item.amountUSD > 0 ? ` y ${formatUSD(item.amountUSD)}` : "";
  return `• ${item.entityName}  ${formatARS(item.amount)}${usdPart} (${day}/${month})`;
}

/**
 * Formats a single bucket section with its header and item lines.
 *
 * @param {UpcomingDuesBucket} bucket - The bucket to format
 * @return {string} Multi-line formatted section
 */
function formatBucket(bucket: UpcomingDuesBucket): string {
  const totalUSD = bucket.items.reduce((sum, item) => sum + (item.amountUSD ?? 0), 0);
  const usdPart = totalUSD > 0 ? ` y ${formatUSD(totalUSD)}` : "";
  const header = `*${bucket.label}: ${formatARS(bucket.subtotal)}${usdPart}*`;
  const lines = bucket.items.map(formatDueItemLine);
  return [header, ...lines].join("\n");
}

/**
 * Handles the "Próximos Vencimientos" menu action.
 * Fetches upcoming unpaid dues for services and taxes, groups them into
 * non-overlapping time buckets, and displays the result.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleUpcomingDues(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();

  const telegramUserId = ctx.from?.id.toString() || "";
  const result = await getUpcomingDues(telegramUserId);

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("← Volver", "menu_reportes")],
  ]);

  const breadcrumb = buildBreadcrumb(["Reportes", "Próximos Vencimientos"]);

  let text: string;
  if (!result.hasAny) {
    text = breadcrumb + "No hay vencimientos hoy ni en los próximos 7 días.";
  } else {
    const sections = result.buckets.map(formatBucket).join("\n\n");
    text = breadcrumb + "*PRÓXIMOS VENCIMIENTOS*\n\n" + sections;
  }

  await replyOrEdit(
    ctx,
    text,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "Markdown", reply_markup: keyboard.reply_markup as any }
  );
}
