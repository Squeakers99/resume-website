import { EMPTY_BUDGET_SUMMARY, getBackendConnected, getBudgetSummaryCached } from "@/lib/dashboard-cache";
import { StatTile } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import styles from "./Budgeting.module.css";
import { formatDay } from "@/lib/formatDate";
import BudgetChartsSection from "./BudgetChartsSection";

export const metadata = { title: "Budget" };

export default async function BudgetingPage() {
  const backendConnected = await getBackendConnected();
  const summary = backendConnected ? await getBudgetSummaryCached() : EMPTY_BUDGET_SUMMARY;

  const { latestCard, latestChequing, latestSavings } = summary;

  return (
    <main className={styles.lowerGrid}>
      <section className={styles.tileGrid} aria-label="Current totals">
        <StatTile
          label="Current balance"
          value={latestChequing ? formatMoney(latestChequing.totalBalance) : "—"}
          hint={
            latestChequing
              ? `chequing · as of ${formatDay(latestChequing.statementDate)}`
              : "upload a chequing statement"
          }
        />
        <StatTile
          label="Savings"
          value={latestSavings ? formatMoney(latestSavings.totalBalance) : "—"}
          hint={latestSavings ? `as of ${formatDay(latestSavings.statementDate)}` : ""}
        />
        <StatTile
          label="Card balance"
          value={latestCard ? formatMoney(latestCard.totalBalance) : "—"}
          hint={latestCard ? `owing · as of ${formatDay(latestCard.statementDate)}` : ""}
        />
        <StatTile
          label="Card purchases this period"
          value={latestCard ? formatMoney(latestCard.purchasesTotal) : "—"}
          hint={
            latestCard
              ? `${formatDay(latestCard.periodStart)} → ${formatDay(latestCard.periodEnd)}`
              : ""
          }
        />
        <StatTile
          label="Statements on file"
          value={summary.statementCount}
          hint="across all accounts"
        />
      </section>

      <BudgetChartsSection
        categoryTotals={summary.categoryTotals}
        monthlyByCategory={summary.monthlyByCategory}
        cardBills={summary.cardBills}
      />
    </main>
  );
}
