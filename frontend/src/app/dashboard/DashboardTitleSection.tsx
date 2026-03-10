import styles from "./Dashboard.module.css";

type Props = {
  backendConnected: boolean;
};

export default function DashboardTitleSection({ backendConnected }: Props) {
  return (
    <section className={styles.titleSection} aria-label="Dashboard title and status">
      <h1 className={styles.titleSectionHeading}>Dashboard</h1>
      <div className={styles.titleSectionMeta}>
        <div className={styles.titleSectionAuth}>
          <span className={styles.titleSectionAuthLabel}>Auth</span>
          <span className={styles.titleSectionAuthValue}>Placeholder</span>
        </div>
        <div
          className={`${styles.titleSectionBackend} ${backendConnected ? styles.backendOnline : styles.backendOffline}`}
          aria-label="Backend connection status"
        >
          <span className={styles.backendDot} aria-hidden="true" />
          <span>{backendConnected ? "Systems Operational" : "Systems Down"}</span>
        </div>
      </div>
    </section>
  );
}
