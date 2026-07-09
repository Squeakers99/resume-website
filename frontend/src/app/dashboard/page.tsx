import { getBackendStatus } from "@/lib/api";
import {
  getGoogleAccessToken,
  listGoogleEvents,
  type GoogleCalendarEvent,
} from "@/lib/google-calendar";
import { listTasks, type DashboardTask } from "@/lib/server-api";
import DashboardTitleSection from "./DashboardTitleSection";
import DashboardSwitcher from "./DashboardSwitcher";
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

  let tasks: DashboardTask[] = [];
  if (backendConnected) {
    tasks = await listTasks().catch(() => [] as DashboardTask[]);
  }

  let googleEvents: GoogleCalendarEvent[] = [];
  let googleConnected = false;
  const googleToken = await getGoogleAccessToken();
  if (googleToken) {
    try {
      googleEvents = await listGoogleEvents(googleToken);
      googleConnected = true;
    } catch {
      googleConnected = false;
    }
  }

  return (
    <main className={styles.wrapper}>
      <DashboardTitleSection backendConnected={backendConnected} />
      <DashboardSwitcher />

      <div className={styles.contentGrid}>
        <div className={styles.leftColumn}>
          <ProjectUploadSection />
        </div>
        <div className={styles.rightColumn}>
          <PortfolioTasksSection tasks={tasks} backendConnected={backendConnected} />
          <UpcomingEventsSection
            googleEvents={googleEvents}
            googleConnected={googleConnected}
          />
        </div>
      </div>
    </main>
  );
}
