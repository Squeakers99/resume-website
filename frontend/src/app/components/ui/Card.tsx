import type { ReactNode } from "react";
import styles from "./base.module.css";

export type CardElement = "section" | "div" | "article" | "aside" | "li";

export type CardProps = {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Element tag for the card root. Defaults to "section". */
  as?: CardElement;
};

export function Card({ title, actions, children, as = "section" }: CardProps) {
  const Tag = as;
  const hasHeader = title !== undefined || actions !== undefined;

  return (
    <Tag className={styles.card}>
      {hasHeader ? (
        <div className={styles.cardHeader}>
          {title !== undefined ? <h2 className={styles.cardTitle}>{title}</h2> : <span />}
          {actions !== undefined ? <div className={styles.cardActions}>{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </Tag>
  );
}

export default Card;
