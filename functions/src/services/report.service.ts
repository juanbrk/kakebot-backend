import * as admin from "firebase-admin";
import { getDb } from "./db";
import { formatARS, formatIncomeAmount, formatUSD, MONTH_NAMES } from "../helpers/format";
import { getServicesByUser, getInstallmentsForMonth } from "./service.service";
import { getMonthlyIncomes } from "./income.service";
import { getTaxInstallmentsForMonth, getTaxById } from "./tax.service";
import { getStatementsByUserAndMonth, getCardById } from "./card.service";
import { getMonthlyUsdSales } from "./usd-sale.service";
import { formatServicePaymentMethod } from "../helpers/payment-method";
import { MonthlyReport } from "../types/report.types";
import { Income, IncomeCurrency } from "../types/income.types";
import { UsdSale } from "../types/usd-sale.types";

/**
 * Floor of USD sold in the month before any reading derived from the weighted average sale
 * rate is shown (INGRESOS/EGRESOS/Resultado del mes USD-equivalent suffixes). Not a business
 * threshold — a statistical significance floor: below it, one or two sales can swing the rate
 * enough to make any conversion through it meaningless.
 */
const MIN_USD_SOLD_FOR_RELIABLE_RATE = 500;

/**
 * Returns a sorted list of "YYYY-MM" strings for months that have at least
 * one expense or income, strictly before the current calendar month.
 *
 * @param {string} telegramUserId - The user's Telegram ID
 * @return {Promise<string[]>} Sorted ascending array of "YYYY-MM" strings
 */
export async function getPastMonthsWithData(telegramUserId: string): Promise<string[]> {
  const now = new Date();
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [expensesSnap, incomesSnap] = await Promise.all([
    getDb().collection("expenses").where("telegramUserId", "==", telegramUserId).get(),
    getDb().collection("incomes").where("telegramUserId", "==", telegramUserId).get(),
  ]);

  const monthSet = new Set<string>();
  for (const doc of [...expensesSnap.docs, ...incomesSnap.docs]) {
    const date = (doc.data().date as admin.firestore.Timestamp).toDate();
    const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (ym < currentYearMonth) {
      monthSet.add(ym);
    }
  }

  return [...monthSet].sort();
}

/**
 * One line of the INGRESOS section: every income sharing a reason and a currency,
 * accumulated into a single entry.
 */
interface GroupedIncome {
  displayReason: string;
  currency: IncomeCurrency;
  total: number;
}

/**
 * Accumulates incomes into one entry per reason and currency, preserving the order in which
 * each group's first income appears. The currency is part of the grouping key, so ARS and USD
 * amounts are never added together. Reasons match case- and whitespace-insensitively, but are
 * displayed as they were written the first time.
 *
 * Sorted by `createdAt` ascending before grouping: retroactive months share the same `date`
 * (`buildBackdatedTimestamp`), so Firestore's query order falls back to doc ID (`__name__`)
 * instead of registration order — `createdAt` is always distinct, even for backdated entries.
 *
 * @param {Income[]} incomes - Incomes of the reported month, in any order
 * @return {GroupedIncome[]} One entry per reason and currency
 */
function groupIncomesByReasonAndCurrency(incomes: Income[]): GroupedIncome[] {
  const groups = new Map<string, GroupedIncome>();
  const chronologicalIncomes = [...incomes].sort(
    (a, b) => a.createdAt.toMillis() - b.createdAt.toMillis(),
  );

  for (const income of chronologicalIncomes) {
    const groupKey = `${income.reason.toLowerCase().trim()}|${income.currency}`;
    const existingGroup = groups.get(groupKey);

    if (existingGroup) {
      existingGroup.total += income.amount;
    } else {
      groups.set(groupKey, {
        displayReason: income.reason,
        currency: income.currency,
        total: income.amount,
      });
    }
  }

  return [...groups.values()];
}

/**
 * Weighted average exchange rate across a month's USD sales — Σ(amountARS) / Σ(amountUSD),
 * not a plain average of each sale's rate. Callers must guard for an empty array themselves;
 * this returns 0 in that case, which is never formatted because the caller is guarded by
 * `sales.length > 0`.
 *
 * @param {UsdSale[]} sales - USD sales of the reported month
 * @return {number} Weighted average ARS-per-USD rate
 */
function calculateWeightedAverageSaleRate(sales: UsdSale[]): number {
  const totalUSD = sales.reduce((sum, sale) => sum + sale.amountUSD, 0);
  const totalARS = sales.reduce((sum, sale) => sum + sale.amountARS, 0);
  return totalUSD > 0 ? totalARS / totalUSD : 0;
}

