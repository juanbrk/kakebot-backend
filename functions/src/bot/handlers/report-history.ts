import { Telegraf, Markup, Context } from "telegraf";
import {
  getSession,
  clearSession,
  setSession,
  emptySessionForPartial,
} from "../../services/session.service";
import { generateMonthlyReport, getPastMonthsWithData } from "../../services/report.service";
import { saveExpense } from "../../services/expense.service";
import { ShowMonthSelectorParams } from "../../types/report.types";
import { MONTH_NAMES, formatARS, buildBackdatedTimestamp } from "../../helpers/format";
import { buildBreadcrumb } from "../../helpers/breadcrumb";
import { replyOrEdit } from "../../helpers/telegram";

/**
 * Registers all report history navigation and retroactive registration handlers.
 *
 * @param {Telegraf<Context>} bot - The Telegraf bot instance
 */
export function registerReportHistoryHandler(bot: Telegraf<Context>): void {
  bot.action("menu_reportes", handleReportesMenu);
  bot.action("rep_current", handleRepCurrent);
  bot.action("rep_history", handleRepHistory);
  bot.action(/^rep_year:(.+)$/, handleRepYear);
  bot.action(/^rep_month:(.+)$/, handleRepMonth);
  bot.action(/^rep_view:(.+)$/, handleRepView);
  bot.action(/^rep_exp:(.+)$/, handleRepExp);
  bot.action(/^rep_inc:(.+)$/, handleRepInc);
  bot.action("rep_exp_confirm", handleRepExpConfirm);
  bot.action("rep_exp_cancel", handleRepExpCancel);
}

/**
 * Shows the main reports submenu: current month vs previous months.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleReportesMenu(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("Ver reporte actual", "rep_current")],
    [Markup.button.callback("Reportes anteriores", "rep_history")],
    [Markup.button.callback("Próximos Vencimientos", "menu_upcoming")],
    [Markup.button.callback("← Volver al menú", "menu_back")],
  ]);
  await ctx.editMessageText(
    buildBreadcrumb(["Reportes"]) + "Selecciona una opción",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "Markdown", reply_markup: keyboard.reply_markup as any },
  );
}

/**
 * Generates and sends the current month report.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleRepCurrent(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  const report = await generateMonthlyReport(telegramUserId);

  if (!report) {
    await replyOrEdit(ctx, "No hay gastos registrados este mes.");
    return;
  }

  await replyOrEdit(ctx, report.detail, { parse_mode: "Markdown" });
  await ctx.reply(report.balance, { parse_mode: "Markdown" });
}

/**
 * Queries past months with data and navigates to year selector or month selector.
 * When only one year has data, skips the year selector and goes directly to the month selector,
 * passing "menu_reportes" as the back callback to avoid a navigation loop.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleRepHistory(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  const pastMonths = await getPastMonthsWithData(telegramUserId);

  if (pastMonths.length === 0) {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("← Volver", "menu_reportes")],
    ]);
    await ctx.editMessageText(
      buildBreadcrumb(["Reportes", "Anteriores"]) + "No hay registros anteriores.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { parse_mode: "Markdown", reply_markup: keyboard.reply_markup as any },
    );
    return;
  }

  const years = [...new Set(pastMonths.map((ym) => ym.split("-")[0]))];

  if (years.length === 1) {
    // Only one year: skip year selector. Back button must return to menu_reportes,
    // not to rep_history (which would create a loop by showing this same screen again).
    await showMonthSelector({ ctx, year: years[0], allPastMonths: pastMonths, backCallback: "menu_reportes" });
    return;
  }

  const rows = years.map((year) => [Markup.button.callback(year, `rep_year:${year}`)]);
  rows.push([Markup.button.callback("← Volver", "menu_reportes")]);
  await ctx.editMessageText(
    buildBreadcrumb(["Reportes", "Anteriores"]) + "Seleccioná el año",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "Markdown", reply_markup: Markup.inlineKeyboard(rows).reply_markup as any },
  );
}

/**
 * Shows the month selector for a given year.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleRepYear(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const year = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";
  const pastMonths = await getPastMonthsWithData(telegramUserId);
  await showMonthSelector({ ctx, year, allPastMonths: pastMonths, backCallback: "rep_history" });
}

/**
 * Builds and shows the month selector keyboard for a given year.
 */
