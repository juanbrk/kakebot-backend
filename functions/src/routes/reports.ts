import { Router } from "express";
import * as admin from "firebase-admin";
import { authenticateUser } from "../middleware/auth";

export const reportsRouter = Router();
const db = admin.firestore();

// Obtener reporte mensual
reportsRouter.get("/monthly/:year/:month", authenticateUser, async (req, res) => {
  try {
    const { familyId } = req.user;
    const { year, month } = req.params;

    // Buscar reporte existente
    const reportSnapshot = await db.collection("reports")
      .where("familyId", "==", familyId)
      .where("year", "==", parseInt(year))
      .where("month", "==", parseInt(month))
      .limit(1)
      .get();

    if (!reportSnapshot.empty) {
      const report = {
        id: reportSnapshot.docs[0].id,
        ...reportSnapshot.docs[0].data(),
      };
      return res.json({ report });
    }

    // Si no existe, generar reporte on-demand
    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);

    const transactionsSnapshot = await db.collection("transactions")
      .where("familyId", "==", familyId)
      .where("date", ">=", startDate)
      .where("date", "<=", endDate)
      .get();

    let totalIncome = 0;
    let totalExpense = 0;
    const byCategory: Record<string, number> = {};

    transactionsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.type === "income") {
        totalIncome += data.amount;
      } else {
        totalExpense += data.amount;
      }

      if (!byCategory[data.category]) {
        byCategory[data.category] = 0;
      }
      byCategory[data.category] += data.amount;
    });

    const report = {
      familyId,
      year: parseInt(year),
      month: parseInt(month),
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      byCategory,
      generatedAt: new Date(),
    };

    res.json({ report });
  } catch (error) {
    console.error("Error generating report:", error);
    res.status(500).json({ error: "Error generating report" });
  }
});

// Obtener resumen del año
reportsRouter.get("/yearly/:year", authenticateUser, async (req, res) => {
  try {
    const { familyId } = req.user;
    const { year } = req.params;

    const reports = await db.collection("reports")
      .where("familyId", "==", familyId)
      .where("year", "==", parseInt(year))
      .orderBy("month", "asc")
      .get();

    const monthlyReports = reports.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({ reports: monthlyReports });
  } catch (error) {
    console.error("Error fetching yearly reports:", error);
    res.status(500).json({ error: "Error fetching yearly reports" });
  }
});
