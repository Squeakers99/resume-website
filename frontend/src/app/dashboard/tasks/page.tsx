import { PageHeader } from "@/app/components/ui";
import { getBackendConnected, listTasksCached } from "@/lib/dashboard-cache";
import type { DashboardTask } from "@/lib/server-api";
import PortfolioTasksSection from "./PortfolioTasksSection";
import styles from "../Dashboard.module.css";

export const metadata = { title: "Tasks" };

export default async function TasksPage() {
  const backendConnected = await getBackendConnected();

  let tasks: DashboardTask[] = [];
  if (backendConnected) {
    tasks = await listTasksCached();
  }

  return (
    <main className={styles.wrapper}>
      <PageHeader title="Tasks" />
      <PortfolioTasksSection tasks={tasks} backendConnected={backendConnected} />
    </main>
  );
}
