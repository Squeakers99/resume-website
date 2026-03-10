import { getBackendStatus } from "@/lib/api";
import DashboardTitleSection from "./DashboardTitleSection";
import PortfolioTasksSection from "./PortfolioTasksSection";
import ProjectUploadSection from "./ProjectUploadSection";
import UpcomingEventsSection from "./UpcomingEventsSection";
import styles from "./Dashboard.module.css";

export default async function DashboardPage() {
  // #region agent log
  if (typeof fetch !== "undefined") {
    fetch("http://127.0.0.1:7317/ingest/8b4e811e-3fb3-4639-815b-3daaeaa642e8", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "09ea6a" },
      body: JSON.stringify({
        sessionId: "09ea6a",
        location: "page.tsx:DashboardPage",
        message: "DashboardPage server render",
        data: {},
        timestamp: Date.now(),
        hypothesisId: "H2",
      }),
    }).catch(() => {});
  }
  // #endregion
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
