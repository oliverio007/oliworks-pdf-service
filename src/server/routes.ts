import express from "express";
import { productionActionHandler } from "./productionActionHandler";

const router = express.Router();

/**
 * 🔍 Endpoint de prueba (GET)
 * Sirve para probar desde el navegador
 */
router.get("/test-production-action", (_req, res) => {
  res.json({
    ok: true,
    message: "Production action endpoint is alive ✅"
  });
});

/**
 * 🎯 Endpoint real (POST)
 * Este es el que usará el chat / app
 */
router.post("/production-action", productionActionHandler);

export default router;
