import { DashboardLoadingBody } from "./_shell/Boundaries";
import styles from "./Dashboard.module.css";

export default function Loading() {
  return (
    <div className={styles.wrapper}>
      <DashboardLoadingBody />
    </div>
  );
}
