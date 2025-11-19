import { Router } from "express";
import * as admin from "firebase-admin";
import { authenticateUser } from "../middleware/auth";

export const categoriesRouter = Router();
const db = admin.firestore();

// Obtener todas las categorías
categoriesRouter.get("/", authenticateUser, async (req, res) => {
  try {
    const snapshot = await db.collection("categories").get();

    const categories = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({ categories });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Error fetching categories" });
  }
});

// Crear categoría (solo admin)
categoriesRouter.post("/", authenticateUser, async (req, res) => {
  try {
    // TODO: Verificar que el usuario sea admin
    const categoryData = {
      ...req.body,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection("categories").add(categoryData);

    res.status(201).json({
      id: docRef.id,
      message: "Category created successfully",
    });
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({ error: "Error creating category" });
  }
});
