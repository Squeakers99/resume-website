import {
  getBackendConnected,
  getStocksHistoryCached,
  getStocksPortfolioCached,
  getStocksStatusCached,
} from "@/lib/dashboard-cache";
import type { StocksHistory, StocksPortfolio, StocksStatus } from "@/lib/server-api";
import { Banner, Card, StatTile } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import AllocationDonut from "./AllocationDonut";
import { formatDayFromDate } from "@/lib/formatDate";
import ConnectCard from "./ConnectCard";
import PortfolioChart from "./PortfolioChart";
import styles from "./Stocks.module.css";

export const metadata = { title: "Stocks" };

const pnlTone = (n: number | null) =>
  n === null ? "default" : n >= 0 ? "positive" : "negative";

export default async function StocksPage() {
  const backendConnected = await getBackendConnected();

  let status: StocksStatus = "disconnected";
  let portfolio: StocksPortfolio | null = null;
  let history: StocksHistory | null = null;
  let fetchError: string | null = null;
  if (backendConnected) {
    status = await getStocksStatusCached();
    if (status === "connected") {
      ({ portfolio, error: fetchError } = await getStocksPortfolioCached());
      // Fetch history alongside the portfolio.
      if (portfolio) history = await getStocksHistoryCached();
    }
  }

  return (
    <main className={styles.stocksMain}>
      {!portfolio ? (
        <ConnectCard
          headline="Wealthsimple not connected"
          detail={
            !backendConnected
              ? "The backend is unreachable."
              : fetchError
                ? `Couldn't fetch the portfolio: ${fetchError}`
                : status === "never_connected"
                  ? "No Wealthsimple session on file. Connect below (or run pnpm ws:login in backend/)."
                  : "The Wealthsimple session expired. Reconnect below (or run pnpm ws:login in backend/)."
          }
          canConnect={backendConnected}
        />
      ) : (
        <>
          {portfolio.stale && (
            <Banner tone="warning">
              Wealthsimple is unreachable - showing data from{" "}
              {formatDayFromDate(new Date(portfolio.fetchedAt))}.
            </Banner>
          )}

          <section className={styles.summaryGrid} aria-label="Portfolio summary">
            <StatTile
              label="Total value"
              value={formatMoney(portfolio.summary.totalValue)}
              hint={`across ${portfolio.accounts.length} account${portfolio.accounts.length === 1 ? "" : "s"}`}
            />
            <StatTile
              label="Day P&L"
              value={
                portfolio.summary.dayPnl === null
                  ? "—"
                  : formatMoney(portfolio.summary.dayPnl, "CAD", { signed: true })
              }
              hint="1-day change"
              tone={pnlTone(portfolio.summary.dayPnl)}
            />
            <StatTile
              label="All-time P&L"
              value={
                portfolio.summary.totalPnl === null
                  ? "—"
                  : formatMoney(portfolio.summary.totalPnl, "CAD", { signed: true })
              }
              hint={
                portfolio.summary.totalPnlRate === null
                  ? ""
                  : `${(portfolio.summary.totalPnlRate * 100).toFixed(1)}% simple return`
              }
              tone={pnlTone(portfolio.summary.totalPnl)}
            />
          </section>

          <section className={styles.accountsStrip} aria-label="Accounts">
            {portfolio.accounts.map((account) => (
              <StatTile
                key={account.id}
                label={account.label}
                value={formatMoney(account.value, account.currency)}
                hint={account.currency}
              />
            ))}
          </section>

          <div className={styles.chartsRow}>
            <section className={styles.donutCard} aria-label="Allocation">
              <Card as="div" title="Allocation">
                <AllocationDonut
                  positions={portfolio.positions.map((p) => ({ symbol: p.symbol, value: p.value }))}
                />
              </Card>
            </section>
            <section className={styles.donutCard} aria-label="Portfolio over time">
              <PortfolioChart series={history?.series ?? []} />
            </section>
          </div>
        </>
      )}
    </main>
  );
}
