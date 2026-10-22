import Breadcrumbs from "./Breadcrumbs";
import StatusPill from "./StatusPill";
import styles from "./Shell.module.css";

type Props = {
  backendConnected: boolean;
};

// Breadcrumbs + status pill only, at every width. Theme and account controls
// live in the sidebar footer (desktop) and the More sheet (phone).
export default function TopBar({ backendConnected }: Props) {
  return (
    <header className={styles.topBar}>
      <Breadcrumbs />
      <div className={styles.topBarMeta}>
        <StatusPill connected={backendConnected} />
      </div>
    </header>
  );
}
