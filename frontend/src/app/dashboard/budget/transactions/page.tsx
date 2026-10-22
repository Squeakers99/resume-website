import {
  getBackendConnected,
  getBudgetEntriesCached,
  getBudgetStatementsCached,
} from "@/lib/dashboard-cache";
import type { BudgetEntry, BudgetStatement } from "@/lib/server-api";
import styles from "../Budgeting.module.css";
import BudgetEntriesTable from "../BudgetEntriesTable";

export const metadata = { title: "Budget transactions" };

export default async function BudgetTransactionsPage() {
  const backendConnected = await getBackendConnected();
  const entries: BudgetEntry[] = backendConnected ? await getBudgetEntriesCached() : [];
  // Already fetched by the budget layout; the per-request cache makes this free.
  const statements: BudgetStatement[] = backendConnected
    ? await getBudgetStatementsCached()
    : [];

  return (
    <main className={styles.lowerGrid}>
      <BudgetEntriesTable entries={entries} statements={statements} />
    </main>
  );
}
