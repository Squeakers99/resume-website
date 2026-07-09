import { getOwnerSession, signOut } from "@/lib/auth";
import DashboardTitleMenu from "./DashboardTitleMenu";
import styles from "./Dashboard.module.css";

type Props = {
  backendConnected: boolean;
};

export default async function DashboardTitleSection({ backendConnected }: Props) {
  const session = await getOwnerSession();

  return (
    <section className={styles.titleSection} aria-label="Dashboard title and status">
      <div className={styles.titleSectionLeft}>
        <DashboardTitleMenu />
      </div>
      <div className={styles.titleSectionMeta}>
        <div className={styles.titleSectionAuth}>
          <span className={styles.titleSectionAuthLabel}>Auth</span>
          <span className={styles.titleSectionAuthValue}>
            {session?.user?.email ?? "Unknown"}
          </span>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit" className={styles.btnSignOut}>
            Sign out
          </button>
        </form>
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
