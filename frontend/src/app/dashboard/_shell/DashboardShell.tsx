import type { ReactNode } from "react";
import BottomTabBar from "./BottomTabBar";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import styles from "./Shell.module.css";

type Props = {
  email: string;
  backendConnected: boolean;
  signOutAction: () => Promise<void>;
  children: ReactNode;
};

export default function DashboardShell({ email, backendConnected, signOutAction, children }: Props) {
  return (
    <div className={styles.shell} data-dashboard-shell="">
      <Sidebar email={email} signOutAction={signOutAction} />
      <div className={styles.contentColumn}>
        <TopBar backendConnected={backendConnected} />
        <div className={styles.content}>{children}</div>
      </div>
      <BottomTabBar email={email} signOutAction={signOutAction} />
    </div>
  );
}
