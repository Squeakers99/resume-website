import type { ReactNode } from "react";
import styles from "./base.module.css";

export type EmptyStateProps = {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className={styles.emptyState}>
      <p className={styles.emptyTitle}>{title}</p>
      {body !== undefined ? <p className={styles.emptyBody}>{body}</p> : null}
      {action !== undefined ? <div className={styles.emptyAction}>{action}</div> : null}
    </div>
  );
}

export default EmptyState;
