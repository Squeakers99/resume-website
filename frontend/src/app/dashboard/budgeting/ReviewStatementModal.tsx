"use client";

import { useEffect, useState, useTransition } from "react";
import type { BudgetEntry, BudgetStatement } from "@/lib/server-api";
import { BUDGET_CATEGORIES } from "./budgetCategories";
import {
  getStatementEntriesAction,
  updateEntryAction,
  updateStatementAction,
} from "./actions";
import styles from "./Budgeting.module.css";

type Props = {
  statement: BudgetStatement;
  onClose: () => void;
};

const money = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });

// Owner's card-total rule (mirrors backend computedCardTotalCents): charges
// minus credits, ignoring only the one TRSF credit that equals the printed
// previous balance (the settlement payment).
const cardTotalFromEntries = (
  entries: BudgetEntry[],
  previousBalance: number
): number => {
  const prevCents = Math.round(previousBalance * 100);
  let settlementIgnored = false;
  const cents = entries.reduce((sum, e) => {
    const c = Math.round(e.amount * 100);
    if (!e.isCredit) return sum + c;
    if (!settlementIgnored && /TRSF/i.test(e.description) && c === prevCents) {
      settlementIgnored = true;
      return sum;
    }
    return sum - c;
  }, 0);
  return cents / 100;
};

