"use client";

import { useMemo, useState, useTransition } from "react";
import { Banner, Card, EmptyState } from "@/app/components/ui";
import { formatDate } from "@/lib/format";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import { addEventAction, deleteEventAction, type ActionResult } from "../actions";
import styles from "../Dashboard.module.css";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Spelled-out month names for the day-cell aria-labels only; visible dates use
// lib/format.
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Calendar nav headers keep the year and weekday visible ("Jun 2026",
// "Fri, Jun 5 2026"); the agenda and task dates stay on lib/format.
const MONTH_HEADER_FMT = new Intl.DateTimeFormat("en-CA", { month: "short", year: "numeric" });
const DAY_HEADER_FMT = new Intl.DateTimeFormat("en-CA", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDayHeader(date: Date) {
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    DAY_HEADER_FMT.formatToParts(date).find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")}, ${part("month")} ${part("day")} ${part("year")}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function dateKey(year: number, monthIndex: number, day: number) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  return dateKey(next.getFullYear(), next.getMonth(), next.getDate());
}

const AGENDA_LIMIT = 10;
const MAX_SPAN_DAYS = 90;

type CalendarItem = {
  id: string;
  title: string;
  date: string;
  time?: string;
};

type Props = {
  googleEvents: GoogleCalendarEvent[];
  googleConnected: boolean;
};

export default function UpcomingEventsSection({ googleEvents, googleConnected }: Props) {
  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
    day: today.getDate(),
  });
  const [tab, setTab] = useState<"Day" | "Month" | "Agenda">("Month");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Multi-day events appear on every day they span.
  const items = useMemo<CalendarItem[]>(() => {
    const expanded = googleEvents.flatMap((e) => {
      const last = e.endDate && e.endDate > e.date ? e.endDate : e.date;
      const days: CalendarItem[] = [];
      for (
        let date = e.date, guard = 0;
        date <= last && guard < MAX_SPAN_DAYS;
        date = addDays(date, 1), guard++
      ) {
        days.push({
          id: e.id,
          title: e.title,
          date,
          time: date === e.date ? e.time : undefined,
        });
      }
      return days;
    });

    return expanded.sort(
      (a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "")
    );
  }, [googleEvents]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      map.set(item.date, [...(map.get(item.date) ?? []), item]);
    }
    return map;
  }, [items]);

  // Agenda: one entry per event (multi-day events collapse to their next
  // remaining day, so ongoing ones surface under today).
  const upcoming = useMemo(() => {
    const seen = new Set<string>();
    const result: CalendarItem[] = [];
    for (const item of items) {
      if (item.date < todayKey) continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      result.push(item);
    }
    return result;
  }, [items, todayKey]);

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong");
    });
  }

  function handleAdd(formData: FormData) {
    const title = String(formData.get("title") ?? "").trim();
    const date = String(formData.get("date") ?? "");
    if (!title || !date) return;
    run(() => addEventAction({ title, date }));
  }

  function renderItem(item: CalendarItem, leftLabel: string) {
    return (
      <li key={`${item.id}-${item.date}`} className={styles.agendaItem}>
        <span className={styles.agendaDate}>{leftLabel}</span>
        <span className={styles.agendaTitle}>{item.title}</span>
        <button
          type="button"
          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
          aria-label={`Delete "${item.title}"`}
          disabled={isPending}
          onClick={() => run(() => deleteEventAction(item.id))}
        >
          ×
        </button>
      </li>
    );
  }

  function shiftMonth(delta: number) {
    setView((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  function shiftDay(delta: number) {
    const next = new Date(selected.year, selected.month, selected.day + delta);
    setSelected({ year: next.getFullYear(), month: next.getMonth(), day: next.getDate() });
    setView({ year: next.getFullYear(), month: next.getMonth() });
  }

  function openDay(day: number) {
    setSelected({ year: view.year, month: view.month, day });
    setTab("Day");
  }

  const selectedKey = dateKey(selected.year, selected.month, selected.day);
  const selectedDate = new Date(selected.year, selected.month, selected.day);
  const dayItems = itemsByDate.get(selectedKey) ?? [];

  const firstWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const days: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <section aria-label="Upcoming events" aria-busy={isPending}>
      <Card
        as="div"
        title="upcoming-events"
        actions={
          tab !== "Agenda" ? (
            <div className={styles.calendarNav}>
              <button
                type="button"
                className={styles.iconBtn}
                aria-label={tab === "Day" ? "Previous day" : "Previous month"}
                onClick={() => (tab === "Day" ? shiftDay(-1) : shiftMonth(-1))}
              >
                ←
              </button>
              <p className={styles.calendarMonth}>
                {tab === "Day"
                  ? formatDayHeader(selectedDate)
                  : MONTH_HEADER_FMT.format(new Date(view.year, view.month, 1))}
              </p>
              <button
                type="button"
                className={styles.iconBtn}
                aria-label={tab === "Day" ? "Next day" : "Next month"}
                onClick={() => (tab === "Day" ? shiftDay(1) : shiftMonth(1))}
              >
                →
              </button>
            </div>
          ) : undefined
        }
      >
        {!googleConnected && (
          <Banner tone="warning">
            Google Calendar not connected — sign out and back in to grant calendar access.
          </Banner>
        )}

        <div className={styles.viewTabs}>
          {(["Day", "Month", "Agenda"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`${styles.viewTab} ${tab === v ? styles.viewTabActive : ""}`}
              onClick={() => setTab(v)}
            >
              {v}
            </button>
          ))}
        </div>

        {error && <Banner tone="error">{error}</Banner>}

        {tab === "Month" && (
          <div className={styles.calendarGrid}>
            {WEEKDAYS.map((d) => (
              <div key={d} className={styles.calendarWeekday}>
                {d}
              </div>
            ))}
            {days.map((day, i) => {
              if (day === null) {
                return (
                  <div key={i} className={`${styles.calendarCell} ${styles.calendarCellEmpty}`} />
                );
              }
              const key = dateKey(view.year, view.month, day);
              const dayEvents = itemsByDate.get(key) ?? [];
              return (
                <button
                  type="button"
                  key={i}
                  className={`${styles.calendarCell} ${styles.calendarCellButton} ${key === todayKey ? styles.calendarCellToday : ""}`}
                  aria-label={`Open day view for ${MONTHS[view.month]} ${day}, ${view.year}`}
                  onClick={() => openDay(day)}
                >
                  <span className={styles.calendarCellDay}>{day}</span>
                  {dayEvents.slice(0, 2).map((item) => (
                    <span key={`${item.id}-${item.date}`} className={styles.calendarCellEvent}>
                      {item.title}
                    </span>
                  ))}
                  {dayEvents.length > 2 && (
                    <span className={styles.calendarCellMore}>
                      +{dayEvents.length - 2} more
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {tab === "Day" &&
          (dayItems.length === 0 ? (
            <EmptyState title="No events on this day." />
          ) : (
            <ul className={styles.agendaList}>
              {dayItems.map((item) => renderItem(item, item.time ?? "all-day"))}
            </ul>
          ))}

        {tab === "Agenda" && upcoming.length === 0 && <EmptyState title="No upcoming events." />}

        {tab === "Agenda" && upcoming.length > 0 && (
          <ul className={styles.agendaList}>
            {upcoming.slice(0, AGENDA_LIMIT).map((item) => renderItem(item, formatDate(item.date)))}
            {upcoming.length > AGENDA_LIMIT && (
              <li className={styles.agendaEmpty}>
                +{upcoming.length - AGENDA_LIMIT} more further out
              </li>
            )}
          </ul>
        )}

        <form className={styles.eventForm} action={handleAdd}>
          <input
            name="date"
            type="date"
            className={styles.input}
            aria-label="Event date"
            required
          />
          <input
            name="title"
            type="text"
            className={styles.input}
            placeholder="New event..."
            aria-label="Event title"
            required
          />
          <button
            type="submit"
            className={styles.btnSecondary}
            disabled={isPending || !googleConnected}
          >
            Add
          </button>
        </form>
      </Card>
    </section>
  );
}
