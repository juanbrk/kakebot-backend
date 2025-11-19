import { Router } from "express";
import { transactionsRouter } from "./transactions";
import { reportsRouter } from "./reports";
import { categoriesRouter } from "./categories";
import { usersRouter } from "./users";

export const apiRouter = Router();

// Rutas de la API
apiRouter.use("/transactions", transactionsRouter);
apiRouter.use("/reports", reportsRouter);
apiRouter.use("/categories", categoriesRouter);
apiRouter.use("/users", usersRouter);

// Ruta de health check
apiRouter.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});
