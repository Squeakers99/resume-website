import { Router } from "express";
import type { RequestHandler } from "express";
import { prisma } from "../db/prisma";
import { requireApiKey } from "../middleware/auth";

const router = Router();

// Public: list projects. Raw SQL because "secondaryImages" is managed
// outside the Prisma schema (added lazily in routes/dashboard.ts).
router.get("/", async (_req, res) => {
  try {
    const projects = await prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        description: string;
        githubUrl: string;
        imageUrl: string;
        tags: string[];
        secondaryImages: string[];
        createdAt: Date;
      }>
    >`
      SELECT id, title, description, "githubUrl", "imageUrl", tags,
             COALESCE("secondaryImages", ARRAY[]::TEXT[]) AS "secondaryImages",
             "createdAt"
      FROM "public"."Project"
      ORDER BY "createdAt" DESC
    `;
    res.json(projects);
  } catch (error) {
    // Before the column exists (fresh DB, dashboard never hit), fall back.
    try {
      const projects = await prisma.project.findMany({ orderBy: { createdAt: "desc" } });
      res.json(projects.map((p) => ({ ...p, secondaryImages: [] })));
    } catch (fallbackError) {
      console.error("Failed to list projects", fallbackError);
      res.status(500).json({ error: "Failed to list projects" });
    }
  }
});

// Shared create handler, also mounted under /api/dashboard/projects
export const createProjectHandler: RequestHandler = async (req, res) => {
  const { title, description, githubUrl, tags, imageUrl } = req.body;

  if (!title || !description) {
    return res.status(400).json({ error: "title and description are required" });
  }

  const created = await prisma.project.create({
    data: {
      title,
      description,
      githubUrl: githubUrl ?? "",
      tags: tags ?? [],
      imageUrl: imageUrl ?? ""
    } as any
  });

  res.status(201).json(created);
};

// Protected: create project
router.post("/", requireApiKey, createProjectHandler);

export default router;