import styles from "./Dashboard.module.css";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NOV_2024_START = 5; // Nov 1 2024 is Friday (0-indexed: 5)
const DAYS_IN_MONTH = 30;
const EVENTS: Record<number, string> = {
  12: "Team Synch",
  14: "Project Alpha Launch",
  20: "Client Demo",
};

export default function UpcomingEventsSection() {
  const days: (number | null)[] = [];
  for (let i = 0; i < NOV_2024_START; i++) days.push(null);
  for (let d = 1; d <= DAYS_IN_MONTH; d++) days.push(d);

  return (
    <section className={styles.card} aria-label="Upcoming events">
      <div className={styles.calendarHeader}>
        <h2 className={styles.cardTitle}>upcoming-events</h2>
        <p className={styles.calendarMonth}>Nov 2024</p>
      </div>
      <div className={styles.viewTabs}>
        {["Day", "Week", "Month", "Agenda"].map((v) => (
          <button
            key={v}
            type="button"
            className={`${styles.viewTab} ${v === "Month" ? styles.viewTabActive : ""}`}
          >
            {v}
          </button>
        ))}
      </div>
      <div className={styles.calendarGrid}>
        {WEEKDAYS.map((d) => (
          <div key={d} className={styles.calendarWeekday}>
            {d}
          </div>
        ))}
        {days.map((d, i) => (
          <div
            key={i}
            className={`${styles.calendarCell} ${d === 15 ? styles.calendarCellToday : ""} ${d === null ? styles.calendarCellEmpty : ""}`}
          >
            {d !== null && (
              <>
                <span className={styles.calendarCellDay}>{d}</span>
                {EVENTS[d] && (
                  <span className={styles.calendarCellEvent}>{EVENTS[d]}</span>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
