import { Router } from "express";
import { prisma } from "../db/prisma";

const router = Router();

const SITE_VIEWS_KEY = "site_views";
let tableReady = false;

async function ensureMetricsTable() {
  if (tableReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS site_metrics (
      metric_key TEXT PRIMARY KEY,
      value BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  tableReady = true;
}

router.get("/views", async (_req, res) => {
  try {
    await ensureMetricsTable();
    const rows = await prisma.$queryRaw<Array<{ value: bigint | number }>>`
      SELECT value FROM site_metrics WHERE metric_key = ${SITE_VIEWS_KEY} LIMIT 1
    `;
    const rawValue = rows[0]?.value ?? 0;
    const views = typeof rawValue === "bigint" ? Number(rawValue) : rawValue;
    res.json({ views });
  } catch (error) {
    console.error("Failed to read site views", error);
    res.status(500).json({ error: "Failed to read site views" });
  }
});

router.post("/views/increment", async (_req, res) => {
  try {
    await ensureMetricsTable();
    const rows = await prisma.$queryRaw<Array<{ value: bigint | number }>>`
      INSERT INTO site_metrics (metric_key, value, updated_at)
      VALUES (${SITE_VIEWS_KEY}, 1, NOW())
      ON CONFLICT (metric_key)
      DO UPDATE SET value = site_metrics.value + 1, updated_at = NOW()
      RETURNING value
    `;
    const rawValue = rows[0]?.value ?? 0;
    const views = typeof rawValue === "bigint" ? Number(rawValue) : rawValue;
    res.json({ views });
  } catch (error) {
    console.error("Failed to increment site views", error);
    res.status(500).json({ error: "Failed to increment site views" });
  }
});

export default router;
