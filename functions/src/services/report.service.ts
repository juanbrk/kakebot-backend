import * as admin from "firebase-admin";
import { getDb } from "./db";
import { formatARS, MONTH_NAMES } from "../helpers/format";
import { getServicesByUser, getInstallmentsForMonth } from "./service.service";

export async function generateMonthlyReport(
  telegramUserId: string
): Promise<string | null> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(
    now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59
  );

  const monthStr = String(now.getMonth() + 1).padStart(2, "0");
  const dueMonth = `${now.getFullYear()}-${monthStr}`;

  const [expensesSnapshot, services, installments] = await Promise.all([
    getDb()
      .collection("expenses")
      .where("telegramUserId", "==", telegramUserId)
      .where("date", ">=", admin.firestore.Timestamp.fromDate(startOfMonth))
      .where("date", "<=", admin.firestore.Timestamp.fromDate(endOfMonth))
      .get(),
    getServicesByUser(telegramUserId),
    getInstallmentsForMonth(telegramUserId, dueMonth),
  ]);

  const hasNoData = expensesSnapshot.empty && services.length === 0;
  if (hasNoData) {
    return null;
  }

  const groupedByCategory: Record<string, Record<string, {
    displayName: string;
    total: number;
  }>> = {};

  let grandTotal = 0;

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
    groupedByCategory[categoryKey][subcategoryKey].total +=
      expenseData.amount;
    grandTotal += expenseData.amount;
  });

  const reportLines: string[] = [];
  reportLines.push(
    `*Reporte ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}*\n`
  );

  for (const [categoryId, subcategories] of
    Object.entries(groupedByCategory)) {
    const categoryTotal = Object.values(subcategories)
      .reduce((sum, subcategory) => sum + subcategory.total, 0);
    const categoryLabel = categoryId === "sin_categoria" ?
      "SIN CATEGORIA" :
      categoryId.toUpperCase();

    reportLines.push(`*${categoryLabel}* ${formatARS(categoryTotal)}`);

    for (const subcategory of Object.values(subcategories)) {
      reportLines.push(
        `  • ${subcategory.displayName}  ${formatARS(subcategory.total)}`
      );
    }
    reportLines.push("");
  }

  if (services.length > 0) {
    const installmentByServiceId = new Map(
      installments.map((installment) => [installment.serviceId, installment])
    );

    const servicesTotal = installments.reduce(
      (sum, installment) => sum + installment.amount, 0
    );
    grandTotal += servicesTotal;

    reportLines.push(`*SERVICIOS* ${formatARS(servicesTotal)}`);
    for (const service of services) {
      const installment = installmentByServiceId.get(service.id || "");
      if (installment) {
        const dueDate = installment.dueDate.toDate();
        const day = String(dueDate.getDate()).padStart(2, "0");
        const mo = String(dueDate.getMonth() + 1).padStart(2, "0");
        const dueSuffix = installment.isPaid ?
          "(Pagado) ✅" :
          `(vence ${day}/${mo})`;
        reportLines.push(
          `  • ${service.name}  ${formatARS(installment.amount)} ${dueSuffix}`
        );
      } else {
        reportLines.push(`  • ${service.name}  $ -`);
      }
    }
    reportLines.push("");
  }

  reportLines.push(`*Gasto total*  ${formatARS(grandTotal)}`);

  return reportLines.join("\n");
}
