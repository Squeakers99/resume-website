"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatMoney } from "@/lib/format";
import styles from "./Stocks.module.css";

type Slice = { symbol: string; value: number };

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
const MAX_SLICES = SERIES_VARS.length;

const tooltipContentStyle = {
  background: "var(--card)",
  border: "1px solid var(--card-edge)",
  borderRadius: 8,
  padding: "0.5rem 0.75rem",
  fontSize: "0.75rem",
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
};

const RADIAN = Math.PI / 180;

// Percentage label beside every slice, tinted in the slice's color
// (same treatment as the budgeting donut).
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

// Top positions get their own slice; the tail folds into "Other".
function foldSlices(positions: Slice[]): Slice[] {
  const sorted = [...positions].filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= MAX_SLICES) return sorted;
  const kept = sorted.slice(0, MAX_SLICES - 1);
  const other = sorted.slice(MAX_SLICES - 1).reduce((sum, p) => sum + p.value, 0);
  return [...kept, { symbol: "Other", value: other }];
}

export default function AllocationDonut({ positions }: { positions: Slice[] }) {
  const data = useMemo(() => foldSlices(positions), [positions]);

  if (data.length === 0) {
    return <p className={styles.emptyText}>No positions to chart.</p>;
  }

  return (
    <>
      <div className={styles.chartLegend} role="list" aria-label="Allocation legend">
        {data.map((d, i) => (
          <span role="listitem" key={d.symbol} className={styles.chartLegendItem}>
            <span
              className={styles.legendSwatch}
              style={{ background: SERIES_VARS[i] }}
              aria-hidden="true"
            />
            {d.symbol}
          </span>
        ))}
      </div>
      <div className={styles.chartBox}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="symbol"
              innerRadius="50%"
              outerRadius="75%"
              paddingAngle={2}
              stroke="var(--card)"
              strokeWidth={2}
              label={renderPieLabel}
              labelLine={false}
              isAnimationActive={false}
            >
              {data.map((d, i) => (
                <Cell key={d.symbol} fill={SERIES_VARS[i]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatMoney(Number(value))}
              contentStyle={tooltipContentStyle}
              itemStyle={{ color: "var(--text-main)", margin: 0 }}
              labelStyle={{ color: "var(--text-muted)", margin: 0 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
