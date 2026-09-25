import { Telegraf, Markup, Context } from "telegraf";
import {
  KakebotContext,
  ExpenseWizardState,
  IncomeWizardState,
} from "../../types/telegraf-context.types";
import { INCOME_SCENE_ID } from "../scenes/income.scene";
import { EXPENSE_SCENE_ID } from "../scenes/expense.scene";
import { generateMonthlyReport, getPastMonthsWithData } from "../../services/report.service";
import { ShowMonthSelectorParams } from "../../types/report.types";
import { getMonthLabel } from "../../helpers/format";
import { getAvailableYears, getItemsForYearDesc, getYear } from "../../helpers/period";
import { buildBreadcrumb } from "../../helpers/breadcrumb";
import { replyOrEdit } from "../../helpers/telegram";
import { buildYearSelectorKeyboard } from "../keyboards/period";
import { buildReportMonthListKeyboard } from "../keyboards/report";

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
  bot.action(/^rep_year:(\d{4})$/, handleRepYear);
  bot.action(/^rep_year_pg:(\d{4}):(\d+)$/, handleRepYearPage);
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
      "<b>¿Qué querés ver?</b>\n\n" +
      "• <b>Balances</b>: resumenes mensuales de gastos e ingresos\n" +
      "• <b>Pagos</b>: Pagos de servicios, impuestos y tarjetas\n" +
      "• <b>Servicios</b>: estado y método de pago de servicios\n" +
      "• <b>Impuestos</b>: estado de impuestos",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "HTML", reply_markup: keyboard.reply_markup as any },
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
      "<b>¿Qué querés ver?</b>\n\n" +
      "• <b>Ver Balance actual</b>: detalle de gastos e ingresos del mes en curso\n" +
      "• <b>Balances anteriores</b>: Historial de reportes pasados",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "HTML", reply_markup: keyboard.reply_markup as any },
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
      "<b>¿Qué querés ver?</b>\n\n" +
      "• <b>Próximos Vencimientos</b>: servicios e impuestos a vencer en los próximos 7 días",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "HTML", reply_markup: keyboard.reply_markup as any },
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
      "<b>¿Qué querés ver?</b>\n\n" +
      "• <b>Métodos de pago</b>: Listado de servicios agrupados por forma de pago\n" +
      "• <b>Estado de servicios</b>: Servicios agrupados por vencimiento y estado de pago",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "HTML", reply_markup: keyboard.reply_markup as any },
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
      "<b>¿Qué querés ver?</b>\n\n" +
      "• <b>Estado de impuestos</b>: Impuestos agrupados por vencimiento y estado de pago",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "HTML", reply_markup: keyboard.reply_markup as any },
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

  await replyOrEdit(ctx, report.detail, { parse_mode: "HTML" });
  await ctx.reply(report.balance, { parse_mode: "HTML" });
}

/**
 * Queries past months with data and shows the year selector, newest year first.
 * When only one year has data, skips the year selector and goes straight to that year's months.
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
      { parse_mode: "HTML", reply_markup: keyboard.reply_markup as any },
    );
    return;
  }

  const years = getAvailableYears(pastMonths);

  if (years.length === 1) {
    await showMonthSelector({ ctx, year: years[0], allPastMonths: pastMonths, page: 0 });
    return;
  }

  const keyboard = buildYearSelectorKeyboard({ years, callbackPrefix: "rep_year", backCallback: "rep_balances" });
  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Reportes", "Balances", "Anteriores"]) + "<b>Seleccioná el año</b>",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "HTML", reply_markup: keyboard.reply_markup as any },
  );
}

/**
 * Shows the first page of the month selector for a given year.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleRepYear(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const year = ((ctx as any).match as string[])[1];
  const telegramUserId = ctx.from?.id.toString() || "";
  const pastMonths = await getPastMonthsWithData(telegramUserId);
  await showMonthSelector({ ctx, year, allPastMonths: pastMonths, page: 0 });
}

/**
 * Shows another page of the month selector for a given year.
 *
 * @param {Context} ctx - Telegraf context
 */
async function handleRepYearPage(ctx: Context): Promise<void> {
  await ctx.answerCbQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = (ctx as any).match as string[];
  const year = match[1];
  const page = parseInt(match[2], 10);
  const telegramUserId = ctx.from?.id.toString() || "";
  const pastMonths = await getPastMonthsWithData(telegramUserId);
  await showMonthSelector({ ctx, year, allPastMonths: pastMonths, page });
}

/**
 * Shows the paginated month selector for a given year, newest month first.
 * Back goes to the year selector only when there is more than one year to pick from;
 * otherwise it returns to Balances, since rep_history would skip straight back here.
 *
 * @param {ShowMonthSelectorParams} params - Context, year, every past month with data, and page
 */
async function showMonthSelector({
  ctx,
  year,
  allPastMonths,
  page,
}: ShowMonthSelectorParams): Promise<void> {
  const yearMonths = getItemsForYearDesc(allPastMonths, year, (yearMonth) => yearMonth);
  const hasMultipleYears = getAvailableYears(allPastMonths).length > 1;
  const keyboard = buildReportMonthListKeyboard({
    yearMonths,
    year,
    page,
    backCallback: hasMultipleYears ? "rep_history" : "rep_balances",
  });

  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Reportes", "Balances", "Anteriores", year]) + "<b>Seleccioná el mes</b>",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "HTML", reply_markup: keyboard.reply_markup as any },
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
  const monthLabel = getMonthLabel(yearMonth);

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("Ver reporte", `rep_view:${yearMonth}`)],
    [
      Markup.button.callback("Registrar gasto", `rep_exp:${yearMonth}`),
      Markup.button.callback("Registrar ingreso", `rep_inc:${yearMonth}`),
    ],
    [Markup.button.callback("← Volver", `rep_year:${getYear(yearMonth)}`)],
  ]);
  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Reportes", "Balances", "Anteriores", monthLabel]) + "Selecciona una opción",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { parse_mode: "HTML", reply_markup: keyboard.reply_markup as any },
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

  await replyOrEdit(ctx, report.detail, { parse_mode: "HTML" });
  await ctx.reply(report.balance, { parse_mode: "HTML" });
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
  const monthLabel = getMonthLabel(yearMonth);

  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Reportes", "Balances", "Anteriores", monthLabel]) + "Registrando gasto",
    { parse_mode: "HTML" },
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
  const monthLabel = getMonthLabel(yearMonth);

  await replyOrEdit(
    ctx,
    buildBreadcrumb(["Reportes", "Balances", "Anteriores", monthLabel]) + "Registrando ingreso",
    { parse_mode: "HTML" },
  );
  await ctx.scene.enter(INCOME_SCENE_ID, { reportMonth: yearMonth } as IncomeWizardState);
}

