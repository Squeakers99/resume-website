"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StocksHistorySeries } from "@/lib/server-api";
import { formatDay } from "./formatDate";
import styles from "./Stocks.module.css";

const money = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });

const tooltipContentStyle = {
  background: "var(--card)",
  border: "1px solid var(--card-edge)",
  borderRadius: 8,
  padding: "0.5rem 0.75rem",
  fontSize: "0.75rem",
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
};

const monthTick = (d: unknown) =>
  new Date(`${String(d)}T00:00:00`)
    .toLocaleDateString("en-CA", { month: "short" })
    .toUpperCase();

const dollarsTick = (v: number) => `$${Math.round(v).toLocaleString("en-CA")}`;

export default function PortfolioChart({ series }: { series: StocksHistorySeries[] }) {
  const [selectedId, setSelectedId] = useState("all");
  const selected = useMemo(
    () => series.find((s) => s.id === selectedId) ?? series[0],
    [series, selectedId]
  );

  return (
    <>
      <div className={styles.chartHeader}>
        <h2 className={styles.cardHeading}>Portfolio over time</h2>
        {series.length > 0 && (
          <select
            className={styles.select}
            value={selected?.id ?? "all"}
            onChange={(e) => setSelectedId(e.target.value)}
            aria-label="History scope"
          >
            {series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {!selected || selected.points.length === 0 ? (
        <p className={styles.emptyText}>No history yet.</p>
      ) : (
        <div className={styles.chartBox}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={selected.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--card-edge)" vertical={false} />
              <XAxis
                dataKey="date"
                height={30}
                fontSize={12}
                tick={{ fill: "var(--text-muted)" }}
                axisLine={{ stroke: "var(--card-edge)" }}
                tickLine={{ stroke: "var(--card-edge)" }}
                tickFormatter={monthTick}
                minTickGap={40}
              />
              <YAxis
                width={64}
                domain={["auto", "auto"]}
                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                tickMargin={4}
                axisLine={{ stroke: "var(--card-edge)" }}
                tickLine={{ stroke: "var(--card-edge)" }}
                tickFormatter={dollarsTick}
              />
              <Tooltip
                formatter={(value) => money(Number(value))}
                labelFormatter={(d) => formatDay(String(d))}
                contentStyle={tooltipContentStyle}
                itemStyle={{ color: "var(--text-main)", margin: 0 }}
                labelStyle={{ color: "var(--text-muted)", margin: 0 }}
              />
              <Line
                dataKey="value"
                stroke="var(--series-1)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
