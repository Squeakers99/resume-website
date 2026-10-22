import type { ReactNode } from "react";
import styles from "./base.module.css";

export type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderText}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {description !== undefined ? <p className={styles.pageDescription}>{description}</p> : null}
      </div>
      {actions !== undefined ? <div className={styles.headerActions}>{actions}</div> : null}
    </header>
  );
}

export default PageHeader;
