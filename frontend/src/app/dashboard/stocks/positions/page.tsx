import {
  getBackendConnected,
  getStocksPortfolioCached,
  getStocksStatusCached,
} from "@/lib/dashboard-cache";
import type { StocksPortfolio, StocksStatus } from "@/lib/server-api";
import { Banner } from "@/app/components/ui";
import { formatDayFromDate } from "@/lib/formatDate";
import ConnectCard from "../ConnectCard";
import PositionsSection from "../PositionsSection";
import styles from "../Stocks.module.css";

export const metadata = { title: "Positions" };

export default async function StocksPositionsPage() {
  const backendConnected = await getBackendConnected();

  let status: StocksStatus = "disconnected";
  let portfolio: StocksPortfolio | null = null;
  let fetchError: string | null = null;
  if (backendConnected) {
    status = await getStocksStatusCached();
    if (status === "connected") {
      ({ portfolio, error: fetchError } = await getStocksPortfolioCached());
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
          <PositionsSection positions={portfolio.positions} />
        </>
      )}
    </main>
  );
}
