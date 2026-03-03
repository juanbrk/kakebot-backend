import * as admin from "firebase-admin";
import { getDb } from "./db";
import { formatARS, MONTH_NAMES } from "../helpers/format";

export async function generateMonthlyReport(
  telegramUserId: string
): Promise<string | null> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(
    now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59
  );

  const expensesSnapshot = await getDb()
    .collection("expenses")
    .where("telegramUserId", "==", telegramUserId)
    .where("date", ">=", admin.firestore.Timestamp.fromDate(startOfMonth))
    .where("date", "<=", admin.firestore.Timestamp.fromDate(endOfMonth))
    .get();

  if (expensesSnapshot.empty) {
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

  reportLines.push(`*Gasto total*  ${formatARS(grandTotal)}`);

  return reportLines.join("\n");
}
