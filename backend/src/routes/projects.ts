import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireApiKey } from "../middleware/auth";

const router = Router();

// Public: list projects
router.get("/", async (_req, res) => {
  const projects = await prisma.project.findMany({ orderBy: { createdAt: "desc" } });
  res.json(projects);
});

// Protected: create project
router.post("/", requireApiKey, async (req, res) => {
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
});

export default router;