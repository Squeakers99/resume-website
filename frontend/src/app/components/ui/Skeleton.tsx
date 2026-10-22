import type { CSSProperties } from "react";
import styles from "./base.module.css";

export type SkeletonProps = {
  /** CSS width; numbers are pixels. Defaults to 100%. */
  width?: number | string;
  /** CSS height of each line; numbers are pixels. Defaults to the --space-3 token. */
  height?: number | string;
  /** Number of stacked lines. Defaults to 1; the last line of a multi-line block is shorter. */
  lines?: number;
};

function toCss(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "number" ? `${value}px` : value;
}

export function Skeleton({ width, height, lines = 1 }: SkeletonProps) {
  const lineStyle: CSSProperties = { height: toCss(height) };
  const count = Math.max(1, Math.floor(lines));

  if (count === 1) {
    return (
      <span
        aria-hidden="true"
        className={styles.skeleton}
        style={{ ...lineStyle, width: toCss(width) }}
      />
    );
  }

  return (
    <span aria-hidden="true" className={styles.skeletonGroup} style={{ width: toCss(width) }}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={i === count - 1 ? `${styles.skeleton} ${styles.skeletonLast}` : styles.skeleton}
          style={lineStyle}
        />
      ))}
    </span>
  );
}

export default Skeleton;
