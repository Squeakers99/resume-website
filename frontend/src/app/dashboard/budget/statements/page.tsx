import { getBackendConnected, getBudgetStatementsCached } from "@/lib/dashboard-cache";
import type { BudgetStatement } from "@/lib/server-api";
import styles from "../Budgeting.module.css";
import BudgetUploadSection from "../BudgetUploadSection";

export const metadata = { title: "Budget statements" };

export default async function BudgetStatementsPage() {
  const backendConnected = await getBackendConnected();
  const statements: BudgetStatement[] = backendConnected
    ? await getBudgetStatementsCached()
    : [];

  return (
    <main className={styles.lowerGrid}>
      <BudgetUploadSection statements={statements} backendConnected={backendConnected} />
    </main>
  );
}
