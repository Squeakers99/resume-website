import { PageHeader } from "@/app/components/ui";
import {
  getGoogleAccessToken,
  listGoogleEvents,
  type GoogleCalendarEvent,
} from "@/lib/google-calendar";
import UpcomingEventsSection from "./UpcomingEventsSection";
import styles from "../Dashboard.module.css";

export const metadata = { title: "Calendar" };

export default async function CalendarPage() {
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
      <PageHeader title="Calendar" />
      <UpcomingEventsSection googleEvents={googleEvents} googleConnected={googleConnected} />
    </main>
  );
}
