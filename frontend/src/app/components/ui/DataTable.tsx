"use client";

import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import styles from "./interactive.module.css";

export type SortDirection = "asc" | "desc";

export type DataTableSort = {
  key: string;
  direction: SortDirection;
};

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Columns with a sortValue get a sort button in their header. */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right";
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  caption: ReactNode;
  /** Keep the caption for screen readers but hide it visually. */
  hideCaption?: boolean;
  initialSort?: DataTableSort;
  /** Shown in place of the body rows when rows is empty. */
  empty?: ReactNode;
  /** Max height of the scroll box; the header stays pinned while the body scrolls. Default none. */
  maxHeight?: CSSProperties["maxHeight"];
};

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a)) return Number.isNaN(b) ? 0 : 1;
    if (Number.isNaN(b)) return -1;
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

const SORT_ARIA: Record<SortDirection, "ascending" | "descending"> = {
  asc: "ascending",
  desc: "descending",
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  hideCaption = false,
  initialSort,
  empty = "Nothing to show yet.",
  maxHeight,
}: DataTableProps<T>) {
  const captionId = useId();
  const [sort, setSort] = useState<DataTableSort | null>(initialSort ?? null);

  const sortedRows = useMemo(() => {
    const column = sort ? columns.find((c) => c.key === sort.key) : undefined;
    const getValue = column?.sortValue;
    if (!sort || !getValue) return rows;
    const factor = sort.direction === "asc" ? 1 : -1;
    // Decorate with the original index so equal values keep their input order.
    return rows
      .map((row, index) => ({ row, index, value: getValue(row) }))
      .sort((a, b) => compareValues(a.value, b.value) * factor || a.index - b.index)
      .map((entry) => entry.row);
  }, [rows, columns, sort]);

  const toggleSort = (key: string) => {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  };

  return (
    <div
      className={styles.tableWrap}
      style={{ maxHeight: maxHeight ?? "none" }}
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
    >
      <table className={styles.table}>
        <caption id={captionId} className={hideCaption ? styles.srOnly : styles.caption}>
          {caption}
        </caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const alignClass = column.align === "right" ? styles.alignRight : "";
              if (!column.sortValue) {
                return (
                  <th key={column.key} scope="col" className={`${styles.th} ${alignClass}`}>
                    {column.header}
                  </th>
                );
              }
              const direction = sort?.key === column.key ? sort.direction : null;
              return (
                <th
                  key={column.key}
                  scope="col"
                  className={`${styles.th} ${alignClass}`}
                  aria-sort={direction ? SORT_ARIA[direction] : "none"}
                >
                  <button
                    type="button"
                    className={styles.sortButton}
                    onClick={() => toggleSort(column.key)}
                  >
                    {column.header}
                    <span className={styles.sortIcon} aria-hidden="true">
                      {direction === "asc" ? "▲" : direction === "desc" ? "▼" : "↕"}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td className={`${styles.td} ${styles.emptyCell}`} colSpan={columns.length}>
                {empty}
              </td>
            </tr>
          ) : (
            sortedRows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`${styles.td} ${column.align === "right" ? `${styles.alignRight} ${styles.numeric}` : ""}`}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
