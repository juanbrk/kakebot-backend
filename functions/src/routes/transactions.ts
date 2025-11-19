import { Router } from "express";
import * as admin from "firebase-admin";
import { authenticateUser } from "../middleware/auth";

export const transactionsRouter = Router();
const db = admin.firestore();

// Obtener todas las transacciones de la familia
transactionsRouter.get("/", authenticateUser, async (req, res) => {
  try {
    const { familyId } = req.user;
    const { startDate, endDate, type, category } = req.query;

    let query = db.collection("transactions")
      .where("familyId", "==", familyId);

    if (type) {
      query = query.where("type", "==", type);
    }

    if (category) {
      query = query.where("category", "==", category);
    }

    const snapshot = await query.orderBy("date", "desc").limit(100).get();

    const transactions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({ transactions });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ error: "Error fetching transactions" });
  }
});

// Crear nueva transacción
transactionsRouter.post("/", authenticateUser, async (req, res) => {
  try {
    const { uid, familyId } = req.user;
    const transactionData = {
      ...req.body,
      familyId,
      userId: uid,
      createdBy: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection("transactions").add(transactionData);

    res.status(201).json({
      id: docRef.id,
      message: "Transaction created successfully",
    });
  } catch (error) {
    console.error("Error creating transaction:", error);
    res.status(500).json({ error: "Error creating transaction" });
  }
});

// Actualizar transacción
transactionsRouter.put("/:id", authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { uid } = req.user;

    const docRef = db.collection("transactions").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Verificar que el usuario sea el creador
    if (doc.data()?.userId !== uid) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await docRef.update({
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ message: "Transaction updated successfully" });
  } catch (error) {
    console.error("Error updating transaction:", error);
    res.status(500).json({ error: "Error updating transaction" });
  }
});

// Eliminar transacción
transactionsRouter.delete("/:id", authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { uid } = req.user;

    const docRef = db.collection("transactions").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Verificar que el usuario sea el creador
    if (doc.data()?.userId !== uid) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await docRef.delete();

    res.json({ message: "Transaction deleted successfully" });
  } catch (error) {
    console.error("Error deleting transaction:", error);
    res.status(500).json({ error: "Error deleting transaction" });
  }
});
