"use client";

import { useRef, useState, useTransition } from "react";
import type { BudgetStatement, BudgetUploadResult } from "@/lib/server-api";
import { deleteStatementAction, uploadStatementAction } from "./actions";
import { formatDay } from "./formatDate";
import styles from "./Budgeting.module.css";

type Props = {
  statements: BudgetStatement[];
  backendConnected: boolean;
};

export default function BudgetUploadSection({ statements, backendConnected }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<BudgetUploadResult | null>(null);
  const [isPending, startTransition] = useTransition();

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
        <ul className={styles.statementList}>
          {statements.map((s) => (
            <li key={s.id} className={styles.statementItem}>
              <span>
                {formatDay(s.statementDate)} · {s.source} · {s.entryCount ?? "?"} entries
                {s.validationStatus === "mismatch" && (
                  <strong className={styles.errorText}> · mismatch</strong>
                )}
              </span>
              <button
                type="button"
                className={styles.btnDanger}
                disabled={isPending}
                onClick={() => onDelete(s.id)}
                aria-label={`Delete ${s.source} ${formatDay(s.statementDate)} statement`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
