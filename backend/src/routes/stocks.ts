import { Router } from "express";
import { randomUUID } from "crypto";
import {
  buildSummary,
  mapAccounts,
  mapChartQuotes,
  mapHistoryPoints,
  mapPositions,
  mapSecurityDetail,
  type PortfolioAccount,
  type PortfolioPosition,
  type PortfolioSummary,
  type SecurityDetail,
} from "../stocks/domain";
import { fetchCompanyNews, summarizeNews } from "../stocks/news";
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
    securityId: string;
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
        securityId: p.securityId,
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
      // Day P&L references the previous Toronto day's close (see wsClient).
      const raw = await client.fetchPortfolioRaw(torontoDateDaysAgo(1));
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

// ----- Per-security detail (modal) -----

const SECURITY_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const CHART_PERIODS = new Set(["ONE_DAY", "ONE_MONTH", "THREE_MONTHS", "ONE_YEAR", "FIVE_YEARS"]);
const DETAIL_TTL_MS = 10 * 60 * 1000;
const detailCache = new Map<string, { data: unknown; at: number }>();

function detailCacheGet<T>(key: string): T | null {
  const hit = detailCache.get(key);
  if (!hit || Date.now() - hit.at > DETAIL_TTL_MS) return null;
  return hit.data as T;
}

function detailCacheSet(key: string, data: unknown) {
  if (detailCache.size > 200) detailCache.clear();
  detailCache.set(key, { data, at: Date.now() });
}

// Shared guard for the per-security endpoints: 503s (and returns null) when
// no usable session exists, otherwise hands back a ready client.
async function getConnectedClient(res: import("express").Response): Promise<WsClient | null> {
  await ensureStocksTables();
  const row = await loadSession();
  if (!row) {
    res.status(503).json({
      error: "Wealthsimple is not connected — run pnpm ws:login in backend/",
      status: "never_connected",
    });
    return null;
  }
  if (row.status !== "connected") {
    res.status(503).json({
      error: "The Wealthsimple session expired — run pnpm ws:login in backend/",
      status: "disconnected",
    });
    return null;
  }
  return new WsClient(row.session, saveSession);
}

async function handleSecurityError(res: import("express").Response, error: unknown, what: string) {
  if (error instanceof WsAuthError) {
    console.error("Wealthsimple session unrecoverable", error);
    await markDisconnected();
    return res.status(503).json({
      error: "The Wealthsimple session expired — run pnpm ws:login in backend/",
      status: "disconnected",
    });
  }
  console.error(`Wealthsimple ${what} fetch failed`, error);
  res.status(502).json({ error: `Couldn't fetch ${what} from Wealthsimple` });
}

async function loadSecurityDetail(client: WsClient, id: string): Promise<SecurityDetail> {
  const cached = detailCacheGet<SecurityDetail>(`detail:${id}`);
  if (cached) return cached;
  const detail = mapSecurityDetail(await client.fetchSecurityMarketDataRaw(id));
  detailCacheSet(`detail:${id}`, detail);
  return detail;
}

router.get("/securities/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!SECURITY_ID_RE.test(id)) return res.status(400).json({ error: "Invalid security id" });
    const client = await getConnectedClient(res);
    if (!client) return;
    try {
      res.json(await loadSecurityDetail(client, id));
    } catch (error) {
      await handleSecurityError(res, error, "security details");
    }
  } catch (error) {
    console.error("Security detail route failed", error);
    res.status(500).json({ error: "Failed to load security details" });
  }
});

router.get("/securities/:id/chart", async (req, res) => {
  try {
    const id = req.params.id;
    if (!SECURITY_ID_RE.test(id)) return res.status(400).json({ error: "Invalid security id" });
    const period = typeof req.query.period === "string" ? req.query.period : "ONE_MONTH";
    if (!CHART_PERIODS.has(period)) return res.status(400).json({ error: "Invalid period" });
    const client = await getConnectedClient(res);
    if (!client) return;
    const key = `chart:${id}:${period}`;
    const cached = detailCacheGet<{ points: unknown }>(key);
    if (cached) return res.json(cached);
    try {
      const points = mapChartQuotes(await client.fetchSecurityChartRaw(id, period));
      const payload = { points };
      detailCacheSet(key, payload);
      res.json(payload);
    } catch (error) {
      await handleSecurityError(res, error, "price history");
    }
  } catch (error) {
    console.error("Security chart route failed", error);
    res.status(500).json({ error: "Failed to load price history" });
  }
});

router.get("/securities/:id/news", async (req, res) => {
  try {
    const id = req.params.id;
    if (!SECURITY_ID_RE.test(id)) return res.status(400).json({ error: "Invalid security id" });
    const client = await getConnectedClient(res);
    if (!client) return;
    const key = `news:${id}`;
    const cached = detailCacheGet<{ items: unknown }>(key);
    if (cached) return res.json(cached);
    try {
      const detail = await loadSecurityDetail(client, id);
      const items = await fetchCompanyNews(detail.name, detail.symbol);
      const tldr = await summarizeNews(detail.name, detail.symbol, items);
      const payload = { items, tldr };
      detailCacheSet(key, payload);
      res.json(payload);
    } catch (error) {
      await handleSecurityError(res, error, "news");
    }
  } catch (error) {
    console.error("Security news route failed", error);
    res.status(500).json({ error: "Failed to load news" });
  }
});

export default router;
