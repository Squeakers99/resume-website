import { Router } from "express";
import { randomUUID } from "crypto";
import {
  buildSummary,
  mapAccounts,
  mapHistoryPoints,
  mapPositions,
  type PortfolioAccount,
  type PortfolioPosition,
  type PortfolioSummary,
} from "../stocks/domain";
import {
  ensureStocksTables,
  loadSession,
  markDisconnected,
  saveSession,
  writeDailySnapshot,
} from "../stocks/sessionStore";
import {
  bootstrapDeviceAndClient,
  loginWithPassword,
  OtpRequiredError,
  WsAuthError,
  WsClient,
} from "../stocks/wsClient";

const router = Router();

const CACHE_TTL_MS = 3 * 60 * 1000;

type PortfolioPayload = {
  summary: {
    totalValue: number;
    dayPnl: number | null;
    totalPnl: number | null;
    totalPnlRate: number | null;
  };
  accounts: Array<{ id: string; label: string; type: string; currency: string; value: number }>;
  positions: Array<{
    symbol: string;
    name: string;
    exchange: string | null;
    quantity: number;
    price: number | null;
    currency: string;
    value: number;
    dayChange: number | null;
    totalReturn: number | null;
    accountIds: string[];
  }>;
  fetchedAt: string;
  stale: boolean;
};

// Portfolio responses are cached in memory: page loads within the TTL don't
// hit Wealthsimple, and the last good payload doubles as a stale fallback.
let cache: { payload: PortfolioPayload; fetchedAt: number } | null = null;

type HistoryPayload = {
  series: Array<{ id: string; label: string; points: Array<{ date: string; value: number }> }>;
  fetchedAt: string;
  stale: boolean;
};

let historyCache: { payload: HistoryPayload; fetchedAt: number } | null = null;

const dollars = (cents: number) => Math.round(cents) / 100;
const optDollars = (cents: number | null) => (cents === null ? null : dollars(cents));

// Day P&L = simpleReturns since today's date in the market's timezone.
function torontoToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
}

function torontoDateDaysAgo(days: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(
    new Date(Date.now() - days * 86_400_000)
  );
}

function toPayload(
  summary: PortfolioSummary,
  accounts: PortfolioAccount[],
  positions: PortfolioPosition[]
): PortfolioPayload {
  return {
    summary: {
      totalValue: dollars(summary.totalValueCents),
      dayPnl: optDollars(summary.dayPnlCents),
      totalPnl: optDollars(summary.totalPnlCents),
      totalPnlRate: summary.totalPnlRate,
    },
    accounts: accounts.map((a) => ({
      id: a.id,
      label: a.label,
      type: a.type,
      currency: a.currency,
      value: dollars(a.valueCents),
    })),
    positions: positions
      .map((p) => ({
        symbol: p.symbol,
        name: p.name,
        exchange: p.exchange,
        quantity: p.quantity,
        price: optDollars(p.priceCents),
        currency: p.currency,
        value: dollars(p.valueCadCents),
        dayChange: optDollars(p.dayChangeCents),
        totalReturn: optDollars(p.totalReturnCadCents),
        accountIds: p.accountIds,
      }))
      .sort((a, b) => b.value - a.value),
    fetchedAt: new Date().toISOString(),
    stale: false,
  };
}

router.get("/status", async (_req, res) => {
  try {
    await ensureStocksTables();
    const row = await loadSession();
    res.json({ status: row ? row.status : "never_connected" });
  } catch (error) {
    console.error("Failed to read stocks session status", error);
    res.status(500).json({ error: "Failed to read Wealthsimple status" });
  }
});

// In-dashboard connect flow. The pending bootstrap lives in memory: the
// backend is a single instance, and losing it (restart) just means pressing
// Connect again. Credentials come from the backend env, never the browser —
// the browser only supplies the one-time 2FA code.
type PendingConnect = { wssdi: string; clientId: string; sessionId: string; startedAt: number };
let pendingConnect: PendingConnect | null = null;
const PENDING_CONNECT_TTL_MS = 10 * 60 * 1000;

router.post("/connect/start", async (_req, res) => {
  try {
    const email = process.env.WS_EMAIL;
    const password = process.env.WS_PASSWORD;
    if (!email || !password) {
      return res
        .status(503)
        .json({ error: "WS_EMAIL and WS_PASSWORD are not set on the backend" });
    }

    const { wssdi, clientId } = await bootstrapDeviceAndClient();
    const sessionId = randomUUID();
    try {
      // This attempt is what makes Wealthsimple issue the 2FA challenge
      // (and send the SMS code, for SMS users).
      const session = await loginWithPassword({ email, password, wssdi, clientId, sessionId });
      pendingConnect = null;
      await saveSession(session);
      cache = null;
      historyCache = null;
      return res.json({ otpRequired: false, connected: true });
    } catch (error) {
      if (error instanceof OtpRequiredError) {
        pendingConnect = { wssdi, clientId, sessionId, startedAt: Date.now() };
        return res.json({ otpRequired: true });
      }
      throw error;
    }
  } catch (error) {
    console.error("Wealthsimple connect start failed", error);
    res.status(502).json({ error: "Couldn't start the Wealthsimple login" });
  }
});

