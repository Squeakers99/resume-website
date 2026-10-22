"use client";

import { useState, useTransition } from "react";
import { Card } from "@/app/components/ui";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { BudgetInsights } from "@/lib/server-api";
import { formatMonth } from "@/lib/formatDate";
import { refreshInsightsAction } from "./actions";
import styles from "./Budgeting.module.css";

type Props = { insights: BudgetInsights };

export default function BudgetInsightsSection({ insights }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { projection, projectionSource, recommendations, generatedAt, stale } =
    insights;

  const onRefresh = () => {
    setError(null);
    startTransition(async () => {
      const res = await refreshInsightsAction();
      if (!res.ok) setError(res.error ?? "Failed to generate recommendations");
    });
  };

  return (
    <section className={styles.insightsGrid} aria-label="Spending insights">
      <Card as="div" title="Projected spending">
        {projection ? (
          <>
            <p className={styles.mutedText}>
              {formatMonth(projection.month)} estimate,{" "}
              {projectionSource === "ai"
                ? "AI-modelled from your spending patterns"
                : `from a linear trend over your last ${projection.monthsUsed} months (generate insights for the AI model)`}
              :
            </p>
            <p className={styles.statValue}>{formatMoney(projection.total)}</p>
            <ul className={styles.projectionList}>
              {projection.byCategory.map((c) => (
                <li key={c.category} className={styles.projectionItem}>
                  <span>{c.category}</span>
                  <span className={styles.amountCol}>{formatMoney(c.projected)}</span>
                </li>
              ))}
            </ul>
            {projection.reasoning && (
              <p className={styles.mutedText}>{projection.reasoning}</p>
            )}
          </>
        ) : (
          <p className={styles.mutedText}>
            Predictions appear once at least two months of statements are on file.
          </p>
        )}
      </Card>

      <Card
        as="div"
        title="Ways to cut spending"
        actions={
          <button
            type="button"
            className={styles.btn}
            disabled={isPending}
            onClick={onRefresh}
          >
            {isPending
              ? "Analyzing…"
              : recommendations
                ? "Refresh"
                : "Generate"}
          </button>
        }
      >
        {error && (
          <p className={styles.errorText} role="alert">
            {error}
          </p>
        )}

        {recommendations ? (
          <>
            {stale && (
              <p className={styles.mutedText}>
                Your data changed since these were generated — refresh for current
                advice.
              </p>
            )}
            <ul className={styles.recList}>
              {recommendations.map((r) => (
                <li key={r.title} className={styles.recItem}>
                  <strong>{r.title}</strong>
                  <span className={styles.mutedText}>{r.detail}</span>
                </li>
              ))}
            </ul>
            {generatedAt && (
              <p className={styles.statHint}>
                Generated {formatDateTime(generatedAt)}
              </p>
            )}
          </>
        ) : (
          <p className={styles.mutedText}>
            AI reviews your real spending and suggests specific cuts. Click Generate
            to analyze.
          </p>
        )}
      </Card>
    </section>
  );
}
