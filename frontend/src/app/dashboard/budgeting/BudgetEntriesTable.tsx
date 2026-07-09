"use client";

import { useMemo, useState, useTransition } from "react";
import type { BudgetEntry } from "@/lib/server-api";
import { BUDGET_CATEGORIES } from "./budgetCategories";
import { formatDay } from "./formatDate";
import { recategorizeEntryAction, updateEntryAction } from "./actions";
import styles from "./Budgeting.module.css";

type Props = { entries: BudgetEntry[] };

type Filters = {
  category: string; // "All" or a category name
  from: string; // ISO yyyy-mm-dd or ""
  to: string;
  min: string; // dollars or ""
  max: string;
};

const NO_FILTERS: Filters = { category: "All", from: "", to: "", min: "", max: "" };

const money = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });

export default function BudgetEntriesTable({ entries }: Props) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  const activeCount = [
    filters.category !== "All",
    filters.from !== "",
    filters.to !== "",
    filters.min !== "",
    filters.max !== "",
  ].filter(Boolean).length;

  const visible = useMemo(() => {
    const min = filters.min === "" ? null : Number(filters.min);
    const max = filters.max === "" ? null : Number(filters.max);
    return entries.filter((e) => {
      if (filters.category !== "All" && e.category !== filters.category) return false;
      if (filters.from && e.transDate < filters.from) return false;
      if (filters.to && e.transDate > filters.to) return false;
      if (min !== null && e.amount < min) return false;
      if (max !== null && e.amount > max) return false;
      return true;
    });
  }, [entries, filters]);

  const onCategoryChange = (id: string, category: string) => {
    setError(null);
    startTransition(async () => {
      const res = await recategorizeEntryAction(id, category);
      if (!res.ok) setError(res.error ?? "Failed to update category");
    });
  };

  // Click-to-edit descriptions. Local overrides keep the new name visible
  // until the server refresh delivers the updated row.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});

  const displayName = (e: BudgetEntry) => nameOverrides[e.id] ?? e.description;

  const startNameEdit = (e: BudgetEntry) => {
    setEditingId(e.id);
    setDraft(displayName(e));
  };

  const commitNameEdit = (entry: BudgetEntry) => {
    setEditingId(null);
    const name = draft.trim();
    if (!name || name === displayName(entry)) return;
    setError(null);
    setNameOverrides((prev) => ({ ...prev, [entry.id]: name }));
    startTransition(async () => {
      const res = await updateEntryAction(entry.id, { description: name });
      if (!res.ok) {
        setError(res.error ?? "Failed to rename transaction");
        setNameOverrides((prev) => {
          const next = { ...prev };
          delete next[entry.id];
          return next;
        });
      }
    });
  };

  return (
    <section className={styles.card} aria-label="Transactions">
      <div className={styles.tableHeader}>
        <h2 className={styles.cardHeading}>Transactions</h2>
        <button
          type="button"
          className={styles.btn}
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((v) => !v)}
        >
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
      </div>

      {panelOpen && (
        <div className={styles.filterPanel}>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Type</span>
            <select
              className={styles.select}
              value={filters.category}
              onChange={(e) => set({ category: e.target.value })}
            >
              <option>All</option>
              {BUDGET_CATEGORIES.filter((c) => c !== "Card Payment").map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>From</span>
            <input
              type="date"
              className={styles.select}
              value={filters.from}
              onChange={(e) => set({ from: e.target.value })}
            />
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>To</span>
            <input
              type="date"
              className={styles.select}
              value={filters.to}
              onChange={(e) => set({ to: e.target.value })}
            />
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Min $</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              className={styles.select}
              value={filters.min}
              onChange={(e) => set({ min: e.target.value })}
            />
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Max $</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              className={styles.select}
              value={filters.max}
              onChange={(e) => set({ max: e.target.value })}
            />
          </label>
          <button
            type="button"
            className={styles.btn}
            disabled={activeCount === 0}
            onClick={() => setFilters(NO_FILTERS)}
          >
            Clear
          </button>
        </div>
      )}

      {error && (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className={styles.mutedText}>No transactions.</p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th className={styles.amountCol}>Amount</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id}>
                  <td>{formatDay(e.transDate)}</td>
                  <td className={styles.descCell}>
                    {editingId === e.id ? (
                      <input
                        type="text"
                        className={`${styles.select} ${styles.descInput}`}
                        value={draft}
                        autoFocus
                        onChange={(ev) => setDraft(ev.target.value)}
                        onBlur={() => commitNameEdit(e)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") ev.currentTarget.blur();
                          if (ev.key === "Escape") setEditingId(null);
                        }}
                        aria-label={`Rename ${e.description}`}
                      />
                    ) : (
                      <button
                        type="button"
                        className={styles.nameButton}
                        onClick={() => startNameEdit(e)}
                        title="Click to rename"
                      >
                        {displayName(e)}
                      </button>
                    )}
                  </td>
                  <td
                    className={`${styles.amountCol} ${
                      e.isCredit ? styles.creditAmount : ""
                    }`}
                  >
                    {money(e.amount)}
                  </td>
                  <td>
                    <select
                      className={styles.select}
                      value={e.category}
                      disabled={isPending}
                      onChange={(ev) => onCategoryChange(e.id, ev.target.value)}
                      aria-label={`Category for ${e.description}`}
                    >
                      {BUDGET_CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
