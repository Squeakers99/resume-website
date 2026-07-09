"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMonth } from "./formatDate";
import styles from "./Budgeting.module.css";

type CategoryTotal = { category: string; total: number };
type MonthlyByCategory = { month: string; category: string; total: number };

type Props = {
  categoryTotals: CategoryTotal[];
  monthlyByCategory: MonthlyByCategory[];
};

const OTHER = "Other";

// The dataviz skill's categorical palette has 8 slots. Referenced by CSS
// custom property (defined per-theme in Budgeting.module.css) so the
// light/dark palette steps swap for free with the site's theme switcher.
const SERIES_VARS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];
const MAX_CHART_SLOTS = SERIES_VARS.length;

const money = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });

// Chart-display-only grouping: keep the top MAX_CHART_SLOTS categories by
// all-time total, fold everything else into "Other". This mapping is
// derived once from the all-time totals so a category's color never
// changes when the month filter changes (color follows the entity, not
// its rank in the currently-filtered view). The table/dropdown elsewhere
// keep every category — this bucketing is purely visual.
function buildChartGrouping(categoryTotals: CategoryTotal[]) {
  const sorted = [...categoryTotals].sort((a, b) => b.total - a.total);

  if (sorted.length <= MAX_CHART_SLOTS) {
    return {
      displayOrder: sorted.map((c) => c.category),
      fold: (category: string) => category,
    };
  }

  const kept = new Set(sorted.slice(0, MAX_CHART_SLOTS - 1).map((c) => c.category));
  const fold = (category: string) => (kept.has(category) ? category : OTHER);

  const foldedTotals = new Map<string, number>();
  for (const c of sorted) {
    const bucket = fold(c.category);
    foldedTotals.set(bucket, (foldedTotals.get(bucket) ?? 0) + c.total);
  }
  const displayOrder = [...foldedTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category]) => category);

  return { displayOrder, fold };
}

export default function BudgetChartsSection({
  categoryTotals,
  monthlyByCategory,
}: Props) {
  const { displayOrder, fold } = useMemo(
    () => buildChartGrouping(categoryTotals),
    [categoryTotals]
  );

  const colorFor = useCallback(
    (category: string) => {
      const idx = displayOrder.indexOf(category);
      return SERIES_VARS[idx] ?? SERIES_VARS[SERIES_VARS.length - 1];
    },
    [displayOrder]
  );

  const foldRows = useCallback(
    (rows: Array<{ category: string; total: number }>): CategoryTotal[] => {
      const totals = new Map<string, number>();
      for (const r of rows) {
        const bucket = fold(r.category);
        totals.set(bucket, (totals.get(bucket) ?? 0) + r.total);
      }
      return displayOrder
        .filter((c) => totals.has(c))
        .map((category) => ({ category, total: totals.get(category)! }));
    },
    [displayOrder, fold]
  );

  const months = useMemo(
    () => [...new Set(monthlyByCategory.map((m) => m.month))].sort(),
    [monthlyByCategory]
  );
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  // The selection can outlive its month (e.g. that statement was deleted).
  const effectiveMonth = months.includes(selectedMonth) ? selectedMonth : "all";

  const donutData = useMemo(() => {
    if (effectiveMonth === "all") return foldRows(categoryTotals);
    return foldRows(monthlyByCategory.filter((m) => m.month === effectiveMonth));
  }, [effectiveMonth, categoryTotals, monthlyByCategory, foldRows]);

  const barData = useMemo(() => {
    return months.map((month) => {
      const folded = foldRows(monthlyByCategory.filter((m) => m.month === month));
      const row: Record<string, number | string> = { month };
      for (const f of folded) row[f.category] = f.total;
      return row;
    });
  }, [months, monthlyByCategory, foldRows]);

  if (categoryTotals.length === 0) {
    return (
      <section className={styles.card} aria-label="Spending charts">
        <h2 className={styles.cardHeading}>Spending</h2>
        <p className={styles.mutedText}>
          Charts appear after your first statement upload.
        </p>
      </section>
    );
  }

  const tooltipContentStyle = {
    background: "var(--card)",
    border: "1px solid var(--card-edge)",
    borderRadius: 8,
    fontSize: "0.75rem",
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
  };
  const tooltipItemStyle = { color: "var(--text-main)" };
  const tooltipLabelStyle = { color: "var(--text-muted)" };
  const legendLabelStyle = { color: "var(--text-main)", fontSize: "0.75rem" };

  return (
    <section className={styles.chartsGrid} aria-label="Spending charts">
      <div className={styles.card}>
        <div className={styles.tableHeader}>
          <h2 className={styles.cardHeading}>Spending by category</h2>
          <select
            className={styles.select}
            value={effectiveMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            aria-label="Chart month"
          >
            <option value="all">All time</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonth(m)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.chartBox}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={donutData}
                dataKey="total"
                nameKey="category"
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={2}
                stroke="var(--card)"
                strokeWidth={2}
              >
                {donutData.map((d) => (
                  <Cell key={d.category} fill={colorFor(d.category)} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => money(Number(value))}
                contentStyle={tooltipContentStyle}
                itemStyle={tooltipItemStyle}
                labelStyle={tooltipLabelStyle}
              />
              <Legend labelStyle={legendLabelStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardHeading}>Monthly spending</h2>
        <div className={styles.chartBox}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData}>
              <CartesianGrid stroke="var(--card-edge)" vertical={false} />
              <XAxis
                dataKey="month"
                fontSize={12}
                tick={{ fill: "var(--text-muted)" }}
                axisLine={{ stroke: "var(--card-edge)" }}
                tickLine={{ stroke: "var(--card-edge)" }}
                tickFormatter={(m) => formatMonth(String(m))}
              />
              <YAxis
                fontSize={12}
                tick={{ fill: "var(--text-muted)" }}
                axisLine={{ stroke: "var(--card-edge)" }}
                tickLine={{ stroke: "var(--card-edge)" }}
                tickFormatter={(v: number) => `$${v.toLocaleString("en-CA")}`}
              />
              <Tooltip
                formatter={(value) => money(Number(value))}
                labelFormatter={(label) => formatMonth(String(label))}
                contentStyle={tooltipContentStyle}
                itemStyle={tooltipItemStyle}
                labelStyle={tooltipLabelStyle}
              />
              <Legend labelStyle={legendLabelStyle} />
              {displayOrder.map((c) => (
                <Bar
                  key={c}
                  dataKey={c}
                  stackId="spend"
                  fill={colorFor(c)}
                  stroke="var(--card)"
                  strokeWidth={2}
                  maxBarSize={24}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
