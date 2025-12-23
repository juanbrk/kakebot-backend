import * as admin from "firebase-admin";
import {
  YearlyReport,
  CategoryMonthlyData,
  MonthlyTotal,
  CategoryTotal,
  CurrencyEvolution,
  YearlySummary,
  MonthData,
} from "../../../../shared/types/reports";

const db = admin.firestore();

/**
 * Servicio para generación de reportes
 */
export class ReportsService {
  /**
   * Genera reporte anual completo con matriz de categorías x meses
   */
  async generateYearlyReport(
    familyId: string,
    year: number
  ): Promise<YearlyReport> {
    const startDate = new Date(year, 0, 1); // 1 de enero
    const endDate = new Date(year, 11, 31, 23, 59, 59); // 31 de diciembre

    // Obtener todas las transacciones del año
    const transactionsSnapshot = await db
      .collection("transactions")
      .where("familyId", "==", familyId)
      .where("date", ">=", startDate)
      .where("date", "<=", endDate)
      .get();

    // Obtener todas las categorías
    const categoriesSnapshot = await db.collection("categories").get();
    const categories = categoriesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Organizar transacciones por mes y categoría
    const expensesByMonthCategory: Record<string, Record<number, MonthData>> =
      {};
    const incomesByMonthCategory: Record<string, Record<number, MonthData>> =
      {};

    transactionsSnapshot.docs.forEach((doc) => {
      const transaction = doc.data();
      const date = transaction.date.toDate();
      const month = date.getMonth() + 1; // 1-12
      const categoryId = transaction.category;
      const type = transaction.type;

      const targetMap =
        type === "expense" ? expensesByMonthCategory : incomesByMonthCategory;

      if (!targetMap[categoryId]) {
        targetMap[categoryId] = {};
      }

      if (!targetMap[categoryId][month]) {
        targetMap[categoryId][month] = {
          month,
          total: 0,
          transactionCount: 0,
          breakdown: { ARS: 0, USD: 0, USDtoARS: 0 },
        };
      }

      // Sumar monto
      targetMap[categoryId][month].total += transaction.amount;
      targetMap[categoryId][month].transactionCount += 1;

      // Agregar a breakdown por moneda
      if (transaction.currency === "ARS") {
        targetMap[categoryId][month].breakdown!.ARS += transaction.amount;
      } else if (transaction.currency === "USD") {
        targetMap[categoryId][month].breakdown!.USD += transaction.amount;
        // TODO: Convertir USD a ARS usando tipo de cambio histórico
      }
    });

    // Construir matriz de gastos
    const expenseMatrix: CategoryMonthlyData[] = this.buildCategoryMatrix(
      expensesByMonthCategory,
      categories.filter((c) => c.type === "expense" || c.type === "both"),
      "expense"
    );

    // Construir matriz de ingresos
    const incomeMatrix: CategoryMonthlyData[] = this.buildCategoryMatrix(
      incomesByMonthCategory,
      categories.filter((c) => c.type === "income" || c.type === "both"),
      "income"
    );

    // Calcular totales mensuales
    const monthlyTotals = this.calculateMonthlyTotals(
      expenseMatrix,
      incomeMatrix,
      year
    );

    // Calcular totales por categoría
    const categoryTotals = this.calculateCategoryTotals([
      ...expenseMatrix,
      ...incomeMatrix,
    ]);

    // Calcular evolución de moneda
    const currencyEvolution = await this.calculateCurrencyEvolution(
      familyId,
      year
    );

    // Generar resumen del año
    const summary = this.generateYearlySummary(
      year,
      expenseMatrix,
      incomeMatrix,
      monthlyTotals,
      categoryTotals
    );

    return {
      id: `yearly-${familyId}-${year}`,
      familyId,
      year,
      expenseMatrix,
      incomeMatrix,
      monthlyTotals,
      categoryTotals,
      currencyEvolution,
      summary,
      generatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Construye matriz de categorías con datos mensuales
   */
  private buildCategoryMatrix(
    dataByMonthCategory: Record<string, Record<number, MonthData>>,
    categories: any[],
    type: "income" | "expense"
  ): CategoryMonthlyData[] {
    return categories.map((category) => {
      const categoryData = dataByMonthCategory[category.id] || {};
      const months: { [month: number]: MonthData } = {};
      let yearTotal = 0;
      let peakAmount = 0;
      let peakMonth = 1;

      // Llenar datos de cada mes (1-12)
      for (let month = 1; month <= 12; month++) {
        if (categoryData[month]) {
          months[month] = categoryData[month];
          yearTotal += categoryData[month].total;

          if (categoryData[month].total > peakAmount) {
            peakAmount = categoryData[month].total;
            peakMonth = month;
          }
        } else {
          months[month] = {
            month,
            total: 0,
            transactionCount: 0,
          };
        }
      }

      const monthlyAverage = yearTotal / 12;

      return {
        categoryId: category.id,
        categoryName: category.name,
        type,
        isFixed: category.isFixed || false,
        months,
        yearTotal,
        monthlyAverage,
        peakMonth,
        peakAmount,
      };
    });
  }

  /**
   * Calcula totales mensuales sumando todas las categorías
   */
  private calculateMonthlyTotals(
    expenseMatrix: CategoryMonthlyData[],
    incomeMatrix: CategoryMonthlyData[],
    year: number
  ): MonthlyTotal[] {
    const monthlyTotals: MonthlyTotal[] = [];

    for (let month = 1; month <= 12; month++) {
      let totalIncome = 0;
      let totalExpense = 0;

      // Sumar ingresos del mes
      incomeMatrix.forEach((category) => {
        totalIncome += category.months[month]?.total || 0;
      });

      // Sumar gastos del mes
      expenseMatrix.forEach((category) => {
        totalExpense += category.months[month]?.total || 0;
      });

      const balance = totalIncome - totalExpense;

      // Calcular comparación con mes anterior
      let comparison = undefined;
      if (month > 1) {
        const prevMonth = monthlyTotals[month - 2];
        comparison = {
          incomeChange: this.calculatePercentageChange(
            prevMonth.totalIncome,
            totalIncome
          ),
          expenseChange: this.calculatePercentageChange(
            prevMonth.totalExpense,
            totalExpense
          ),
          balanceChange: this.calculatePercentageChange(
            prevMonth.balance,
            balance
          ),
        };
      }

      monthlyTotals.push({
        month,
        year,
        totalIncome,
        totalExpense,
        balance,
        ARS: {
          income: totalIncome, // TODO: Separar por moneda
          expense: totalExpense,
          balance,
        },
        USD: {
          income: 0,
          expense: 0,
          balance: 0,
        },
        comparison,
      });
    }

    return monthlyTotals;
  }

  /**
   * Calcula totales por categoría para todo el año
   */
  private calculateCategoryTotals(
    allCategories: CategoryMonthlyData[]
  ): CategoryTotal[] {
    const totalIncome = allCategories
      .filter((c) => c.type === "income")
      .reduce((sum, c) => sum + c.yearTotal, 0);

    const totalExpense = allCategories
      .filter((c) => c.type === "expense")
      .reduce((sum, c) => sum + c.yearTotal, 0);

    return allCategories.map((category) => {
      const total = category.type === "income" ? totalIncome : totalExpense;
      const percentage = total > 0 ? (category.yearTotal / total) * 100 : 0;

      // Contar meses con actividad
      const monthsWithActivity = Object.values(category.months).filter(
        (m) => m.total > 0
      ).length;

      return {
        categoryId: category.categoryId,
        categoryName: category.categoryName,
        type: category.type,
        yearTotal: category.yearTotal,
        percentage,
        monthlyAverage: category.monthlyAverage,
        monthsWithActivity,
      };
    });
  }

  /**
   * Calcula evolución de cotización de moneda extranjera
   */
  private async calculateCurrencyEvolution(
    familyId: string,
    year: number
  ): Promise<CurrencyEvolution[]> {
    const evolution: CurrencyEvolution[] = [];

    for (let month = 1; month <= 12; month++) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);

      // Obtener operaciones de cambio del mes
      const exchangesSnapshot = await db
        .collection("currency_exchanges")
        .where("familyId", "==", familyId)
        .where("date", ">=", startDate)
        .where("date", "<=", endDate)
        .get();

      let totalBought = 0;
      let totalSold = 0;
      let totalRate = 0;
      let count = 0;

      exchangesSnapshot.docs.forEach((doc) => {
        const exchange = doc.data();
        if (exchange.type === "buy") {
          totalBought += exchange.amountUSD;
        } else if (exchange.type === "sell") {
          totalSold += exchange.amountUSD;
        }
        totalRate += exchange.exchangeRate;
        count++;
      });

      const averageRate = count > 0 ? totalRate / count : 0;

      evolution.push({
        month,
        year,
        totalARS: 0, // TODO: Calcular del reporte mensual
        exchangeRate: averageRate,
        totalUSD: 0,
        currencyOperations: {
          bought: totalBought,
          sold: totalSold,
          netChange: totalBought - totalSold,
        },
      });
    }

    return evolution;
  }

