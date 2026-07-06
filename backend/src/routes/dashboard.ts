import { Router } from "express";
import { prisma } from "../db/prisma";
import { createProjectHandler } from "./projects";

const router = Router();

const TASK_STATUSES = ["backlog", "todo", "progress", "done"];
const TASK_PRIORITIES = ["Low", "Medium", "High"];

let tablesReady = false;

async function ensureDashboardTables() {
  if (tablesReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS dashboard_tasks (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      title TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'Medium',
      status TEXT NOT NULL DEFAULT 'backlog',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Managed outside the Prisma schema (see routes/projects.ts raw reads).
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "public"."Project"
    ADD COLUMN IF NOT EXISTS "secondaryImages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
  `);

  tablesReady = true;
}

type TaskRow = {
  id: string;
  title: string;
  priority: string;
  status: string;
  created_at: Date;
};

const toTask = (row: TaskRow) => ({
  id: row.id,
  title: row.title,
  priority: row.priority,
  status: row.status,
  createdAt: row.created_at.toISOString(),
});

// ----- Tasks -----

router.get("/tasks", async (_req, res) => {
  try {
    await ensureDashboardTables();
    const rows = await prisma.$queryRaw<TaskRow[]>`
      SELECT id, title, priority, status, created_at
      FROM dashboard_tasks
      ORDER BY created_at ASC
    `;
    res.json(rows.map(toTask));
  } catch (error) {
    console.error("Failed to list tasks", error);
    res.status(500).json({ error: "Failed to list tasks" });
  }
});

router.post("/tasks", async (req, res) => {
  try {
    await ensureDashboardTables();
    const { title, priority, status } = req.body ?? {};

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "title is required" });
    }
    const safePriority = TASK_PRIORITIES.includes(priority) ? priority : "Medium";
    const safeStatus = TASK_STATUSES.includes(status) ? status : "backlog";

    const rows = await prisma.$queryRaw<TaskRow[]>`
      INSERT INTO dashboard_tasks (title, priority, status)
      VALUES (${title.trim()}, ${safePriority}, ${safeStatus})
      RETURNING id, title, priority, status, created_at
    `;
    res.status(201).json(toTask(rows[0]));
  } catch (error) {
    console.error("Failed to create task", error);
    res.status(500).json({ error: "Failed to create task" });
  }
});

router.patch("/tasks/:id", async (req, res) => {
  try {
    await ensureDashboardTables();
    const { status } = req.body ?? {};

    if (!TASK_STATUSES.includes(status)) {
      return res.status(400).json({ error: "invalid status" });
    }

    const rows = await prisma.$queryRaw<TaskRow[]>`
      UPDATE dashboard_tasks
      SET status = ${status}
      WHERE id = ${req.params.id}
      RETURNING id, title, priority, status, created_at
    `;
    if (rows.length === 0) {
      return res.status(404).json({ error: "task not found" });
    }
    res.json(toTask(rows[0]));
  } catch (error) {
    console.error("Failed to update task", error);
    res.status(500).json({ error: "Failed to update task" });
  }
});

router.delete("/tasks/:id", async (req, res) => {
  try {
    await ensureDashboardTables();
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      DELETE FROM dashboard_tasks
      WHERE id = ${req.params.id}
      RETURNING id
    `;
    if (rows.length === 0) {
      return res.status(404).json({ error: "task not found" });
    }
    res.status(204).end();
  } catch (error) {
    console.error("Failed to delete task", error);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

// ----- Projects (same handler as the public API's protected POST) -----

router.post("/projects", async (req, res, next) => {
  await ensureDashboardTables();
  return createProjectHandler(req, res, next);
});

// Set image URLs after the browser has uploaded to S3.
router.patch("/projects/:id", async (req, res) => {
  try {
    await ensureDashboardTables();
    const { imageUrl, secondaryImages } = req.body ?? {};

    if (imageUrl !== undefined && typeof imageUrl !== "string") {
      return res.status(400).json({ error: "imageUrl must be a string" });
    }
    if (
      secondaryImages !== undefined &&
      (!Array.isArray(secondaryImages) || secondaryImages.some((u) => typeof u !== "string"))
    ) {
      return res.status(400).json({ error: "secondaryImages must be a list of strings" });
    }

    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "public"."Project"
      SET "imageUrl" = COALESCE(${imageUrl ?? null}, "imageUrl"),
          "secondaryImages" = COALESCE(${secondaryImages ?? null}::text[], "secondaryImages")
      WHERE id = ${req.params.id}
      RETURNING id
    `;
    if (rows.length === 0) {
      return res.status(404).json({ error: "project not found" });
    }
    res.json({ id: rows[0].id });
  } catch (error) {
    console.error("Failed to update project images", error);
    res.status(500).json({ error: "Failed to update project images" });
  }
});

export default router;
