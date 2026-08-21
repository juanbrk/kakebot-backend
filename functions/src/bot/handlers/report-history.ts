import { Telegraf, Markup, Context } from "telegraf";
import { KakebotContext, ExpenseWizardState } from "../../types/telegraf-context.types";
import { INCOME_SCENE_ID } from "../scenes/income.scene";
import { EXPENSE_SCENE_ID } from "../scenes/expense.scene";
import { generateMonthlyReport, getPastMonthsWithData } from "../../services/report.service";
import { ShowMonthSelectorParams } from "../../types/report.types";
import { MONTH_NAMES } from "../../helpers/format";
import { buildBreadcrumb } from "../../helpers/breadcrumb";
import { replyOrEdit } from "../../helpers/telegram";

/**
 * Registers all report history navigation and retroactive registration handlers.
 *
 * @param {Telegraf<Context>} bot - The Telegraf bot instance
 */
export function registerReportHistoryHandler(bot: Telegraf<KakebotContext>): void {
  bot.action("menu_reportes", handleReportesMenu);
  bot.action("rep_balances", handleBalancesMenu);
  bot.action("rep_pagos", handlePagosMenu);
  bot.action("rep_servicios", handleServiciosMenu);
  bot.action("rep_impuestos", handleImpuestosMenu);
  bot.action("rep_current", handleRepCurrent);
  bot.action("rep_history", handleRepHistory);
  bot.action(/^rep_year:(.+)$/, handleRepYear);
  bot.action(/^rep_month:(.+)$/, handleRepMonth);
  bot.action(/^rep_view:(.+)$/, handleRepView);
  bot.action(/^rep_exp:(.+)$/, handleRepExp);
  bot.action(/^rep_inc:(.+)$/, handleRepInc);
}

/**
 * Shows the main reports menu with grouped sections: Balances, Pagos, Servicios.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleReportesMenu(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("Balances", "rep_balances")],
    [Markup.button.callback("Pagos", "rep_pagos")],
    [Markup.button.callback("Servicios", "rep_servicios")],
    [Markup.button.callback("Impuestos", "rep_impuestos")],
    [Markup.button.callback("← Volver al menú", "menu_back")],
  ]);
  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Reportes"]) +
      "*¿Qué querés ver?*\n\n" +
      "• *Balances*: resumenes mensuales de gastos e ingresos\n" +
      "• *Pagos*: Pagos de servicios, impuestos y tarjetas\n" +
      "• *Servicios*: estado y método de pago de servicios\n" +
      "• *Impuestos*: estado de impuestos",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "Markdown", reply_markup: keyboard.reply_markup as any },
  );
}

/**
 * Shows the Balances submenu: current report and previous reports.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleBalancesMenu(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("Ver Balance actual", "rep_current")],
    [Markup.button.callback("Balances anteriores", "rep_history")],
    [Markup.button.callback("← Volver", "menu_reportes")],
  ]);
  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Reportes", "Balances"]) +
      "*¿Qué querés ver?*\n\n" +
      "• *Ver Balance actual*: detalle de gastos e ingresos del mes en curso\n" +
      "• *Balances anteriores*: Historial de reportes pasados",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "Markdown", reply_markup: keyboard.reply_markup as any },
  );
}

/**
 * Shows the Pagos submenu: upcoming dues.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handlePagosMenu(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("Próximos Vencimientos", "menu_upcoming")],
    [Markup.button.callback("← Volver", "menu_reportes")],
  ]);
  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Reportes", "Pagos"]) +
      "*¿Qué querés ver?*\n\n" +
      "• *Próximos Vencimientos*: servicios e impuestos a vencer en los próximos 7 días",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "Markdown", reply_markup: keyboard.reply_markup as any },
  );
}

/**
 * Shows the Servicios submenu: payment methods and service status reports.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleServiciosMenu(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("Métodos de pago", "menu_payment_methods")],
    [Markup.button.callback("Estado de servicios", "menu_service_status")],
    [Markup.button.callback("← Volver", "menu_reportes")],
  ]);
  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Reportes", "Servicios"]) +
      "*¿Qué querés ver?*\n\n" +
      "• *Métodos de pago*: Listado de servicios agrupados por forma de pago\n" +
      "• *Estado de servicios*: Servicios agrupados por vencimiento y estado de pago",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "Markdown", reply_markup: keyboard.reply_markup as any },
  );
}

/**
 * Shows the Impuestos submenu: tax status report.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleImpuestosMenu(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("Estado de impuestos", "menu_tax_status")],
    [Markup.button.callback("← Volver", "menu_reportes")],
  ]);
  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Reportes", "Impuestos"]) +
      "*¿Qué querés ver?*\n\n" +
      "• *Estado de impuestos*: Impuestos agrupados por vencimiento y estado de pago",
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
      [Markup.button.callback("← Volver", "rep_balances")],
    ]);
    await replyOrEdit(
      ctx,
      buildBreadcrumb(["Reportes", "Balances", "Anteriores"]) + "No hay registros anteriores.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { parse_mode: "Markdown", reply_markup: keyboard.reply_markup as any },
    );
    return;
  }

  const years = [...new Set(pastMonths.map((ym) => ym.split("-")[0]))];

  if (years.length === 1) {
    // Only one year: skip year selector. Back button must return to rep_balances,
    // not to rep_history (which would create a loop by showing this same screen again).
    await showMonthSelector({ ctx, year: years[0], allPastMonths: pastMonths, backCallback: "rep_balances" });
    return;
  }

  const rows = years.map((year) => [Markup.button.callback(year, `rep_year:${year}`)]);
  rows.push([Markup.button.callback("← Volver", "rep_balances")]);
  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Reportes", "Balances", "Anteriores"]) + "Seleccioná el año",
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

  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Reportes", "Balances", "Anteriores", year]) + "Seleccioná el mes",
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
  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Reportes", "Balances", "Anteriores", monthLabel]) + "Selecciona una opción",
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
 * Initiates retroactive expense registration for a past month by entering the
 * expense wizard with the target month preset.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleRepExp(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const yearMonth = ((ctx as any).match as string[])[1];
  const [year, month] = yearMonth.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Reportes", "Balances", "Anteriores", monthLabel]) + "Registrando gasto",
    { parse_mode: "Markdown" },
  );
  await ctx.scene.enter(EXPENSE_SCENE_ID, { reportMonth: yearMonth } as ExpenseWizardState);
}

/**
 * Initiates retroactive income registration for a past month by entering the
 * income wizard with the target month preset.
 *
 * @param {KakebotContext} ctx - Telegraf context
 */
async function handleRepInc(ctx: KakebotContext): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const yearMonth = ((ctx as any).match as string[])[1];
  const [year, month] = yearMonth.split("-");
  const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;

  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Reportes", "Balances", "Anteriores", monthLabel]) + "Registrando ingreso",
    { parse_mode: "Markdown" },
  );
  await ctx.scene.enter(INCOME_SCENE_ID, { reportMonth: yearMonth });
}

