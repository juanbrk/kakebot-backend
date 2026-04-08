import * as admin from "firebase-admin";
import { getDb } from "./db";
import { formatARS, MONTH_NAMES } from "../helpers/format";
import { getServicesByUser, getInstallmentsForMonth } from "./service.service";
import { getMonthlyIncomes } from "./income.service";
import { getTaxInstallmentsForMonth } from "./tax.service";
import { MonthlyReport } from "../types/report.types";

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

  const [expensesSnapshot, services, installments, incomes, taxInstallments] =
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
    ]);

  const hasNoData =
    expensesSnapshot.empty &&
    services.length === 0 &&
    taxInstallments.length === 0 &&
    incomes.length === 0;
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
    detailLines.push(`*IMPUESTOS* ${formatARS(taxesTotal)}`);
    for (const inst of taxInstallments) {
      detailLines.push(` • ${inst.taxName}: ${formatARS(inst.amount)}`);
    }
    detailLines.push("");
  }

  const incomesTotal = incomes.reduce((sum, income) => sum + income.amount, 0);

  if (incomes.length > 0) {
    detailLines.push(`*INGRESOS* ${formatARS(incomesTotal)}`);
    for (const income of incomes) {
      detailLines.push(`  • ${income.reason}  ${formatARS(income.amount)}`);
    }
    detailLines.push("");
  }

  // --- Balance message ---
  const egresosTotal = expensesTotal + servicesTotal + taxesTotal;
  const balanceResult = incomesTotal - egresosTotal;
  const balanceEmoji = balanceResult >= 0 ? "🟢" : "🔴";

  const balanceLines: string[] = [];
  balanceLines.push(
    `*Balance ${MONTH_NAMES[month]} ${year}*\n`,
  );
  balanceLines.push(`*INGRESOS* ${formatARS(incomesTotal)}`);
  balanceLines.push("");
  balanceLines.push(`*EGRESOS* ${formatARS(egresosTotal)}`);

  if (servicesTotal > 0) {
    balanceLines.push(` • Servicios  ${formatARS(servicesTotal)}`);
  }
  if (taxesTotal > 0) {
    balanceLines.push(` • Impuestos  ${formatARS(taxesTotal)}`);
  }
  for (const category of categoryTotals) {
    balanceLines.push(` • ${category.label}  ${formatARS(category.total)}`);
  }

  balanceLines.push("");
  balanceLines.push(
    `*Resultado del mes*  ${formatARS(balanceResult)} ${balanceEmoji}`,
  );

  return {
    detail: detailLines.join("\n"),
    balance: balanceLines.join("\n"),
  };
}
