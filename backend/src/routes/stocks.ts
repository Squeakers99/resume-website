import { Router } from "express";
import {
  buildSummary,
  mapAccounts,
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
import { WsAuthError, WsClient } from "../stocks/wsClient";

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

const dollars = (cents: number) => Math.round(cents) / 100;
const optDollars = (cents: number | null) => (cents === null ? null : dollars(cents));

// Day P&L = simpleReturns since today's date in the market's timezone.
function torontoToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
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

export default router;
