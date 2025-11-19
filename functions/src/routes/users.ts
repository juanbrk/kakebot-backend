import { Router } from "express";
import * as admin from "firebase-admin";
import { authenticateUser } from "../middleware/auth";

export const usersRouter = Router();
const db = admin.firestore();

// Obtener perfil del usuario
usersRouter.get("/me", authenticateUser, async (req, res) => {
  try {
    const { uid } = req.user;

    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      id: userDoc.id,
      ...userDoc.data(),
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Error fetching user" });
  }
});

// Obtener miembros de la familia
usersRouter.get("/family", authenticateUser, async (req, res) => {
  try {
    const { familyId } = req.user;

    const snapshot = await db.collection("users")
      .where("familyId", "==", familyId)
      .get();

    const familyMembers = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({ members: familyMembers });
  } catch (error) {
    console.error("Error fetching family members:", error);
    res.status(500).json({ error: "Error fetching family members" });
  }
});
