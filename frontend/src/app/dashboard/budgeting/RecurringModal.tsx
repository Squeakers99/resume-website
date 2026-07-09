"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { BudgetEntry } from "@/lib/server-api";
import { detectRecurringAction, listRecurringAction, updateEntryAction } from "./actions";
import { formatDay } from "./formatDate";
import styles from "./Budgeting.module.css";

type Props = { onClose: () => void };

const money = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });

const normalize = (description: string) =>
  description
    .toUpperCase()
    .replace(/[^A-Z ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

export default function RecurringModal({ onClose }: Props) {
  const [entries, setEntries] = useState<BudgetEntry[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = () =>
    listRecurringAction().then((res) => {
      if (res.ok && res.entries) setEntries(res.entries);
      else setError(res.error ?? "Failed to load recurring transactions");
    });

  useEffect(() => {
    load();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const onDetect = () => {
    setError(null);
    startTransition(async () => {
      const res = await detectRecurringAction();
      if (!res.ok) {
        setError(res.error ?? "Detection failed");
        return;
      }
      setStatus(
        res.marked && res.marked > 0
          ? `Detected and marked ${res.marked} new subscription charge${res.marked === 1 ? "" : "s"}.`
          : "No new subscriptions found."
      );
      await load();
    });
  };

  const onRemove = (entry: BudgetEntry) => {
    setError(null);
    startTransition(async () => {
      const res = await updateEntryAction(entry.id, { recurring: false });
      if (!res.ok) {
        setError(res.error ?? "Failed to update");
        return;
      }
      setEntries((prev) => prev?.filter((e) => e.id !== entry.id) ?? prev);
    });
  };

  const groups = useMemo(() => {
    if (!entries) return [];
    const map = new Map<string, BudgetEntry[]>();
    for (const e of entries) {
      const key = normalize(e.description) || e.description;
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([key, list]) => ({
        key,
        entries: list,
        months: new Set(list.map((e) => e.transDate.slice(0, 7))).size,
        total: Math.round(list.reduce((s, e) => s + e.amount, 0) * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total);
  }, [entries]);

  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Subscriptions"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.cardHeading}>Subscriptions</h2>
            <p className={styles.mutedText}>
              AI keeps only true subscriptions (streaming, memberships, software)
              — habitual purchases are excluded. Detection only adds; your manual
              changes stick.
            </p>
          </div>
          <span className={styles.statementActions}>
            <button
              type="button"
              className={styles.btn}
              disabled={isPending}
              onClick={onDetect}
            >
              {isPending ? "Working…" : "Detect"}
            </button>
            <button type="button" className={styles.btn} onClick={onClose}>
              Close
            </button>
          </span>
        </div>

        {error && (
          <p className={styles.errorText} role="alert">
            {error}
          </p>
        )}
        {status && <p className={styles.validText}>{status}</p>}

        {entries === null ? (
          <p className={styles.mutedText}>Loading…</p>
        ) : groups.length === 0 ? (
          <p className={styles.mutedText}>No subscriptions marked yet — click Detect.</p>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              <h3 className={styles.cardSubheading}>
                {g.key} · {g.months} month{g.months === 1 ? "" : "s"} ·{" "}
                {money(g.total)} total
              </h3>
              <ul className={styles.projectionList}>
                {g.entries.map((e) => (
                  <li key={e.id} className={styles.projectionItem}>
                    <span>
                      {formatDay(e.transDate)} · {e.description} · {e.category}
                    </span>
                    <span className={styles.statementActions}>
                      <span className={styles.amountCol}>{money(e.amount)}</span>
                      <button
                        type="button"
                        className={styles.btnDanger}
                        disabled={isPending}
                        onClick={() => onRemove(e)}
                        aria-label={`Remove ${e.description} from recurring`}
                      >
                        Remove
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
