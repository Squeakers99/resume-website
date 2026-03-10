import { getBackendStatus } from "@/lib/api";
import DashboardTitleSection from "./DashboardTitleSection";
import PortfolioTasksSection from "./PortfolioTasksSection";
import ProjectUploadSection from "./ProjectUploadSection";
import UpcomingEventsSection from "./UpcomingEventsSection";
import styles from "./Dashboard.module.css";

export default async function DashboardPage() {
  let backendConnected = false;
  try {
    const backendStatus = await getBackendStatus();
    backendConnected = backendStatus === "connected";
  } catch {
    backendConnected = false;
  }

  return (
    <main className={styles.wrapper}>
      <DashboardTitleSection backendConnected={backendConnected} />

      <div className={styles.contentGrid}>
        <div className={styles.leftColumn}>
          <ProjectUploadSection />
        </div>
        <div className={styles.rightColumn}>
          <PortfolioTasksSection />
          <UpcomingEventsSection />
        </div>
      </div>
    </main>
  );
}
