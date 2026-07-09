"use client";

import { useState, useTransition } from "react";
import type { BudgetEntry } from "@/lib/server-api";
import { BUDGET_CATEGORIES } from "./budgetCategories";
import { recategorizeEntryAction } from "./actions";
import styles from "./Budgeting.module.css";

type Props = { entries: BudgetEntry[] };

const money = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });

export default function BudgetEntriesTable({ entries }: Props) {
  const [filter, setFilter] = useState<string>("All");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible =
    filter === "All" ? entries : entries.filter((e) => e.category === filter);

  const onCategoryChange = (id: string, category: string) => {
    setError(null);
    startTransition(async () => {
      const res = await recategorizeEntryAction(id, category);
      if (!res.ok) setError(res.error ?? "Failed to update category");
    });
  };

  return (
    <section className={styles.card} aria-label="Transactions">
      <div className={styles.tableHeader}>
        <h2 className={styles.cardHeading}>Transactions</h2>
        <select
          className={styles.select}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter by category"
        >
          <option>All</option>
          {BUDGET_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

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
                <tr key={e.id} className={e.isCredit ? styles.creditRow : ""}>
                  <td>{e.transDate}</td>
                  <td className={styles.descCell}>{e.description}</td>
                  <td className={styles.amountCol}>
                    {e.isCredit ? `−${money(e.amount)}` : money(e.amount)}
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
