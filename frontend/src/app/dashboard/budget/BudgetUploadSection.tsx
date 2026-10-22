"use client";

import { useRef, useState, useTransition } from "react";
import { Banner, Card, Modal } from "@/app/components/ui";
import type { BudgetStatement, BudgetUploadResult } from "@/lib/server-api";
import { deleteStatementAction, uploadStatementAction } from "./actions";
import { formatDay } from "@/lib/formatDate";
import ReviewStatementModal from "./ReviewStatementModal";
import styles from "./Budgeting.module.css";

type Props = {
  statements: BudgetStatement[];
  backendConnected: boolean;
};

const MAX_VISIBLE_STATEMENTS = 5;

type UploadOutcome = {
  filename: string;
  result?: BudgetUploadResult;
  error?: string;
};

export default function BudgetUploadSection({ statements, backendConnected }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<UploadOutcome[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<BudgetStatement | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [isPending, startTransition] = useTransition();

  const shown = statements.slice(0, MAX_VISIBLE_STATEMENTS);
  const overflow = statements.length - shown.length;

  // Sequential on purpose: the transaction dedupe checks the DB at insert
  // time, so parallel uploads of overlapping statements could race past it.
  const submit = (files: File[]) => {
    if (files.length === 0) return;
    setError(null);
    setOutcomes([]);
    startTransition(async () => {
      const collected: UploadOutcome[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(
          files.length === 1
            ? "Parsing with AI…"
            : `Parsing ${i + 1} of ${files.length}: ${file.name}…`
        );
        const fd = new FormData();
        fd.append("file", file, file.name);
        const res = await uploadStatementAction(fd);
        collected.push(
          res.ok && res.result
            ? { filename: file.name, result: res.result }
            : { filename: file.name, error: res.error ?? "Upload failed" }
        );
        setOutcomes([...collected]);
      }
      setProgress(null);
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
    <Card title="Upload statement" ariaLabel="Upload statement">
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
          submit(Array.from(e.dataTransfer.files ?? []));
        }}
      >
        <p className={styles.dropzoneText}>
          {isPending
            ? progress ?? "Parsing with AI…"
            : "Drop statement PDFs here (several at once is fine), or"}
        </p>
        {!isPending && (
          <button
            type="button"
            className={styles.btn}
            disabled={!backendConnected}
            onClick={() => inputRef.current?.click()}
          >
            Choose PDFs
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => {
            submit(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      )}

      {outcomes.length > 0 && (
        <div className={styles.uploadPreview}>
          {outcomes.map((o) => (
            <div key={o.filename}>
              {o.error ? (
                <Banner tone="error">
                  {o.filename}: {o.error}
                </Banner>
              ) : (
                <>
                  <p className={styles.uploadPreviewTitle}>
                    {o.filename}: {o.result!.results.length} account
                    {o.result!.results.length === 1 ? "" : "s"} parsed, PDF stored
                  </p>
                  {o.result!.results.map((r) => (
                    <div key={r.statement.id}>
                      <p className={styles.uploadPreviewTitle}>
                        {r.entries.length} transactions from {r.statement.source} (
                        {formatDay(r.statement.statementDate)})
                        {r.skippedDuplicates > 0 &&
                          ` — ${r.skippedDuplicates} duplicate${
                            r.skippedDuplicates === 1 ? "" : "s"
                          } already on file, skipped`}
                        {r.learnedCategories > 0 &&
                          ` — ${r.learnedCategories} categorized from your history`}
                        {r.statement.validationStatus === "mismatch" && (
                          <strong> — totals mismatch, review below</strong>
                        )}
                      </p>
                      {r.problems.length > 0 && (
                        <Banner tone="warning">
                          {r.problems.map((p) => (
                            <p key={p} className={styles.bannerLine}>
                              {p}
                            </p>
                          ))}
                        </Banner>
                      )}
                    </div>
                  ))}
                </>
              )}
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

      {/* The review modal stacks on top and owns Escape while it is open. */}
      <Modal
        open={showAll}
        onClose={() => setShowAll(false)}
        title={`All statements (${statements.length})`}
      >
        <ul className={styles.statementList}>{statements.map(statementItem)}</ul>
      </Modal>

      {reviewing && (
        <ReviewStatementModal
          statement={reviewing}
          onClose={() => setReviewing(null)}
        />
      )}
    </Card>
  );
}
