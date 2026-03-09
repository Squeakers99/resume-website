import styles from "./Dashboard.module.css";

export default function DashboardPage() {
  return (
    <main className={styles.wrapper}>
      <div className={styles.topBar}>
        <h1 className={styles.topBarTitle}>Dashboard</h1>
        <span className={styles.topBarNote}>Sign in coming soon</span>
      </div>

      <div className={styles.main}>
        <section className={styles.panel} aria-label="Project management">
          <h2 className={styles.panelTitle}>Project management</h2>
          <p className={styles.panelPlaceholder}>
            Create and edit portfolio projects. (Placeholder — add form and list here.)
          </p>
        </section>

        <section className={styles.panel} aria-label="To-dos and calendar">
          <div className={styles.rightPanel}>
            <div className={styles.subPanel}>
              <h3 className={styles.subPanelTitle}>To-dos</h3>
              <p className={styles.subPanelPlaceholder}>
                Your to-do list will appear here.
              </p>
            </div>
            <div className={styles.subPanel}>
              <h3 className={styles.subPanelTitle}>Calendar</h3>
              <p className={styles.subPanelPlaceholder}>
                Calendar view (month / week / day) will appear here.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
