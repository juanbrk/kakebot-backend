import { Telegraf, Markup, Context } from "telegraf";
import { getUpcomingDues } from "../../services/upcoming-dues.service";
import { formatARS } from "../../helpers/format";
import { buildBreadcrumb } from "../../helpers/breadcrumb";
import { UpcomingDueItem, UpcomingDuesBucket } from "../../types/upcoming-dues.types";

/**
 * Registers the upcoming dues report handler.
 *
 * @param {Telegraf<Context>} bot - The Telegraf bot instance
 */
export function registerUpcomingDuesHandler(bot: Telegraf<Context>): void {
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
  return `• ${item.entityName}  ${formatARS(item.amount)} (${day}/${month})`;
}

/**
 * Formats a single bucket section with its header and item lines.
 *
 * @param {UpcomingDuesBucket} bucket - The bucket to format
 * @return {string} Multi-line formatted section
 */
function formatBucket(bucket: UpcomingDuesBucket): string {
  const header = `*${bucket.label}: ${formatARS(bucket.subtotal)}*`;
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
    text = breadcrumb + "No hay vencimientos en los próximos 7 días.";
  } else {
    const sections = result.buckets.map(formatBucket).join("\n\n");
    text = breadcrumb + "*PRÓXIMOS VENCIMIENTOS*\n\n" + sections;
  }

  await ctx.editMessageText(
    text,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "Markdown", reply_markup: keyboard.reply_markup as any }
  );
}
