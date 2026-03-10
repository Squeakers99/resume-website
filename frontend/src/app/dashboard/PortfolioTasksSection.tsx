import styles from "./Dashboard.module.css";

const COLUMNS = [
  { id: "backlog", title: "BACKLOG", count: 3 },
  { id: "todo", title: "TO DO", count: 4 },
  { id: "progress", title: "IN PROGRESS", count: 2 },
  { id: "done", title: "DONE", count: 5 },
] as const;

const PLACEHOLDER_TASKS: Record<string, { title: string; priority: string; date: string }[]> = {
  backlog: [
    { title: "Team Ssinohization", priority: "Medium", date: "03-24" },
    { title: "Update README", priority: "Low", date: "03-25" },
    { title: "Fix responsive layout", priority: "High", date: "03-26" },
  ],
  todo: [
    { title: "Add unit tests", priority: "High", date: "03-27" },
    { title: "Deploy staging", priority: "Medium", date: "03-28" },
  ],
  progress: [
    { title: "API integration", priority: "High", date: "03-24" },
    { title: "Design review", priority: "Low", date: "03-25" },
  ],
  done: [
    { title: "Setup repo", priority: "Low", date: "03-20" },
    { title: "Auth flow", priority: "High", date: "03-21" },
    { title: "Dashboard shell", priority: "Medium", date: "03-22" },
  ],
};

export default function PortfolioTasksSection() {
  return (
    <section className={styles.card} aria-label="Portfolio tasks">
      <h2 className={styles.cardTitle}>Portfolio Tasks</h2>
      <div className={styles.kanban}>
        {COLUMNS.map((col) => (
          <div key={col.id} className={styles.kanbanColumn}>
            <div className={styles.kanbanColumnHeader}>
              <span className={styles.kanbanColumnTitle}>{col.title}</span>
              <span className={styles.kanbanColumnCount}>{col.count}</span>
            </div>
            <div className={styles.kanbanColumnCards}>
              {(PLACEHOLDER_TASKS[col.id] ?? []).map((task, i) => (
                <div key={`${col.id}-${i}`} className={styles.taskCard}>
                  <div className={styles.taskCardTitle}>{task.title}</div>
                  <div className={styles.taskCardMeta}>
                    <span>{task.priority}</span>
                    <span>{task.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