  /**
   * Genera resumen ejecutivo del año
   */
  private generateYearlySummary(
    year: number,
    expenseMatrix: CategoryMonthlyData[],
    incomeMatrix: CategoryMonthlyData[],
    monthlyTotals: MonthlyTotal[],
    categoryTotals: CategoryTotal[]
  ): YearlySummary {
    const totalIncome = monthlyTotals.reduce(
      (sum, m) => sum + m.totalIncome,
      0
    );
    const totalExpense = monthlyTotals.reduce(
      (sum, m) => sum + m.totalExpense,
      0
    );
    const balance = totalIncome - totalExpense;

    // Calcular gastos fijos vs variables
    const fixedExpenses = expenseMatrix
      .filter((c) => c.isFixed)
      .reduce((sum, c) => sum + c.yearTotal, 0);
    const variableExpenses = totalExpense - fixedExpenses;

    // Promedios mensuales
    const averageMonthlyIncome = totalIncome / 12;
    const averageMonthlyExpense = totalExpense / 12;
    const averageMonthlyBalance = balance / 12;

    // Mejor y peor mes
    let bestMonth = monthlyTotals[0];
    let worstMonth = monthlyTotals[0];
    monthlyTotals.forEach((month) => {
      if (month.balance > bestMonth.balance) bestMonth = month;
      if (month.balance < worstMonth.balance) worstMonth = month;
    });

    // Top 5 categorías de gastos
    const topExpenseCategories = categoryTotals
      .filter((c) => c.type === "expense")
      .sort((a, b) => b.yearTotal - a.yearTotal)
      .slice(0, 5)
      .map((c) => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        total: c.yearTotal,
        percentage: c.percentage,
      }));

    // Top 5 categorías de ingresos
    const topIncomeCategories = categoryTotals
      .filter((c) => c.type === "income")
      .sort((a, b) => b.yearTotal - a.yearTotal)
      .slice(0, 5)
      .map((c) => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        total: c.yearTotal,
        percentage: c.percentage,
      }));

    return {
      year,
      totalIncome,
      totalExpense,
      balance,
      fixedExpenses,
      variableExpenses,
      averageMonthlyIncome,
      averageMonthlyExpense,
      averageMonthlyBalance,
      bestMonth: {
        month: bestMonth.month,
        balance: bestMonth.balance,
      },
      worstMonth: {
        month: worstMonth.month,
        balance: worstMonth.balance,
      },
      topExpenseCategories,
      topIncomeCategories,
    };
  }

  /**
   * Calcula cambio porcentual entre dos valores
   */
  private calculatePercentageChange(
    oldValue: number,
    newValue: number
  ): number {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return ((newValue - oldValue) / oldValue) * 100;
  }
}

export const reportsService = new ReportsService();
