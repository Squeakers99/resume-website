"use client";

import { DashboardErrorBody } from "./_shell/Boundaries";
import styles from "./Dashboard.module.css";

export default function DashboardError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={styles.wrapper}>
      <DashboardErrorBody {...props} />
    </div>
  );
}
