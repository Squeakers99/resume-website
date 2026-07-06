"use client";

import { useState, useTransition } from "react";
import type { DashboardTask } from "@/lib/server-api";
import { addTaskAction, deleteTaskAction, moveTaskAction, type ActionResult } from "./actions";
import styles from "./Dashboard.module.css";

const COLUMNS = [
  { id: "backlog", title: "BACKLOG" },
  { id: "todo", title: "TO DO" },
  { id: "progress", title: "IN PROGRESS" },
  { id: "done", title: "DONE" },
] as const;

type Props = {
  tasks: DashboardTask[];
  backendConnected: boolean;
};

export default function PortfolioTasksSection({ tasks, backendConnected }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong");
    });
  }

  function handleAdd(formData: FormData) {
    const title = String(formData.get("title") ?? "").trim();
    const priority = String(formData.get("priority") ?? "Medium");
    const status = String(formData.get("status") ?? "backlog");
    if (!title) return;
    run(() => addTaskAction({ title, priority, status }));
  }

  return (
    <section className={styles.card} aria-label="Portfolio tasks" aria-busy={isPending}>
      <h2 className={styles.cardTitle}>portfolio-tasks</h2>

      {!backendConnected && (
        <p className={styles.offlineNote}>Backend offline — tasks unavailable.</p>
      )}

      <form className={styles.kanbanAddForm} action={handleAdd}>
        <input
          name="title"
          type="text"
          className={styles.input}
          placeholder="New task..."
          aria-label="Task title"
          required
        />
        <select name="priority" className={styles.select} defaultValue="Medium" aria-label="Priority">
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
        </select>
        <select name="status" className={styles.select} defaultValue="backlog" aria-label="Column">
          {COLUMNS.map((col) => (
            <option key={col.id} value={col.id}>
              {col.title}
            </option>
          ))}
        </select>
        <button type="submit" className={styles.btnSecondary} disabled={isPending || !backendConnected}>
          Add
        </button>
      </form>

      {error && (
        <p className={styles.feedbackError} role="alert">
          {error}
        </p>
      )}

      <div className={styles.kanban}>
        {COLUMNS.map((col, colIndex) => {
          const columnTasks = tasks.filter((t) => t.status === col.id);
          return (
            <div key={col.id} className={styles.kanbanColumn}>
              <div className={styles.kanbanColumnHeader}>
                <span className={styles.kanbanColumnTitle}>{col.title}</span>
                <span className={styles.kanbanColumnCount}>{columnTasks.length}</span>
              </div>
              <div className={styles.kanbanColumnCards}>
                {columnTasks.map((task) => (
                  <div key={task.id} className={styles.taskCard}>
                    <div className={styles.taskCardTitle}>{task.title}</div>
                    <div className={styles.taskCardMeta}>
                      <span>{task.priority}</span>
                      <span>{task.createdAt.slice(5, 10)}</span>
                    </div>
                    <div className={styles.taskCardActions}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        aria-label={`Move "${task.title}" left`}
                        disabled={colIndex === 0 || isPending}
                        onClick={() => run(() => moveTaskAction(task.id, COLUMNS[colIndex - 1].id))}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        aria-label={`Move "${task.title}" right`}
                        disabled={colIndex === COLUMNS.length - 1 || isPending}
                        onClick={() => run(() => moveTaskAction(task.id, COLUMNS[colIndex + 1].id))}
                      >
                        →
                      </button>
                      <button
                        type="button"
                        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                        aria-label={`Delete "${task.title}"`}
                        disabled={isPending}
                        onClick={() => run(() => deleteTaskAction(task.id))}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
