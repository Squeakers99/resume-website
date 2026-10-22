import type { ReactNode } from "react";
import styles from "./base.module.css";

export type StatTileTone = "default" | "positive" | "negative";

export type StatTileProps = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTileTone;
};

const TONE_CLASS: Record<StatTileTone, string | undefined> = {
  default: undefined,
  positive: styles.tonePositive,
  negative: styles.toneNegative,
};

export function StatTile({ label, value, hint, tone = "default" }: StatTileProps) {
  const toneClass = TONE_CLASS[tone];

  return (
    <div className={styles.statTile}>
      <span className={styles.statLabel}>{label}</span>
      <span className={toneClass ? `${styles.statValue} ${toneClass}` : styles.statValue}>{value}</span>
      {hint !== undefined ? <span className={styles.statHint}>{hint}</span> : null}
    </div>
  );
}

export default StatTile;
