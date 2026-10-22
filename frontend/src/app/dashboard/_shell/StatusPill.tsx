import styles from "./Shell.module.css";

type Props = {
  connected: boolean;
};

export default function StatusPill({ connected }: Props) {
  return (
    <span
      className={`${styles.statusPill} ${connected ? styles.statusOnline : styles.statusOffline}`}
      role="status"
    >
      <span className={styles.statusDot} aria-hidden="true" />
      <span>{connected ? "Systems Operational" : "Systems Down"}</span>
    </span>
  );
}
