import Link from "next/link";
import type { ReactNode, SVGProps } from "react";
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

const ICON_PROPS: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
};

// Card-title glyphs, matching the sidebar icons in the Overview artboard.
const SECTION_ICONS = {
  budget: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <path d="M16 14.5h2" />
    </>
  ),
  stocks: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  projects: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  tasks: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 12l3 3 5-6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </>
  ),
} satisfies Record<string, ReactNode>;

function CardTitle({ icon, children }: { icon: keyof typeof SECTION_ICONS; children: ReactNode }) {
  return (
    <span className={styles.overviewTitle}>
      <svg {...ICON_PROPS} width={18} height={18} strokeWidth={1.8} className={styles.overviewIcon}>
        {SECTION_ICONS[icon]}
      </svg>
      {children}
    </span>
  );
}

function OpenLink({ href }: { href: string }) {
  return (
    <Link href={href} className={styles.overviewLink}>
      Open
      <svg {...ICON_PROPS} width={14} height={14} strokeWidth={2}>
        <path d="M5 12h14" />
        <path d="M13 6l6 6-6 6" />
      </svg>
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
      <PageHeader
        title="Overview"
        description="Everything at a glance. Open an area for the full view."
      />

      <div className={styles.overviewGrid}>
        <Card
          title={<CardTitle icon="budget">Budget</CardTitle>}
          actions={<OpenLink href="/dashboard/budget" />}
        >
          <StatTile label="Current balance" value={budgetValue} hint={budgetHint} />
        </Card>
        <Card
          title={<CardTitle icon="stocks">Stocks</CardTitle>}
          actions={<OpenLink href="/dashboard/stocks" />}
        >
          <StatTile label="Total value" value={stocksValue} />
        </Card>
        <Card
          title={<CardTitle icon="projects">Projects</CardTitle>}
          actions={<OpenLink href="/dashboard/projects" />}
        >
          <StatTile label="Total projects" value={projectsValue} />
        </Card>
        <Card
          title={<CardTitle icon="tasks">Tasks</CardTitle>}
          actions={<OpenLink href="/dashboard/tasks" />}
        >
          <StatTile label="Open tasks" value={tasksValue} />
        </Card>
        <Card
          title={<CardTitle icon="calendar">Calendar</CardTitle>}
          actions={<OpenLink href="/dashboard/calendar" />}
        >
          <StatTile label="Next event" value={calendarValue} hint={calendarHint} />
        </Card>
      </div>
    </main>
  );
}
