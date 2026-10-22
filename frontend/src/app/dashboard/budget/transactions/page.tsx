import { getBackendConnected, getBudgetEntriesCached } from "@/lib/dashboard-cache";
import type { BudgetEntry } from "@/lib/server-api";
import styles from "../Budgeting.module.css";
import BudgetEntriesTable from "../BudgetEntriesTable";

export const metadata = { title: "Budget transactions" };

export default async function BudgetTransactionsPage() {
  const backendConnected = await getBackendConnected();
  const entries: BudgetEntry[] = backendConnected ? await getBudgetEntriesCached() : [];

  return (
    <main className={styles.lowerGrid}>
      <BudgetEntriesTable entries={entries} />
    </main>
  );
}
