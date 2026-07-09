"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { BudgetStatement, BudgetUploadResult } from "@/lib/server-api";
import { deleteStatementAction, uploadStatementAction } from "./actions";
import { formatDay } from "./formatDate";
import ReviewStatementModal from "./ReviewStatementModal";
import styles from "./Budgeting.module.css";

type Props = {
  statements: BudgetStatement[];
  backendConnected: boolean;
};

const MAX_VISIBLE_STATEMENTS = 5;

export default function BudgetUploadSection({ statements, backendConnected }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<BudgetUploadResult | null>(null);
  const [reviewing, setReviewing] = useState<BudgetStatement | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [isPending, startTransition] = useTransition();

  const shown = statements.slice(0, MAX_VISIBLE_STATEMENTS);
  const overflow = statements.length - shown.length;

  useEffect(() => {
    if (!showAll) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // The review modal stacks on top and owns Escape while it is open.
      if (e.key === "Escape" && !reviewing) setShowAll(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showAll, reviewing]);

  const submit = (file: File) => {
    setError(null);
    setLastResult(null);
    const fd = new FormData();
    fd.append("file", file, file.name);
    startTransition(async () => {
      const res = await uploadStatementAction(fd);
      if (!res.ok || !res.result) {
        setError(res.error ?? "Upload failed");
        return;
      }
      setLastResult(res.result);
    });
  };

  const onDelete = (id: string) => {
    startTransition(async () => {
      const res = await deleteStatementAction(id);
      if (!res.ok) setError(res.error ?? "Delete failed");
    });
  };

  const statementItem = (s: BudgetStatement) => (
    <li key={s.id} className={styles.statementItem}>
      <span>
        {formatDay(s.statementDate)} · {s.source} · {s.entryCount ?? "?"} entries
        {s.origin === "csv" && " · CSV"}
        {s.validationStatus === "mismatch" && (
          <strong className={styles.errorText}> · mismatch</strong>
        )}
      </span>
      <span className={styles.statementActions}>
        <button
          type="button"
          className={styles.btn}
          onClick={() => setReviewing(s)}
          aria-label={`Review ${s.source} ${formatDay(s.statementDate)} statement`}
        >
          Review
        </button>
        <button
          type="button"
          className={styles.btnDanger}
          disabled={isPending}
          onClick={() => onDelete(s.id)}
          aria-label={`Delete ${s.source} ${formatDay(s.statementDate)} statement`}
        >
          Delete
        </button>
      </span>
    </li>
  );

  return (
    <section className={styles.card} aria-label="Upload statement">
      <h2 className={styles.cardHeading}>Upload statement</h2>

      <div
        className={`${styles.dropzone} ${dragOver ? styles.dropzoneActive : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) submit(file);
        }}
      >
        <p className={styles.dropzoneText}>
          {isPending
            ? "Parsing with AI…"
            : "Drop a statement PDF here, or"}
        </p>
        {!isPending && (
          <button
            type="button"
            className={styles.btn}
            disabled={!backendConnected}
            onClick={() => inputRef.current?.click()}
          >
            Choose PDF
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) submit(file);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      )}

      {lastResult && (
        <div className={styles.uploadPreview}>
          <p className={styles.uploadPreviewTitle}>
            {lastResult.document.filename}: {lastResult.results.length} account
            {lastResult.results.length === 1 ? "" : "s"} parsed, PDF stored
          </p>
          {lastResult.results.map((r) => (
            <div key={r.statement.id}>
              <p className={styles.uploadPreviewTitle}>
                {r.entries.length} transactions from {r.statement.source} (
                {formatDay(r.statement.statementDate)})
                {r.skippedDuplicates > 0 &&
                  ` — ${r.skippedDuplicates} duplicate${
                    r.skippedDuplicates === 1 ? "" : "s"
                  } already on file, skipped`}
                {r.statement.validationStatus === "mismatch" && (
                  <strong> — totals mismatch, review below</strong>
                )}
              </p>
              {r.problems.map((p) => (
                <p key={p} className={styles.errorText}>
                  {p}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}

      <h3 className={styles.cardSubheading}>Statements</h3>
      {statements.length === 0 ? (
        <p className={styles.mutedText}>None yet.</p>
      ) : (
        <>
          <ul className={styles.statementList}>{shown.map(statementItem)}</ul>
          {overflow > 0 && (
            <div className={styles.statementListFooter}>
              <span className={styles.mutedText}>+{overflow} more</span>
              <button
                type="button"
                className={styles.btn}
                onClick={() => setShowAll(true)}
              >
                View all ({statements.length})
              </button>
            </div>
          )}
        </>
      )}

      {showAll && (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onClick={() => setShowAll(false)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label="All statements"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 className={styles.cardHeading}>
                All statements ({statements.length})
              </h2>
              <button
                type="button"
                className={styles.btn}
                onClick={() => setShowAll(false)}
              >
                Close
              </button>
            </div>
            <ul className={styles.statementList}>{statements.map(statementItem)}</ul>
          </div>
        </div>
      )}

      {reviewing && (
        <ReviewStatementModal
          statement={reviewing}
          onClose={() => setReviewing(null)}
        />
      )}
    </section>
  );
}
