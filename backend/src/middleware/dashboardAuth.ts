import { timingSafeEqual } from "crypto";
import type { RequestHandler } from "express";

// Guards the personal dashboard API surface. The frontend server (never the
// browser) sends x-dashboard-key, which must match DASHBOARD_API_KEY.
export const requireDashboardKey: RequestHandler = (req, res, next) => {
  const expected = process.env.DASHBOARD_API_KEY;
  const provided = req.header("x-dashboard-key");

  if (!expected || !provided) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (
    expectedBuf.length !== providedBuf.length ||
    !timingSafeEqual(expectedBuf, providedBuf)
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
};
