import "dotenv/config";
import express from "express";
import cors from "cors";
import projectsRouter from "./routes/projects";
import metricsRouter from "./routes/metrics";
import dashboardRouter from "./routes/dashboard";
import { requireDashboardKey } from "./middleware/dashboardAuth";

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN?.split(",") ?? "*",
}));

app.use(express.json());

// [HTTP] one line per request: method, path, status, duration.
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    console.log(
      `[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt}ms)`
    );
  });
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/projects", projectsRouter);
app.use("/api/metrics", metricsRouter);
app.use("/api/dashboard", requireDashboardKey, dashboardRouter);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () =>
  console.log(
    `[SERVER] API running on http://localhost:${port} (env: ${process.env.NODE_ENV ?? "development"})`
  )
);
