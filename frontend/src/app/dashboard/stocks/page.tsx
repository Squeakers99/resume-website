import { getBackendStatus } from "@/lib/api";
import {
  getStocksHistory,
  getStocksPortfolio,
  getStocksStatus,
  type StocksHistory,
  type StocksPortfolio,
  type StocksStatus,
} from "@/lib/server-api";
import DashboardTitleSection from "../DashboardTitleSection";
import dashStyles from "../Dashboard.module.css";
import AllocationDonut from "./AllocationDonut";
import ConnectCard from "./ConnectCard";
import PortfolioChart from "./PortfolioChart";
import PositionsSection from "./PositionsSection";
import styles from "./Stocks.module.css";

const money = (n: number, currency = "CAD") =>
  n.toLocaleString("en-CA", { style: "currency", currency });

const signedMoney = (n: number, currency = "CAD") =>
  `${n >= 0 ? "+" : ""}${money(n, currency)}`;

const pnlClass = (n: number | null) =>
  n === null ? "" : n >= 0 ? styles.gain : styles.loss;

export default async function StocksPage() {
  let backendConnected = false;
  try {
    backendConnected = (await getBackendStatus()) === "connected";
  } catch {
    backendConnected = false;
  }

  let status: StocksStatus = "disconnected";
  let portfolio: StocksPortfolio | null = null;
  let history: StocksHistory | null = null;
  let fetchError: string | null = null;
  if (backendConnected) {
    status = await getStocksStatus().catch(() => "disconnected" as const);
    if (status === "connected") {
      try {
        portfolio = await getStocksPortfolio();
        // Fetch history alongside the portfolio.
        history = await getStocksHistory().catch(() => null);
      } catch (error) {
        fetchError = error instanceof Error ? error.message : "Couldn't fetch the portfolio";
      }
    }
  }

  return (
    <main className={`${dashStyles.wrapper} ${styles.stocksRoot}`}>
      <DashboardTitleSection backendConnected={backendConnected} />

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
              Wealthsimple is unreachable — showing data from{" "}
              {new Date(portfolio.fetchedAt).toLocaleString("en-CA")}.
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
              <span className={styles.statHint}>since market open (Toronto)</span>
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

          <PositionsSection positions={portfolio.positions} />
        </>
      )}
    </main>
  );
}