// Every field of one billing, editable. Each field saves on blur (only when
// changed); the backend re-runs the printed-totals validation after every
// save, so the mismatch flag clears the moment the numbers reconcile.
export default function ReviewStatementModal({ statement, onClose }: Props) {
  const [current, setCurrent] = useState<BudgetStatement>(statement);
  const [entries, setEntries] = useState<BudgetEntry[] | null>(null);
  const [problems, setProblems] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getStatementEntriesAction(statement.id).then((res) => {
      if (cancelled) return;
      if (res.ok && res.entries) setEntries(res.entries);
      else setError(res.error ?? "Failed to load entries");
    });
    // No-op patch = re-run validation so mismatch reasons show immediately.
    updateStatementAction(statement.id, {}).then((res) => {
      if (cancelled || !res.ok) return;
      if (res.statement) setCurrent(res.statement);
      setProblems(res.problems ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [statement.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const applyResult = (res: {
    ok: boolean;
    error?: string;
    statement?: BudgetStatement | null;
    problems?: string[];
  }) => {
    if (!res.ok) {
      setError(res.error ?? "Save failed");
      return false;
    }
    setError(null);
    if (res.statement) setCurrent(res.statement);
    setProblems(res.problems ?? []);
    return true;
  };

  const saveStatementField = (
    field: keyof BudgetStatement,
    value: string | number
  ) => {
    if (current[field] === value) return;
    startTransition(async () => {
      applyResult(await updateStatementAction(current.id, { [field]: value }));
    });
  };

  const saveEntryField = (
    entry: BudgetEntry,
    patch: Partial<BudgetEntry>
  ) => {
    startTransition(async () => {
      const res = await updateEntryAction(entry.id, patch);
      if (applyResult(res)) {
        // Merge the server-normalized row (e.g. amounts rounded to cents),
        // not the raw client patch.
        const saved = res.entry;
        setEntries(
          (prev) =>
            prev?.map((e) =>
              e.id === entry.id ? { ...e, ...(saved ?? patch) } : e
            ) ?? prev
        );
      }
    });
  };

  const moneyField = (
    label: string,
    field: "previousBalance" | "paymentsCredits" | "purchasesTotal" | "totalBalance"
  ) => (
    <label className={styles.filterField}>
      <span className={styles.filterLabel}>{label}</span>
      <input
        type="number"
        step="0.01"
        className={styles.select}
        defaultValue={current[field]}
        onBlur={(e) => {
          if (e.target.value === "") return; // never save a cleared field as 0
          const v = Number(e.target.value);
          if (Number.isFinite(v)) saveStatementField(field, v);
        }}
      />
    </label>
  );

  const dateField = (
    label: string,
    field: "statementDate" | "periodStart" | "periodEnd"
  ) => (
    <label className={styles.filterField}>
      <span className={styles.filterLabel}>{label}</span>
      <input
        type="date"
        className={styles.select}
        defaultValue={current[field]}
        onBlur={(e) => {
          if (e.target.value) saveStatementField(field, e.target.value);
        }}
      />
    </label>
  );

  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={`Review ${current.source} statement`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.cardHeading}>Review statement</h2>
            <p className={styles.mutedText}>
              {current.source} ·{" "}
              <span
                className={
                  current.validationStatus === "mismatch"
                    ? styles.errorText
                    : styles.validText
                }
              >
                {current.validationStatus}
              </span>
              {isPending ? " · saving…" : ""}
            </p>
          </div>
          <button type="button" className={styles.btn} onClick={onClose}>
            Close
          </button>
        </div>

        {error && (
          <p className={styles.errorText} role="alert">
            {error}
          </p>
        )}
        {problems !== null && problems.length > 0 && (
          <div className={styles.uploadPreview}>
            {problems.map((p) => (
              <p key={p} className={styles.errorText}>
                {p}
              </p>
            ))}
          </div>
        )}
        {problems !== null && problems.length === 0 && (
          <p className={styles.validText}>All totals reconcile.</p>
        )}

        {current.accountType === "credit_card" ? (
          <div className={styles.filterPanel}>
            {moneyField("Total balance", "totalBalance")}
            {entries !== null && (
              <p className={styles.mutedText}>
                Computed from entries:{" "}
                {money(cardTotalFromEntries(entries, current.previousBalance))} (charges −
                credits; the {money(current.previousBalance)} settlement TRSF ignored)
              </p>
            )}
          </div>
        ) : (
          <div className={styles.filterPanel}>
            <label className={styles.filterField}>
              <span className={styles.filterLabel}>Source</span>
              <input
                type="text"
                className={styles.select}
                defaultValue={current.source}
                onBlur={(e) => {
                  if (e.target.value.trim()) saveStatementField("source", e.target.value.trim());
                }}
              />
            </label>
            {dateField("Statement date", "statementDate")}
            {dateField("Period start", "periodStart")}
            {dateField("Period end", "periodEnd")}
            {moneyField("Opening balance", "previousBalance")}
            {moneyField("Money in", "paymentsCredits")}
            {moneyField("Money out", "purchasesTotal")}
            {moneyField("Closing balance", "totalBalance")}
          </div>
        )}

        <h3 className={styles.cardSubheading}>Entries (including card payments)</h3>
        {entries === null ? (
          <p className={styles.mutedText}>Loading entries…</p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th className={styles.amountCol}>Amount</th>
                  <th>Credit</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <input
                        type="date"
                        className={styles.select}
                        defaultValue={e.transDate}
                        onBlur={(ev) => {
                          if (ev.target.value && ev.target.value !== e.transDate) {
                            saveEntryField(e, { transDate: ev.target.value });
                          }
                        }}
                      />
                    </td>
                    <td className={styles.descCell}>
                      <input
                        type="text"
                        className={`${styles.select} ${styles.descInput}`}
                        defaultValue={e.description}
                        onBlur={(ev) => {
                          const v = ev.target.value.trim();
                          if (v && v !== e.description) {
                            saveEntryField(e, { description: v });
                          }
                        }}
                      />
                    </td>
                    <td className={styles.amountCol}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={`${styles.select} ${styles.amountInput}`}
                        defaultValue={e.amount}
                        onBlur={(ev) => {
                          if (ev.target.value === "") return; // never save cleared as 0
                          const v = Number(ev.target.value);
                          if (Number.isFinite(v) && v >= 0 && v !== e.amount) {
                            saveEntryField(e, { amount: v });
                          }
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={e.isCredit}
                        disabled={isPending}
                        aria-label={`${e.description} is money in`}
                        onChange={(ev) =>
                          saveEntryField(e, { isCredit: ev.target.checked })
                        }
                      />
                    </td>
                    <td>
                      <select
                        className={styles.select}
                        value={e.category}
                        disabled={isPending}
                        onChange={(ev) =>
                          saveEntryField(e, { category: ev.target.value })
                        }
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
      </div>
    </div>
  );
}
