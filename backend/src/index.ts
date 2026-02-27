import "dotenv/config";
import express from "express";
import cors from "cors";
import projectsRouter from "./routes/projects";

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN?.split(",") ?? "*",
}));

app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/projects", projectsRouter);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));