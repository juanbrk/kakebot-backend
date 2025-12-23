import { Router } from "express";
import { authenticateUser } from "../middleware/auth";
import { reportsService } from "../services/reports.service";

export const yearlyReportsRouter = Router();

/**
 * GET /api/reports/yearly/:year
 * Obtener reporte anual completo con matriz de categorías x meses
 */
yearlyReportsRouter.get("/:year", authenticateUser, async (req, res) => {
  try {
    const { familyId } = req.user;
    const { year } = req.params;

    const yearNumber = parseInt(year);

    if (isNaN(yearNumber) || yearNumber < 2000 || yearNumber > 2100) {
      return res.status(400).json({ error: "Invalid year" });
    }

    const report = await reportsService.generateYearlyReport(
      familyId,
      yearNumber
    );

    res.json({ report });
  } catch (error) {
    console.error("Error generating yearly report:", error);
    res.status(500).json({ error: "Error generating yearly report" });
  }
});

/**
 * GET /api/reports/yearly/:year/summary
 * Obtener solo el resumen ejecutivo del año
 */
yearlyReportsRouter.get(
  "/:year/summary",
  authenticateUser,
  async (req, res) => {
    try {
      const { familyId } = req.user;
      const { year } = req.params;

      const yearNumber = parseInt(year);
      const report = await reportsService.generateYearlyReport(
        familyId,
        yearNumber
      );

      res.json({ summary: report.summary });
    } catch (error) {
      console.error("Error generating yearly summary:", error);
      res.status(500).json({ error: "Error generating yearly summary" });
    }
  }
);

/**
 * GET /api/reports/yearly/:year/category/:categoryId
 * Obtener evolución anual de una categoría específica
 */
yearlyReportsRouter.get(
  "/:year/category/:categoryId",
  authenticateUser,
  async (req, res) => {
    try {
      const { familyId } = req.user;
      const { year, categoryId } = req.params;

      const yearNumber = parseInt(year);
      const report = await reportsService.generateYearlyReport(
        familyId,
        yearNumber
      );

      // Buscar categoría en matriz de gastos o ingresos
      const categoryData =
        report.expenseMatrix.find((c) => c.categoryId === categoryId) ||
        report.incomeMatrix.find((c) => c.categoryId === categoryId);

      if (!categoryData) {
        return res.status(404).json({ error: "Category not found" });
      }

      res.json({ category: categoryData });
    } catch (error) {
      console.error("Error fetching category data:", error);
      res.status(500).json({ error: "Error fetching category data" });
    }
  }
);

/**
 * GET /api/reports/yearly/:year/export
 * Exportar reporte anual (PDF, Excel, CSV)
 */
yearlyReportsRouter.get("/:year/export", authenticateUser, async (req, res) => {
  try {
    const { familyId } = req.user;
    const { year } = req.params;
    const { format = "csv" } = req.query;

    const yearNumber = parseInt(year);
    const report = await reportsService.generateYearlyReport(
      familyId,
      yearNumber
    );

    // TODO: Implementar exportación según formato
    switch (format) {
      case "csv":
        // Generar CSV
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="reporte-${year}.csv"`
        );
        res.send("TODO: Implementar exportación CSV");
        break;

      case "excel":
        // Generar Excel
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="reporte-${year}.xlsx"`
        );
        res.send("TODO: Implementar exportación Excel");
        break;

      case "pdf":
        // Generar PDF
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="reporte-${year}.pdf"`
        );
        res.send("TODO: Implementar exportación PDF");
        break;

      default:
        res.status(400).json({ error: "Invalid export format" });
    }
  } catch (error) {
    console.error("Error exporting report:", error);
    res.status(500).json({ error: "Error exporting report" });
  }
});

/**
 * GET /api/reports/yearly/:year/charts
 * Obtener datos preparados para gráficos
 */
yearlyReportsRouter.get("/:year/charts", authenticateUser, async (req, res) => {
  try {
    const { familyId } = req.user;
    const { year } = req.params;

    const yearNumber = parseInt(year);
    const report = await reportsService.generateYearlyReport(
      familyId,
      yearNumber
    );

    // Preparar datos para gráfico de evolución mensual
    const evolutionChart = {
      type: "line",
      data: report.monthlyTotals.map((m) => ({
        label: getMonthName(m.month),
        income: m.totalIncome,
        expense: m.totalExpense,
        balance: m.balance,
      })),
    };

    // Preparar datos para gráfico de torta de categorías
    const categoryPieChart = {
      type: "pie",
      data: report.summary.topExpenseCategories.map((c) => ({
        label: c.categoryName,
        value: c.total,
        percentage: c.percentage,
      })),
    };

    res.json({
      charts: {
        evolution: evolutionChart,
        categoryBreakdown: categoryPieChart,
      },
    });
  } catch (error) {
    console.error("Error generating chart data:", error);
    res.status(500).json({ error: "Error generating chart data" });
  }
});

// Helper function
function getMonthName(month: number): string {
  const months = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  return months[month - 1];
}
