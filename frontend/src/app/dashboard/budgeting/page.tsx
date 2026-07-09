import { getBackendStatus } from "@/lib/api";
import {
  getBudgetSummary,
  listBudgetEntries,
  listBudgetStatements,
  type BudgetEntry,
  type BudgetStatement,
  type BudgetSummary,
} from "@/lib/server-api";
import DashboardTitleSection from "../DashboardTitleSection";
import dashStyles from "../Dashboard.module.css";
import styles from "./Budgeting.module.css";
import BudgetUploadSection from "./BudgetUploadSection";
import BudgetEntriesTable from "./BudgetEntriesTable";
import BudgetChartsSection from "./BudgetChartsSection";

const money = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });

export default async function BudgetingPage() {
  let backendConnected = false;
  try {
    backendConnected = (await getBackendStatus()) === "connected";
  } catch {
    backendConnected = false;
  }

  let summary: BudgetSummary = {
    latestCard: null,
    latestChequing: null,
    latestSavings: null,
    statementCount: 0,
    categoryTotals: [],
    monthlyByCategory: [],
  };
  let entries: BudgetEntry[] = [];
  let statements: BudgetStatement[] = [];
  if (backendConnected) {
    [summary, entries, statements] = await Promise.all([
      getBudgetSummary().catch(() => summary),
      listBudgetEntries().catch(() => [] as BudgetEntry[]),
      listBudgetStatements().catch(() => [] as BudgetStatement[]),
    ]);
  }

  const { latestCard, latestChequing, latestSavings } = summary;

  return (
    <main className={dashStyles.wrapper}>
      <DashboardTitleSection backendConnected={backendConnected} />

      {statements.some((s) => s.validationStatus === "mismatch") && (
        <p className={styles.warningBanner} role="alert">
          Some statements failed totals validation — review or delete them below.
        </p>
      )}

      <section className={styles.statRow} aria-label="Current totals">
        <div className={styles.statTile}>
          <span className={styles.statLabel}>Current balance</span>
          <span className={styles.statValue}>
            {latestChequing ? money(latestChequing.totalBalance) : "—"}
          </span>
          <span className={styles.statHint}>
            {latestChequing
              ? `chequing · as of ${latestChequing.statementDate}`
              : "upload a chequing statement"}
          </span>
        </div>
        <div className={styles.statTile}>
          <span className={styles.statLabel}>Savings</span>
          <span className={styles.statValue}>
            {latestSavings ? money(latestSavings.totalBalance) : "—"}
          </span>
          <span className={styles.statHint}>
            {latestSavings ? `as of ${latestSavings.statementDate}` : ""}
          </span>
        </div>
        <div className={styles.statTile}>
          <span className={styles.statLabel}>Card balance</span>
          <span className={styles.statValue}>
            {latestCard ? money(latestCard.totalBalance) : "—"}
          </span>
          <span className={styles.statHint}>
            {latestCard ? `owing · as of ${latestCard.statementDate}` : ""}
          </span>
        </div>
        <div className={styles.statTile}>
          <span className={styles.statLabel}>Card purchases this period</span>
          <span className={styles.statValue}>
            {latestCard ? money(latestCard.purchasesTotal) : "—"}
          </span>
          <span className={styles.statHint}>
            {latestCard ? `${latestCard.periodStart} → ${latestCard.periodEnd}` : ""}
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
      />

      <div className={styles.lowerGrid}>
        <BudgetUploadSection
          statements={statements}
          backendConnected={backendConnected}
        />
        <BudgetEntriesTable entries={entries} />
      </div>
    </main>
  );
}
