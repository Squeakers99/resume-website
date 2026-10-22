import {
  EMPTY_BUDGET_INSIGHTS,
  getBackendConnected,
  getBudgetInsightsCached,
} from "@/lib/dashboard-cache";
import styles from "../Budgeting.module.css";
import BudgetInsightsSection from "../BudgetInsightsSection";

export const metadata = { title: "Budget insights" };

export default async function BudgetInsightsPage() {
  const backendConnected = await getBackendConnected();
  const insights = backendConnected ? await getBudgetInsightsCached() : EMPTY_BUDGET_INSIGHTS;

  return (
    <main className={styles.lowerGrid}>
      <BudgetInsightsSection insights={insights} />
    </main>
  );
}
