import Link from "next/link";
import { Card, PageHeader, StatTile } from "@/app/components/ui";
import {
  getBackendConnected,
  getBudgetSummaryResult,
  getProjectsResult,
  getStocksPortfolioCached,
  getStocksStatusCached,
  listTasksResult,
} from "@/lib/dashboard-cache";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import {
  getGoogleAccessToken,
  listGoogleEvents,
  type GoogleCalendarEvent,
} from "@/lib/google-calendar";
import styles from "./Dashboard.module.css";

export const metadata = { title: "Overview" };

const UNAVAILABLE = "Unavailable";
const NOT_CONNECTED = "Not connected";

// Today as YYYY-MM-DD in Toronto time (en-CA formats dates as ISO), so the
// server's own time zone does not shift the day.
function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// First event that starts today or later, or is still running today (events
// come back ordered by start time).
function pickNextEvent(events: GoogleCalendarEvent[]): GoogleCalendarEvent | null {
  const today = todayIso();
  return events.find((e) => (e.endDate ?? e.date) >= today) ?? null;
}

function eventWhen(event: GoogleCalendarEvent): string {
  return event.time ? formatDateTime(`${event.date}T${event.time}`) : formatDate(event.date);
}

type CalendarResult =
  | { kind: "not-connected" }
  | { kind: "error" }
  | { kind: "ok"; next: GoogleCalendarEvent | null };

async function loadCalendar(): Promise<CalendarResult> {
  try {
    const googleToken = await getGoogleAccessToken();
    if (!googleToken) return { kind: "not-connected" };
    return { kind: "ok", next: pickNextEvent(await listGoogleEvents(googleToken)) };
  } catch {
    return { kind: "error" };
  }
}

// Portfolio is only fetched once the Wealthsimple session is known to be live.
async function loadStocks() {
  const status = await getStocksStatusCached();
  if (status !== "connected") return { status, portfolio: null, error: null };
  const { portfolio, error } = await getStocksPortfolioCached();
  return { status, portfolio, error };
}

function OpenLink({ href }: { href: string }) {
  return (
    <Link href={href} className={styles.overviewLink}>
      Open
    </Link>
  );
}

export default async function DashboardPage() {
  const backendConnected = await getBackendConnected();

  const [summary, stocks, projects, tasks, calendar] = await Promise.all([
    backendConnected ? getBudgetSummaryResult() : null,
    backendConnected ? loadStocks() : null,
    backendConnected ? getProjectsResult() : null,
    backendConnected ? listTasksResult() : null,
    loadCalendar(),
  ]);

  // "No statements" / "0" only show for genuine empty data; a backend that is
  // down or a request that failed reads "Unavailable".
  let budgetValue = UNAVAILABLE;
  let budgetHint: string | undefined;
  if (summary?.data) {
    const chequing = summary.data.latestChequing;
    budgetValue = chequing ? formatMoney(chequing.totalBalance) : "No statements";
    budgetHint = chequing ? `Chequing · as of ${formatDate(chequing.statementDate)}` : undefined;
  }

  let stocksValue = UNAVAILABLE;
  if (stocks) {
    if (stocks.status !== "connected") stocksValue = NOT_CONNECTED;
    else if (stocks.portfolio) stocksValue = formatMoney(stocks.portfolio.summary.totalValue);
  }

  const projectsValue = projects?.data ? String(projects.data.length) : UNAVAILABLE;
  const tasksValue = tasks?.data
    ? String(tasks.data.filter((t) => t.status !== "done").length)
    : UNAVAILABLE;

  let calendarValue: string;
  let calendarHint: string | undefined;
  if (calendar.kind === "error") {
    calendarValue = UNAVAILABLE;
  } else if (calendar.kind === "not-connected") {
    calendarValue = NOT_CONNECTED;
  } else if (calendar.next === null) {
    calendarValue = "No upcoming events";
  } else {
    calendarValue = calendar.next.title;
    calendarHint = eventWhen(calendar.next);
  }

  return (
    <main className={styles.wrapper}>
      <PageHeader title="Overview" />

      <div className={styles.overviewGrid}>
        <Card title="Budget" actions={<OpenLink href="/dashboard/budget" />}>
          <StatTile label="Current balance" value={budgetValue} hint={budgetHint} />
        </Card>
        <Card title="Stocks" actions={<OpenLink href="/dashboard/stocks" />}>
          <StatTile label="Total value" value={stocksValue} />
        </Card>
        <Card title="Projects" actions={<OpenLink href="/dashboard/projects" />}>
          <StatTile label="Total projects" value={projectsValue} />
        </Card>
        <Card title="Tasks" actions={<OpenLink href="/dashboard/tasks" />}>
          <StatTile label="Open tasks" value={tasksValue} />
        </Card>
        <Card title="Calendar" actions={<OpenLink href="/dashboard/calendar" />}>
          <StatTile label="Next event" value={calendarValue} hint={calendarHint} />
        </Card>
      </div>
    </main>
  );
}
