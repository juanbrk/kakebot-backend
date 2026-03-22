import * as admin from "firebase-admin";
import { getDb } from "./db";
import { formatARS, MONTH_NAMES } from "../helpers/format";
import { getServicesByUser, getInstallmentsForMonth } from "./service.service";
import { getMonthlyIncomes } from "./income.service";

export interface MonthlyReport {
  detail: string;
  balance: string;
}

/**
 * Generates a monthly report with detail and balance messages.
 *
 * @param {string} telegramUserId - The user's Telegram ID
 * @return {MonthlyReport | null} Two-part report or null if no data
 */
export async function generateMonthlyReport(
  telegramUserId: string,
): Promise<MonthlyReport | null> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
  );

  const monthStr = String(now.getMonth() + 1).padStart(2, "0");
  const dueMonth = `${now.getFullYear()}-${monthStr}`;

  const [expensesSnapshot, services, installments, incomes] = await Promise.all(
    [
      getDb()
        .collection("expenses")
        .where("telegramUserId", "==", telegramUserId)
        .where("date", ">=", admin.firestore.Timestamp.fromDate(startOfMonth))
        .where("date", "<=", admin.firestore.Timestamp.fromDate(endOfMonth))
        .get(),
      getServicesByUser(telegramUserId),
      getInstallmentsForMonth(telegramUserId, dueMonth),
      getMonthlyIncomes(telegramUserId, startOfMonth, endOfMonth),
    ],
  );

  const hasNoData =
    expensesSnapshot.empty && services.length === 0 && incomes.length === 0;
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
    `*Reporte ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}*\n`,
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

  const incomesTotal = incomes.reduce((sum, income) => sum + income.amount, 0);

  if (incomes.length > 0) {
    detailLines.push(`*INGRESOS* ${formatARS(incomesTotal)}`);
    for (const income of incomes) {
      detailLines.push(`  • ${income.reason}  ${formatARS(income.amount)}`);
    }
    detailLines.push("");
  }

  // --- Balance message ---
  const egresosTotal = expensesTotal + servicesTotal;
  const balanceResult = incomesTotal - egresosTotal;
  const balanceEmoji = balanceResult >= 0 ? "🟢" : "🔴";

  const balanceLines: string[] = [];
  balanceLines.push(
    `*Balance ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}*\n`,
  );
  balanceLines.push(`*INGRESOS* ${formatARS(incomesTotal)}`);
  balanceLines.push("");
  balanceLines.push(`*EGRESOS* ${formatARS(egresosTotal)}`);

  if (servicesTotal > 0) {
    balanceLines.push(` • Servicios  ${formatARS(servicesTotal)}`);
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