router.post("/connect/otp", async (req, res) => {
  try {
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!/^[a-zA-Z0-9-]{4,32}$/.test(code)) {
      return res.status(400).json({ error: "Enter the 2FA code" });
    }
    if (!pendingConnect || Date.now() - pendingConnect.startedAt > PENDING_CONNECT_TTL_MS) {
      pendingConnect = null;
      return res.status(409).json({ error: "No login in progress — press Connect again" });
    }
    const email = process.env.WS_EMAIL;
    const password = process.env.WS_PASSWORD;
    if (!email || !password) {
      return res
        .status(503)
        .json({ error: "WS_EMAIL and WS_PASSWORD are not set on the backend" });
    }

    try {
      const session = await loginWithPassword({
        email,
        password,
        otp: code,
        wssdi: pendingConnect.wssdi,
        clientId: pendingConnect.clientId,
        sessionId: pendingConnect.sessionId,
      });
      pendingConnect = null;
      await saveSession(session);
      cache = null;
      historyCache = null;
      res.json({ connected: true });
    } catch {
      // Almost always a wrong/expired code; keep the pending state for a retry.
      // Deliberately not logging the error object: nothing useful beyond the
      // WS error body, and the code itself must never be logged.
      res.status(401).json({ error: "Wealthsimple rejected the code — try again" });
    }
  } catch (error) {
    console.error("Wealthsimple connect otp failed", error);
    res.status(500).json({ error: "Failed to submit the code" });
  }
});

router.get("/portfolio", async (_req, res) => {
  try {
    await ensureStocksTables();

    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
      return res.json(cache.payload);
    }

    const row = await loadSession();
    if (!row) {
      return res.status(503).json({
        error: "Wealthsimple is not connected — run pnpm ws:login in backend/",
        status: "never_connected",
      });
    }
    if (row.status !== "connected") {
      return res.status(503).json({
        error: "The Wealthsimple session expired — run pnpm ws:login in backend/",
        status: "disconnected",
      });
    }

    const client = new WsClient(row.session, saveSession);
    try {
      const raw = await client.fetchPortfolioRaw(torontoToday());
      const accounts = mapAccounts(raw.accounts);
      const positions = mapPositions(raw.positions);
      const summary = buildSummary(raw.allTime, raw.today);

      const payload = toPayload(summary, accounts, positions);
      cache = { payload, fetchedAt: Date.now() };

      // Best-effort: a snapshot failure must not break the page.
      writeDailySnapshot(summary.totalValueCents, accounts, positions).catch((error) =>
        console.error("Failed to write stocks snapshot", error)
      );

      res.json(payload);
    } catch (error) {
      if (error instanceof WsAuthError) {
        console.error("Wealthsimple session unrecoverable", error);
        await markDisconnected();
        return res.status(503).json({
          error: "The Wealthsimple session expired — run pnpm ws:login in backend/",
          status: "disconnected",
        });
      }
      console.error("Wealthsimple portfolio fetch failed", error);
      if (cache) {
        return res.json({ ...cache.payload, stale: true });
      }
      res.status(502).json({ error: "Couldn't fetch the portfolio from Wealthsimple" });
    }
  } catch (error) {
    console.error("Stocks portfolio route failed", error);
    res.status(500).json({ error: "Failed to load portfolio" });
  }
});

router.get("/history", async (_req, res) => {
  try {
    await ensureStocksTables();

    if (historyCache && Date.now() - historyCache.fetchedAt < CACHE_TTL_MS) {
      return res.json(historyCache.payload);
    }

    const row = await loadSession();
    if (!row) {
      return res.status(503).json({
        error: "Wealthsimple is not connected — run pnpm ws:login in backend/",
        status: "never_connected",
      });
    }
    if (row.status !== "connected") {
      return res.status(503).json({
        error: "The Wealthsimple session expired — run pnpm ws:login in backend/",
        status: "disconnected",
      });
    }

    const client = new WsClient(row.session, saveSession);
    try {
      const startDate = torontoDateDaysAgo(365);
      const accounts = mapAccounts(await client.fetchAccountsRaw());
      const toSeriesPoints = (points: ReturnType<typeof mapHistoryPoints>) =>
        points.map((p) => ({ date: p.date, value: dollars(p.valueCents) }));

      const series = [
        {
          id: "all",
          label: "All",
          points: toSeriesPoints(mapHistoryPoints(await client.fetchHistoryRaw(null, startDate))),
        },
      ];
      for (const account of accounts) {
        series.push({
          id: account.id,
          label: account.label,
          points: toSeriesPoints(
            mapHistoryPoints(await client.fetchHistoryRaw([account.id], startDate))
          ),
        });
      }

      const payload: HistoryPayload = { series, fetchedAt: new Date().toISOString(), stale: false };
      historyCache = { payload, fetchedAt: Date.now() };
      res.json(payload);
    } catch (error) {
      if (error instanceof WsAuthError) {
        console.error("Wealthsimple session unrecoverable", error);
        await markDisconnected();
        return res.status(503).json({
          error: "The Wealthsimple session expired — run pnpm ws:login in backend/",
          status: "disconnected",
        });
      }
      console.error("Wealthsimple history fetch failed", error);
      if (historyCache) {
        return res.json({ ...historyCache.payload, stale: true });
      }
      res.status(502).json({ error: "Couldn't fetch portfolio history from Wealthsimple" });
    }
  } catch (error) {
    console.error("Stocks history route failed", error);
    res.status(500).json({ error: "Failed to load history" });
  }
});

export default router;