async function showMonthSelector({
  ctx,
  year,
  allPastMonths,
  backCallback,
}: ShowMonthSelectorParams): Promise<void> {
  const yearMonths = allPastMonths
    .filter((ym) => ym.startsWith(year))
    .sort()
    .reverse();

  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < yearMonths.length; i += 2) {
    const [, m1] = yearMonths[i].split("-");
    const row = [
      Markup.button.callback(
        `${MONTH_NAMES[parseInt(m1, 10) - 1]} ${year}`,
        `rep_month:${yearMonths[i]}`,
      ),
    ];
    if (i + 1 < yearMonths.length) {
      const [, m2] = yearMonths[i + 1].split("-");
      row.push(
        Markup.button.callback(
          `${MONTH_NAMES[parseInt(m2, 10) - 1]} ${year}`,
          `rep_month:${yearMonths[i + 1]}`,
        ),
      );
    }
    rows.push(row);
  }
  rows.push([Markup.button.callback("← Volver", backCallback)]);

  await ctx.editMessageText(
    buildBreadcrumb(["Reportes", "Anteriores", year]) + "Seleccioná el mes",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "Markdown", reply_markup: Markup.inlineKeyboard(rows).reply_markup as any },
  );
}

/**
 * Shows the period submenu for the selected month.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleRepMonth(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const yearMonth = ((ctx as any).match as string[])[1];
  const [year, month] = yearMonth.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("Ver reporte", `rep_view:${yearMonth}`)],
    [
      Markup.button.callback("Registrar gasto", `rep_exp:${yearMonth}`),
      Markup.button.callback("Registrar ingreso", `rep_inc:${yearMonth}`),
    ],
    [Markup.button.callback("← Volver", `rep_year:${year}`)],
  ]);
  await ctx.editMessageText(
    buildBreadcrumb(["Reportes", "Anteriores", monthLabel]) + "Selecciona una opción",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "Markdown", reply_markup: keyboard.reply_markup as any },
  );
}

/**
 * Generates and sends the report for a specific past month.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleRepView(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const yearMonth = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";
  const report = await generateMonthlyReport(telegramUserId, yearMonth);

  if (!report) {
    await replyOrEdit(ctx, "No se tienen datos del mes seleccionado.");
    return;
  }

  await replyOrEdit(ctx, report.detail, { parse_mode: "Markdown" });
  await ctx.reply(report.balance, { parse_mode: "Markdown" });
}

/**
 * Initiates retroactive expense registration for a past month.
 * Sets session state and shows context message + prompt.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleRepExp(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const yearMonth = ((ctx as any).match as string[])[1];
  const [year, month] = yearMonth.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
  const telegramUserId = ctx.from?.id.toString() || "";

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "rep_awaiting_expense",
    reportMonth: yearMonth,
  });

  await ctx.editMessageText(
    buildBreadcrumb(["Reportes", "Anteriores", monthLabel]) + "Registrando gasto",
    { parse_mode: "Markdown" },
  );
  await ctx.reply(
    "Ingresá descripción y monto en un solo mensaje.\nEj: Panaderia 5000\n" +
    "_Escribí cancelar para salir._",
    { parse_mode: "Markdown" },
  );
}

/**
 * Initiates retroactive income registration for a past month.
 * Sets session state and shows context message + prompt.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleRepInc(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const yearMonth = ((ctx as any).match as string[])[1];
  const [year, month] = yearMonth.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
  const telegramUserId = ctx.from?.id.toString() || "";

  await setSession(telegramUserId, {
    ...emptySessionForPartial(telegramUserId),
    state: "inc_awaiting_amount",
    reportMonth: yearMonth,
  });

  await ctx.editMessageText(
    buildBreadcrumb(["Reportes", "Anteriores", monthLabel]) + "Registrando ingreso",
    { parse_mode: "Markdown" },
  );
  await ctx.reply(
    "*Ingresá el monto percibido*\n_Escribí cancelar para salir._",
    { parse_mode: "Markdown" },
  );
}

/**
 * Confirms and saves the retroactive expense using the backdated timestamp from session.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleRepExpConfirm(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const telegramUserId = ctx.from?.id.toString() || "";
  const session = await getSession(telegramUserId);

  const hasRequiredData =
    session &&
    session.partialAmount &&
    session.partialDescription &&
    session.reportMonth;

  if (!hasRequiredData) {
    await replyOrEdit(ctx, "Error: datos de sesión incompletos.");
    return;
  }

  const amount = session.partialAmount as number;
  const description = session.partialDescription as string;
  const reportMonth = session.reportMonth as string;
  const backdatedTimestamp = buildBackdatedTimestamp(reportMonth);

  await clearSession(telegramUserId);
  await saveExpense({ telegramUserId, description, amount, date: backdatedTimestamp });

  await replyOrEdit(ctx, `✅ Gasto registrado: ${description}  ${formatARS(amount)}`);
}

/**
 * Cancels the retroactive expense registration.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleRepExpCancel(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  await clearSession(ctx.from?.id.toString() || "");
  await replyOrEdit(ctx, "Gasto anulado.");
}
