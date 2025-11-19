import { Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";

// Extender el tipo Request para incluir información del usuario
declare global {
  namespace Express {
    interface Request {
      user: {
        uid: string;
        email: string;
        familyId: string;
        role: string;
      };
    }
  }
}

export async function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized - No token provided" });
    }

    const token = authHeader.split("Bearer ")[1];

    // Verificar el token de Firebase
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Obtener información adicional del usuario desde Firestore
    const userDoc = await admin.firestore()
      .collection("users")
      .doc(decodedToken.uid)
      .get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();

    // Agregar información del usuario al request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || "",
      familyId: userData?.familyId || "",
      role: userData?.role || "member",
    };

    next();
  } catch (error) {
    console.error("Error authenticating user:", error);
    return res.status(401).json({ error: "Unauthorized - Invalid token" });
  }
}
