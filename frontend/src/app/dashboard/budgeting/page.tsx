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
    latest: null,
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

  const latest = summary.latest;
  const periodSpend = latest
    ? summary.monthlyByCategory
        .filter((m) => m.month === latest.periodEnd.slice(0, 7))
        .reduce((sum, m) => sum + m.total, 0)
    : 0;

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
            {latest ? money(latest.totalBalance) : "—"}
          </span>
          <span className={styles.statHint}>
            {latest ? `as of ${latest.statementDate}` : "upload a statement"}
          </span>
        </div>
        <div className={styles.statTile}>
          <span className={styles.statLabel}>Purchases this period</span>
          <span className={styles.statValue}>
            {latest ? money(latest.purchasesTotal) : "—"}
          </span>
          <span className={styles.statHint}>
            {latest ? `${latest.periodStart} → ${latest.periodEnd}` : ""}
          </span>
        </div>
        <div className={styles.statTile}>
          <span className={styles.statLabel}>Payments this period</span>
          <span className={styles.statValue}>
            {latest ? money(latest.paymentsCredits) : "—"}
          </span>
          <span className={styles.statHint}>
            {latest ? `spend tracked ${money(periodSpend)}` : ""}
          </span>
        </div>
        <div className={styles.statTile}>
          <span className={styles.statLabel}>Statements on file</span>
          <span className={styles.statValue}>{summary.statementCount}</span>
          <span className={styles.statHint}>{latest?.source ?? ""}</span>
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
