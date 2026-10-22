import "server-only";
import { cache } from "react";
import { getBackendStatus, getProjects, type Project } from "./api";
import {
  getBudgetInsights,
  getBudgetSummary,
  getStocksHistory,
  getStocksPortfolio,
  getStocksStatus,
  listBudgetEntries,
  listBudgetStatements,
  listTasks,
  type BudgetEntry,
  type BudgetInsights,
  type BudgetStatement,
  type BudgetSummary,
  type DashboardTask,
  type StocksHistory,
  type StocksPortfolio,
  type StocksStatus,
} from "./server-api";

export const getBackendConnected = cache(async (): Promise<boolean> => {
  try {
    return (await getBackendStatus()) === "connected";
  } catch {
    return false;
  }
});

// Per-request memoized fetchers. Each one swallows backend errors and returns
// the same fallback the pages used inline, so a layout and a page (or several
// sections) can share one fetch without duplicating try/catch.

export const EMPTY_BUDGET_SUMMARY: BudgetSummary = {
  latestCard: null,
  latestChequing: null,
  latestSavings: null,
  statementCount: 0,
  categoryTotals: [],
  cardBills: [],
  monthlyByCategory: [],
};

export const EMPTY_BUDGET_INSIGHTS: BudgetInsights = {
  projection: null,
  projectionSource: "trend",
  recommendations: null,
  generatedAt: null,
  stale: false,
};

export const getBudgetSummaryCached = cache(
  (): Promise<BudgetSummary> => getBudgetSummary().catch(() => EMPTY_BUDGET_SUMMARY),
);

// Unfiltered list only (what the page fetches); filtered queries stay uncached.
export const getBudgetEntriesCached = cache(
  (): Promise<BudgetEntry[]> => listBudgetEntries().catch(() => [] as BudgetEntry[]),
);

export const getBudgetStatementsCached = cache(
  (): Promise<BudgetStatement[]> =>
    listBudgetStatements().catch(() => [] as BudgetStatement[]),
);

export const getBudgetInsightsCached = cache(
  (): Promise<BudgetInsights> => getBudgetInsights().catch(() => EMPTY_BUDGET_INSIGHTS),
);

export const getStocksStatusCached = cache(
  (): Promise<StocksStatus> => getStocksStatus().catch(() => "disconnected" as const),
);

// The stocks page shows the portfolio error message, so the fallback keeps it.
export type StocksPortfolioResult = {
  portfolio: StocksPortfolio | null;
  error: string | null;
};

export const getStocksPortfolioCached = cache(
  (): Promise<StocksPortfolioResult> =>
    getStocksPortfolio()
      .then((portfolio): StocksPortfolioResult => ({ portfolio, error: null }))
      .catch(
        (error: unknown): StocksPortfolioResult => ({
          portfolio: null,
          error: error instanceof Error ? error.message : "Couldn't fetch the portfolio",
        }),
      ),
);

export const listTasksCached = cache(
  (): Promise<DashboardTask[]> => listTasks().catch(() => [] as DashboardTask[]),
);

export const getProjectsCached = cache(
  (): Promise<Project[]> => getProjects().catch(() => [] as Project[]),
);

// Portfolio-over-time series for the stocks overview; null on failure, as the page did inline.
export const getStocksHistoryCached = cache(
  (): Promise<StocksHistory | null> => getStocksHistory().catch(() => null),
);

// Result-shaped variants for the Overview, which must tell "empty" apart from
// "failed". They wrap the raw fetchers (not the swallowing ones above) and
// report the error message instead of a fallback value.
export type CachedResult<T> = { data: T | null; error: string | null };

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Request failed";

export const getBudgetSummaryResult = cache(
  async (): Promise<CachedResult<BudgetSummary>> => {
    try {
      return { data: await getBudgetSummary(), error: null };
    } catch (error) {
      return { data: null, error: errorMessage(error) };
    }
  },
);

export const getProjectsResult = cache(async (): Promise<CachedResult<Project[]>> => {
  try {
    return { data: await getProjects(), error: null };
  } catch (error) {
    return { data: null, error: errorMessage(error) };
  }
});

export const listTasksResult = cache(async (): Promise<CachedResult<DashboardTask[]>> => {
  try {
    return { data: await listTasks(), error: null };
  } catch (error) {
    return { data: null, error: errorMessage(error) };
  }
});