/**
 * Generates a monthly report with detail and balance messages.
 *
 * @param {string} telegramUserId - The user's Telegram ID
 * @param {string} [yearMonth] - Optional "YYYY-MM" string; defaults to current month
 * @return {MonthlyReport | null} Two-part report or null if no data
 */
export async function generateMonthlyReport(
  telegramUserId: string,
  yearMonth?: string,
): Promise<MonthlyReport | null> {
  let year: number;
  let month: number;

  if (yearMonth) {
    const [y, m] = yearMonth.split("-");
    year = parseInt(y, 10);
    month = parseInt(m, 10) - 1;
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth();
  }

  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
  const dueMonth = `${year}-${String(month + 1).padStart(2, "0")}`;

  const [expensesSnapshot, services, installments, incomes, taxInstallments, statements, sales] =
    await Promise.all([
      getDb()
        .collection("expenses")
        .where("telegramUserId", "==", telegramUserId)
        .where("date", ">=", admin.firestore.Timestamp.fromDate(startOfMonth))
        .where("date", "<=", admin.firestore.Timestamp.fromDate(endOfMonth))
        .get(),
      getServicesByUser(telegramUserId),
      getInstallmentsForMonth(telegramUserId, dueMonth),
      getMonthlyIncomes(telegramUserId, startOfMonth, endOfMonth),
      getTaxInstallmentsForMonth(telegramUserId, dueMonth),
      getStatementsByUserAndMonth(telegramUserId, dueMonth),
      getMonthlyUsdSales(telegramUserId, startOfMonth, endOfMonth),
    ]);

  const hasNoData =
    expensesSnapshot.empty &&
    services.length === 0 &&
    taxInstallments.length === 0 &&
    incomes.length === 0 &&
    statements.length === 0 &&
    sales.length === 0;
  if (hasNoData) {
    return null;
  }

  const groupedByCategory: Record<
    string,
    Record<
      string,
      {
        displayName: string;
        total: number;
      }
    >
  > = {};

  let expensesTotal = 0;

  expensesSnapshot.docs.forEach((doc) => {
    const expenseData = doc.data();
    const categoryKey = expenseData.categoryId || "sin_categoria";
    const subcategoryKey = expenseData.normalizedDesc as string;

    if (!groupedByCategory[categoryKey]) {
      groupedByCategory[categoryKey] = {};
    }
    if (!groupedByCategory[categoryKey][subcategoryKey]) {
      groupedByCategory[categoryKey][subcategoryKey] = {
        displayName: expenseData.description,
        total: 0,
      };
    }
    groupedByCategory[categoryKey][subcategoryKey].total += expenseData.amount;
    expensesTotal += expenseData.amount;
  });

  // --- Detail message ---
  const detailLines: string[] = [];
  detailLines.push(
    `*Reporte ${MONTH_NAMES[month]} ${year}*\n`,
  );

  const categoryTotals: { label: string; total: number }[] = [];

  for (const [categoryId, subcategories] of Object.entries(groupedByCategory)) {
    const categoryTotal = Object.values(subcategories).reduce(
      (sum, subcategory) => sum + subcategory.total,
      0,
    );
    const categoryLabel = categoryId === "sin_categoria" ?
      "SIN CATEGORIA" :
      categoryId.toUpperCase();

    categoryTotals.push({ label: categoryLabel, total: categoryTotal });

    detailLines.push(`*${categoryLabel}* ${formatARS(categoryTotal)}`);

    for (const subcategory of Object.values(subcategories)) {
      detailLines.push(
        `  • ${subcategory.displayName}  ${formatARS(subcategory.total)}`,
      );
    }
    detailLines.push("");
  }

  let servicesTotal = 0;

  if (services.length > 0) {
    const installmentByServiceId = new Map(
      installments.map((installment) => [installment.serviceId, installment]),
    );

    servicesTotal = installments.reduce(
      (sum, installment) => sum + installment.amount,
      0,
    );

    detailLines.push(`*SERVICIOS* ${formatARS(servicesTotal)}`);
    for (const service of services) {
      const installment = installmentByServiceId.get(service.id || "");
      if (installment) {
        const dueDate = installment.dueDate.toDate();
        const day = String(dueDate.getDate()).padStart(2, "0");
        const mo = String(dueDate.getMonth() + 1).padStart(2, "0");
        const dueSuffix = installment.isPaid ?
          "(Pagado) ✅" :
          `(vence ${day}/${mo})`;
        detailLines.push(
          `  • ${service.name}  ${formatARS(installment.amount)} ${dueSuffix}`,
        );
      } else {
        detailLines.push(`  • ${service.name}  $ -`);
      }
    }
    detailLines.push("");
  }

  const taxesTotal = taxInstallments.reduce((sum, inst) => sum + inst.amount, 0);

  if (taxInstallments.length > 0) {
    const uniqueTaxIds = [...new Set(taxInstallments.map((i) => i.taxId))];
    const taxEntities = await Promise.all(uniqueTaxIds.map((id) => getTaxById(id)));
    const taxMap = new Map(
      taxEntities.filter(Boolean).map((t) => [t!.id, t!]),
    );

    detailLines.push(`*IMPUESTOS* ${formatARS(taxesTotal)}`);
    for (const inst of taxInstallments) {
      const tax = taxMap.get(inst.taxId);
      const pmLabel = tax?.paymentMethod
        ? ` (${formatServicePaymentMethod(tax.paymentMethod)})`
        : "";
      const dueDate = inst.dueDate.toDate();
      const day = String(dueDate.getDate()).padStart(2, "0");
      const mo = String(dueDate.getMonth() + 1).padStart(2, "0");
      const dueSuffix = inst.isPaid ? "(Pagado) ✅" : `(vence ${day}/${mo})`;
      detailLines.push(` • ${inst.taxName}${pmLabel}: ${formatARS(inst.amount)} ${dueSuffix}`);
    }
    detailLines.push("");
  }

  let tarjetasTotal = 0;
  // Accumulates all USD not settled in pesos, paid or not — a statement paid in USD
  // still belongs here, it just never converts to ARS.
  let tarjetasTotalUSD = 0;

  if (statements.length > 0) {
    const uniqueCardIds = [...new Set(statements.map((s) => s.cardId))];
    const cards = await Promise.all(uniqueCardIds.map((id) => getCardById(id)));
    const cardLabelMap = new Map<string, string>();
    uniqueCardIds.forEach((cardId, i) => {
      const card = cards[i];
      if (card) {
        const processorLabel = card.processor === "VISA" ? "Visa" : "Master";
        cardLabelMap.set(cardId, `${processorLabel} ${card.lastFourDigits} - ${card.bank}`);
      }
    });

    const statementLines = statements.map((statement) => {
      const cardLabel = cardLabelMap.get(statement.cardId) ?? statement.cardId;
      const paidInARS =
        statement.amountUSD > 0 &&
        statement.exchangeRate &&
        statement.usdPaymentCurrency === "ars";
      const arsEquivalent = paidInARS
        ? statement.amountARS + statement.amountUSD * (statement.exchangeRate ?? 0)
        : statement.amountARS;

      const dueDate = statement.dueDate.toDate();
      const day = String(dueDate.getDate()).padStart(2, "0");
      const mo = String(dueDate.getMonth() + 1).padStart(2, "0");
      const dueSuffix = statement.isPaid ? "(Pagado) ✅" : `(vence ${day}/${mo})`;

      const amountText = statement.amountUSD > 0
        ? `${formatARS(statement.amountARS)} + ${formatUSD(statement.amountUSD)}`
        : formatARS(statement.amountARS);

      const rate = statement.exchangeRate ?? 0;
      const usdDetail = paidInARS
        ? ` (${formatARS(statement.amountUSD * rate)} | ${formatARS(rate)})`
        : "";

      if (!paidInARS) tarjetasTotalUSD += statement.amountUSD;

      return { cardLabel, arsEquivalent, amountText, usdDetail, dueSuffix };
    });

    tarjetasTotal = statementLines.reduce((sum, line) => sum + line.arsEquivalent, 0);

    const titleUSD = tarjetasTotalUSD > 0 ? ` + ${formatUSD(tarjetasTotalUSD)}` : "";
    detailLines.push(`*TARJETAS* ${formatARS(tarjetasTotal)}${titleUSD}`);
    for (const { cardLabel, amountText, usdDetail, dueSuffix } of statementLines) {
      detailLines.push(`  • ${cardLabel}  ${amountText}${usdDetail} ${dueSuffix}`);
    }
    detailLines.push("");
  }

  // Computed unconditionally (0 with no sales) — feeds every TCM-derived USD reading below
  // (INGRESOS/EGRESOS/Resultado del mes suffixes) plus the balance's financing line.
  const totalUSDSold = sales.reduce((sum, sale) => sum + sale.amountUSD, 0);
  const totalARSFromSales = sales.reduce((sum, sale) => sum + sale.amountARS, 0);
  const averageSaleRate = calculateWeightedAverageSaleRate(sales);
  // Statistical significance floor for the weighted average sale rate: below it, one or two
  // sales can swing the average enough to make any conversion through it meaningless.
  const hasSignificantSales = totalUSDSold >= MIN_USD_SOLD_FOR_RELIABLE_RATE;

  /**
   * Builds the "(U$S tcm-value | rate) + U$S native" suffix shared by INGRESOS, EGRESOS and
   * Resultado del mes. The parenthetical converts an ARS-only value through this month's
   * weighted average sale rate — 0 (and hidden) without a reliable rate. The native amount is
   * money that was already in dollars, untouched by any conversion. The two never combine into
   * one figure, they only concatenate — so a real USD income and a sale-rate reading never blend.
   *
   * @param {number} arsValue - ARS-only amount to convert (can be negative, e.g. balanceResult)
   * @param {number} nativeValue - Amount already denominated in USD (0 if none)
   * @param {boolean} includeRate - Whether to append the sale rate inside the parenthetical
   * @return {string} Suffix string, or "" when there is nothing to show
   */
  function buildUsdSuffix(arsValue: number, nativeValue: number, includeRate: boolean): string {
    const tcmValue = hasSignificantSales ? arsValue / averageSaleRate : 0;
    const ratePart = includeRate ? ` | ${formatARS(averageSaleRate)}` : "";
    const tcmPart = tcmValue !== 0 ? ` (${formatUSD(tcmValue)}${ratePart})` : "";
    const nativePart = nativeValue !== 0 ? ` + ${formatUSD(nativeValue)}` : "";
    return `${tcmPart}${nativePart}`;
  }

  const incomesTotalARS = incomes
    .filter((income) => income.currency !== "usd")
    .reduce((sum, income) => sum + income.amount, 0);
  const incomesTotalUSD = incomes
    .filter((income) => income.currency === "usd")
    .reduce((sum, income) => sum + income.amount, 0);
  const incomesUSD = buildUsdSuffix(incomesTotalARS, incomesTotalUSD, false);

  if (incomes.length > 0) {
    detailLines.push(`*INGRESOS* ${formatARS(incomesTotalARS)}${incomesUSD}`);
    for (const group of groupIncomesByReasonAndCurrency(incomes)) {
      detailLines.push(
        `  • ${group.displayReason}  ${formatIncomeAmount(group.total, group.currency)}`,
      );
    }
    detailLines.push("");
  }

  if (sales.length > 0) {
    const chronologicalSales = [...sales].sort(
      (a, b) => a.createdAt.toMillis() - b.createdAt.toMillis(),
    );

    detailLines.push(
      `*VENTA DE USD*  ${formatUSD(totalUSDSold)} → ${formatARS(totalARSFromSales)}`,
    );
    for (const sale of chronologicalSales) {
      detailLines.push(
        `  • ${formatUSD(sale.amountUSD)}  (${formatARS(sale.exchangeRate)})  →  ${formatARS(sale.amountARS)}`,
      );
    }
    detailLines.push("");
  }

  // --- Balance message ---
  const egresosTotal = expensesTotal + servicesTotal + taxesTotal + tarjetasTotal;
  // Seam for a future second USD egresos source — today it's exactly the card total.
  const egresosTotalUSD = tarjetasTotalUSD;
  // ARS only — USD on either side is reported separately, never folded into this number.
  const balanceResult = incomesTotalARS - egresosTotal;
  const balanceEmoji = balanceResult >= 0 ? "🟢" : "🔴";

  const balanceLines: string[] = [];
  balanceLines.push(
    `*Balance ${MONTH_NAMES[month]} ${year}*\n`,
  );
  balanceLines.push(`*INGRESOS* ${formatARS(incomesTotalARS)}${incomesUSD}`);
  balanceLines.push("");
  const egresosUSD = buildUsdSuffix(egresosTotal, egresosTotalUSD, false);
  balanceLines.push(`*EGRESOS* ${formatARS(egresosTotal)}${egresosUSD}`);

  if (servicesTotal > 0) {
    balanceLines.push(` • Servicios  ${formatARS(servicesTotal)}`);
  }
  if (taxesTotal > 0) {
    balanceLines.push(` • Impuestos  ${formatARS(taxesTotal)}`);
  }
  if (tarjetasTotal > 0) {
    balanceLines.push(` • Tarjetas  ${formatARS(tarjetasTotal)}`);
  }
  for (const category of categoryTotals) {
    balanceLines.push(` • ${category.label}  ${formatARS(category.total)}`);
  }

  const usdSuffix = buildUsdSuffix(balanceResult, incomesTotalUSD - egresosTotalUSD, true);

  balanceLines.push("");
  balanceLines.push(
    `*Resultado del mes* ${balanceEmoji}  ${formatARS(balanceResult)}${usdSuffix}`,
  );

  if (sales.length > 0) {
    balanceLines.push(`_Financiado con venta de USD: ${formatARS(totalARSFromSales)}_`);
  }

  return {
    detail: detailLines.join("\n"),
    balance: balanceLines.join("\n"),
  };
}
