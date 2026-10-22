import { EMPTY_BUDGET_SUMMARY, getBackendConnected, getBudgetSummaryCached } from "@/lib/dashboard-cache";
import styles from "./Budgeting.module.css";
import { formatDay } from "@/lib/formatDate";
import BudgetChartsSection from "./BudgetChartsSection";

export const metadata = { title: "Budget" };

const money = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });

export default async function BudgetingPage() {
  const backendConnected = await getBackendConnected();
  const summary = backendConnected ? await getBudgetSummaryCached() : EMPTY_BUDGET_SUMMARY;

  const { latestCard, latestChequing, latestSavings } = summary;

  return (
    <main className={styles.lowerGrid}>
      <section className={styles.statRow} aria-label="Current totals">
        <div className={styles.statTile}>
          <span className={styles.statLabel}>Current balance</span>
          <span className={styles.statValue}>
            {latestChequing ? money(latestChequing.totalBalance) : "—"}
          </span>
          <span className={styles.statHint}>
            {latestChequing
              ? `chequing · as of ${formatDay(latestChequing.statementDate)}`
              : "upload a chequing statement"}
          </span>
        </div>
        <div className={styles.statTile}>
          <span className={styles.statLabel}>Savings</span>
          <span className={styles.statValue}>
            {latestSavings ? money(latestSavings.totalBalance) : "—"}
          </span>
          <span className={styles.statHint}>
            {latestSavings ? `as of ${formatDay(latestSavings.statementDate)}` : ""}
          </span>
        </div>
        <div className={styles.statTile}>
          <span className={styles.statLabel}>Card balance</span>
          <span className={styles.statValue}>
            {latestCard ? money(latestCard.totalBalance) : "—"}
          </span>
          <span className={styles.statHint}>
            {latestCard ? `owing · as of ${formatDay(latestCard.statementDate)}` : ""}
          </span>
        </div>
        <div className={styles.statTile}>
          <span className={styles.statLabel}>Card purchases this period</span>
          <span className={styles.statValue}>
            {latestCard ? money(latestCard.purchasesTotal) : "—"}
          </span>
          <span className={styles.statHint}>
            {latestCard
              ? `${formatDay(latestCard.periodStart)} → ${formatDay(latestCard.periodEnd)}`
              : ""}
          </span>
        </div>
        <div className={styles.statTile}>
          <span className={styles.statLabel}>Statements on file</span>
          <span className={styles.statValue}>{summary.statementCount}</span>
          <span className={styles.statHint}>across all accounts</span>
        </div>
      </section>

      <BudgetChartsSection
        categoryTotals={summary.categoryTotals}
        monthlyByCategory={summary.monthlyByCategory}
        cardBills={summary.cardBills}
      />
    </main>
  );
}
