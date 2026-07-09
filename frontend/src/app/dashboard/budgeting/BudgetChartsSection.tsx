"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
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

type CardBill = {
  month: string;
  total: number;
  chequing: number | null;
  savings: number | null;
};

type Props = {
  categoryTotals: CategoryTotal[];
  monthlyByCategory: MonthlyByCategory[];
  cardBills: CardBill[];
};

const tooltipContentStyle = {
  background: "var(--card)",
  border: "1px solid var(--card-edge)",
  borderRadius: 8,
  padding: "0.5rem 0.75rem",
  fontSize: "0.75rem",
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
};
const tooltipItemStyle = { color: "var(--text-main)", margin: 0 };
const tooltipLabelStyle = { color: "var(--text-muted)", margin: 0 };

const RADIAN = Math.PI / 180;

// Percentage label beside every donut slice, tinted in the slice's color.
function renderPieLabel(props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  outerRadius?: number;
  percent?: number;
  fill?: string;
}) {
  const { cx, cy, midAngle, outerRadius, percent, fill } = props;
  if (
    cx === undefined ||
    cy === undefined ||
    midAngle === undefined ||
    outerRadius === undefined ||
    !percent
  ) {
    return null;
  }
  const r = outerRadius + 12;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill={fill ?? "var(--text-muted)"}
      fontSize={11}
      fontWeight={600}
      fontFamily="var(--font-geist-mono), ui-monospace, monospace"
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
    >
      {`${percent >= 0.01 ? Math.round(percent * 100) : "<1"}%`}
    </text>
  );
}

// Card-bills hover: the bill total plus that month's bank balances.
function BillTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: CardBill }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  const money = (n: number) =>
    n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
  return (
    <div style={tooltipContentStyle}>
      <p style={tooltipLabelStyle}>{formatMonth(String(label ?? row.month))}</p>
      <p style={tooltipItemStyle}>Bill total: {money(row.total)}</p>
      <p style={tooltipItemStyle}>
        Chequing: {row.chequing === null ? "—" : money(row.chequing)}
      </p>
      <p style={tooltipItemStyle}>
        Savings: {row.savings === null ? "—" : money(row.savings)}
      </p>
    </div>
  );
}

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
  cardBills,
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


  // Wider than 5 months → the time charts scroll horizontally.
  const timeChartMinWidth = (count: number) =>
    count > 5 ? `${count * 90}px` : undefined;

  // The Y axis lives in its own pinned chart (an SVG axis can't be sticky),
  // so both panes must share one explicit domain and tick set.
  const niceCeil = (v: number): number => {
    if (v <= 0) return 100;
    const pow = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 2, 2.5, 5, 10]) {
      if (v <= m * pow) return m * pow;
    }
    return 10 * pow;
  };
  const barMax = niceCeil(
    Math.max(
      0,
      ...barData.map((row) =>
        Object.entries(row).reduce(
          (sum, [k, v]) => (k === "month" ? sum : sum + Number(v)),
          0
        )
      )
    )
  );
  const lineMax = niceCeil(Math.max(0, ...cardBills.map((b) => b.total)));
  const ticksFor = (max: number) =>
    [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * max * 100) / 100);

  const TIME_MARGIN = { top: 5, right: 12, bottom: 5, left: 0 };
  const dollars = (v: number) => `$${v.toLocaleString("en-CA")}`;

  // Pinned left pane: renders only the value axis, on the same scale.
  const stickyYAxis = (max: number, label: string) => (
    <div className={styles.stickyAxis} aria-hidden="true">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={[{ month: "" }]} margin={TIME_MARGIN}>
          <YAxis
            domain={[0, max]}
            ticks={ticksFor(max)}
            fontSize={12}
            tick={{ fill: "var(--text-muted)" }}
            axisLine={{ stroke: "var(--card-edge)" }}
            tickLine={{ stroke: "var(--card-edge)" }}
            tickFormatter={dollars}
            label={{
              value: label,
              angle: -90,
              position: "insideLeft",
              offset: 4,
              style: {
                fill: "var(--text-muted)",
                fontSize: 11,
                fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                textAnchor: "middle",
              },
            }}
          />
          <XAxis dataKey="month" height={30} tick={false} axisLine={false} tickLine={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <section className={styles.chartsGrid} aria-label="Spending charts">
      {/* One shared legend for every categorical chart. */}
      <div className={styles.chartLegend} role="list" aria-label="Chart categories">
        {displayOrder.map((c) => (
          <span role="listitem" key={c} className={styles.chartLegendItem}>
            <span
              className={styles.legendSwatch}
              style={{ background: colorFor(c) }}
              aria-hidden="true"
            />
            {c}
          </span>
        ))}
      </div>

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
                innerRadius="50%"
                outerRadius="75%"
                paddingAngle={2}
                stroke="var(--card)"
                strokeWidth={2}
                label={renderPieLabel}
                labelLine={false}
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
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardHeading}>Monthly spending</h2>
        <div className={styles.stickyChart}>
          {stickyYAxis(barMax, "Spend (CAD)")}
          <div className={styles.chartScroll}>
            <div
              className={styles.chartBox}
              style={{ minWidth: timeChartMinWidth(barData.length) }}
            >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} margin={TIME_MARGIN}>
              <CartesianGrid stroke="var(--card-edge)" vertical={false} />
              <XAxis
                dataKey="month"
                height={30}
                fontSize={12}
                tick={{ fill: "var(--text-muted)" }}
                axisLine={{ stroke: "var(--card-edge)" }}
                tickLine={{ stroke: "var(--card-edge)" }}
                tickFormatter={(m) => formatMonth(String(m))}
              />
              <YAxis hide domain={[0, barMax]} ticks={ticksFor(barMax)} />
              <Tooltip
                formatter={(value) => money(Number(value))}
                labelFormatter={(label) => formatMonth(String(label))}
                contentStyle={tooltipContentStyle}
                itemStyle={tooltipItemStyle}
                labelStyle={tooltipLabelStyle}
              />
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
        </div>
      </div>

      {cardBills.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardHeading}>Card bills by month</h2>
          <div className={styles.stickyChart}>
            {stickyYAxis(lineMax, "Bill total (CAD)")}
            <div className={styles.chartScroll}>
              <div
                className={styles.chartBox}
                style={{ minWidth: timeChartMinWidth(cardBills.length) }}
              >
            <ResponsiveContainer width="100%" height={260}>
              {/* Single series: the title names it, so no legend (dataviz rule). */}
              <LineChart data={cardBills} margin={TIME_MARGIN}>
                <CartesianGrid stroke="var(--card-edge)" vertical={false} />
                <XAxis
                  dataKey="month"
                  height={30}
                  fontSize={12}
                  tick={{ fill: "var(--text-muted)" }}
                  axisLine={{ stroke: "var(--card-edge)" }}
                  tickLine={{ stroke: "var(--card-edge)" }}
                  tickFormatter={(m) => formatMonth(String(m))}
                />
                <YAxis hide domain={[0, lineMax]} ticks={ticksFor(lineMax)} />
                <Tooltip content={<BillTooltip />} />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="var(--series-1)"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--card)", strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
