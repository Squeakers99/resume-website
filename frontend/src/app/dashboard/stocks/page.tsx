import {
  getBackendConnected,
  getStocksHistoryCached,
  getStocksPortfolioCached,
  getStocksStatusCached,
} from "@/lib/dashboard-cache";
import type { StocksHistory, StocksPortfolio, StocksStatus } from "@/lib/server-api";
import AllocationDonut from "./AllocationDonut";
import { formatDayFromDate } from "@/lib/formatDate";
import ConnectCard from "./ConnectCard";
import PortfolioChart from "./PortfolioChart";
import styles from "./Stocks.module.css";

export const metadata = { title: "Stocks" };

const money = (n: number, currency = "CAD") =>
  n.toLocaleString("en-CA", { style: "currency", currency });

const signedMoney = (n: number, currency = "CAD") =>
  `${n >= 0 ? "+" : ""}${money(n, currency)}`;

const pnlClass = (n: number | null) =>
  n === null ? "" : n >= 0 ? styles.gain : styles.loss;

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
    <main className={`${styles.stocksRoot} ${styles.stocksMain}`}>
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
            <p className={styles.warningBanner} role="alert">
              Wealthsimple is unreachable - showing data from{" "}
              {formatDayFromDate(new Date(portfolio.fetchedAt))}.
            </p>
          )}

          <section className={styles.statRow} aria-label="Portfolio summary">
            <div className={styles.statTile}>
              <span className={styles.statLabel}>Total value</span>
              <span className={styles.statValue}>{money(portfolio.summary.totalValue)}</span>
              <span className={styles.statHint}>
                across {portfolio.accounts.length} account
                {portfolio.accounts.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className={styles.statTile}>
              <span className={styles.statLabel}>Day P&amp;L</span>
              <span className={`${styles.statValue} ${pnlClass(portfolio.summary.dayPnl)}`}>
                {portfolio.summary.dayPnl === null ? "—" : signedMoney(portfolio.summary.dayPnl)}
              </span>
              <span className={styles.statHint}>1-day change</span>
            </div>
            <div className={styles.statTile}>
              <span className={styles.statLabel}>All-time P&amp;L</span>
              <span className={`${styles.statValue} ${pnlClass(portfolio.summary.totalPnl)}`}>
                {portfolio.summary.totalPnl === null
                  ? "—"
                  : signedMoney(portfolio.summary.totalPnl)}
              </span>
              <span className={styles.statHint}>
                {portfolio.summary.totalPnlRate === null
                  ? ""
                  : `${(portfolio.summary.totalPnlRate * 100).toFixed(1)}% simple return`}
              </span>
            </div>
          </section>

          <section className={styles.accountsStrip} aria-label="Accounts">
            {portfolio.accounts.map((account) => (
              <div key={account.id} className={styles.statTile}>
                <span className={styles.statLabel}>{account.label}</span>
                <span className={styles.statValue}>{money(account.value, account.currency)}</span>
                <span className={styles.statHint}>{account.currency}</span>
              </div>
            ))}
          </section>

          <div className={styles.chartsRow}>
            <section className={`${styles.card} ${styles.donutCard}`} aria-label="Allocation">
              <h2 className={styles.cardHeading}>Allocation</h2>
              <AllocationDonut
                positions={portfolio.positions.map((p) => ({ symbol: p.symbol, value: p.value }))}
              />
            </section>
            <section className={`${styles.card} ${styles.donutCard}`} aria-label="Portfolio over time">
              <PortfolioChart series={history?.series ?? []} />
            </section>
          </div>
        </>
      )}
    </main>
  );
}
