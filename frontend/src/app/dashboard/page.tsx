import { PageHeader } from "@/app/components/ui";
import { getBackendConnected } from "@/lib/dashboard-cache";
import {
  getGoogleAccessToken,
  listGoogleEvents,
  type GoogleCalendarEvent,
} from "@/lib/google-calendar";
import { listTasks, type DashboardTask } from "@/lib/server-api";
import PortfolioTasksSection from "./PortfolioTasksSection";
import ProjectUploadSection from "./ProjectUploadSection";
import UpcomingEventsSection from "./UpcomingEventsSection";
import styles from "./Dashboard.module.css";
import shellStyles from "./_shell/Shell.module.css";

export default async function DashboardPage() {
  const backendConnected = await getBackendConnected();

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
      <PageHeader title="Overview" />

      <div className={styles.contentGrid}>
        <div id="projects" className={`${styles.leftColumn} ${shellStyles.hashTarget}`}>
          <ProjectUploadSection />
        </div>
        <div className={styles.rightColumn}>
          <div id="tasks" className={shellStyles.hashTarget}>
            <PortfolioTasksSection tasks={tasks} backendConnected={backendConnected} />
          </div>
          <div id="calendar" className={shellStyles.hashTarget}>
            <UpcomingEventsSection
              googleEvents={googleEvents}
              googleConnected={googleConnected}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
