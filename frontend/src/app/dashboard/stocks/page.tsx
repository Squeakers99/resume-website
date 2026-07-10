import { getBackendStatus } from "@/lib/api";
import {
  getStocksPortfolio,
  getStocksStatus,
  type StocksPortfolio,
  type StocksStatus,
} from "@/lib/server-api";
import DashboardTitleSection from "../DashboardTitleSection";
import dashStyles from "../Dashboard.module.css";
import AllocationDonut from "./AllocationDonut";
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
  let fetchError: string | null = null;
  if (backendConnected) {
    status = await getStocksStatus().catch(() => "disconnected" as const);
    if (status === "connected") {
      try {
        portfolio = await getStocksPortfolio();
      } catch (error) {
        fetchError = error instanceof Error ? error.message : "Couldn't fetch the portfolio";
      }
    }
  }

  return (
    <main className={`${dashStyles.wrapper} ${styles.stocksRoot}`}>
      <DashboardTitleSection backendConnected={backendConnected} />

      {!portfolio ? (
        <section className={styles.card} aria-label="Wealthsimple connection">
          <h2 className={styles.cardHeading}>Wealthsimple not connected</h2>
          <p className={styles.emptyText}>
            {!backendConnected
              ? "The backend is unreachable."
              : fetchError
                ? `Couldn't fetch the portfolio: ${fetchError}`
                : status === "never_connected"
                  ? "No Wealthsimple session on file. Run pnpm ws:login in backend/ to connect."
                  : "The Wealthsimple session expired. Run pnpm ws:login in backend/ to reconnect."}
          </p>
        </section>
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

          <div className={styles.lowerGrid}>
            <section className={styles.card} aria-label="Positions">
              <h2 className={styles.cardHeading}>Positions</h2>
              {portfolio.positions.length === 0 ? (
                <p className={styles.emptyText}>No open positions.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th className={styles.num}>Qty</th>
                        <th className={styles.num}>Price</th>
                        <th className={styles.num}>Value (CAD)</th>
                        <th className={styles.num}>Day</th>
                        <th className={styles.num}>Total return</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio.positions.map((p) => (
                        <tr key={`${p.symbol}-${p.accountIds.join(",")}`}>
                          <td className={styles.symbolCell}>
                            {p.symbol}
                            {p.exchange ? ` · ${p.exchange}` : ""}
                            <span className={styles.positionName}>{p.name}</span>
                          </td>
                          <td className={styles.num}>{p.quantity.toLocaleString("en-CA")}</td>
                          <td className={styles.num}>
                            {p.price === null ? "—" : money(p.price, p.currency)}
                          </td>
                          <td className={styles.num}>{money(p.value)}</td>
                          <td className={`${styles.num} ${pnlClass(p.dayChange)}`}>
                            {p.dayChange === null ? "—" : signedMoney(p.dayChange, p.currency)}
                          </td>
                          <td className={`${styles.num} ${pnlClass(p.totalReturn)}`}>
                            {p.totalReturn === null ? "—" : signedMoney(p.totalReturn)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className={`${styles.card} ${styles.donutCard}`} aria-label="Allocation">
              <h2 className={styles.cardHeading}>Allocation</h2>
              <AllocationDonut
                positions={portfolio.positions.map((p) => ({ symbol: p.symbol, value: p.value }))}
              />
            </section>
          </div>
        </>
      )}
    </main>
  );
}
