"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  StocksChartPeriod,
  StocksChartPoint,
  StocksNewsItem,
  StocksPosition,
  StocksSecurityDetail,
} from "@/lib/server-api";
import { Modal, StatTile } from "@/app/components/ui";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { securityChartAction, securityDetailAction, securityNewsAction } from "./actions";
import { formatDayFromDate } from "@/lib/formatDate";
import styles from "./Stocks.module.css";

const PERIODS: Array<{ id: StocksChartPeriod; label: string }> = [
  { id: "ONE_DAY", label: "1D" },
  { id: "ONE_MONTH", label: "1M" },
  { id: "THREE_MONTHS", label: "3M" },
  { id: "ONE_YEAR", label: "1Y" },
  { id: "FIVE_YEARS", label: "5Y" },
];

// Axis ticks: "14:03" for 1D, "SEP" otherwise. No shared formatter returns
// these bare parts, so local Intl formatters keep the tick text unchanged.
const TIME_FMT = new Intl.DateTimeFormat("en-CA", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const MONTH_FMT = new Intl.DateTimeFormat("en-CA", { month: "short" });

const tooltipContentStyle = {
  background: "var(--card)",
  border: "1px solid var(--card-edge)",
  borderRadius: 8,
  padding: "0.5rem 0.75rem",
  fontSize: "0.75rem",
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
};

function tickFor(period: StocksChartPeriod) {
  return (t: unknown) => {
    const d = new Date(String(t));
    if (period === "ONE_DAY") return TIME_FMT.format(d);
    return MONTH_FMT.format(d).toUpperCase();
  };
}

function labelFor(period: StocksChartPeriod) {
  return (t: unknown) =>
    period === "ONE_DAY" ? formatDateTime(String(t)) : formatDayFromDate(new Date(String(t)));
}

type Props = { position: StocksPosition; onClose: () => void };

export default function PositionDetailModal({ position, onClose }: Props) {
  const [detail, setDetail] = useState<StocksSecurityDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [points, setPoints] = useState<StocksChartPoint[] | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [period, setPeriod] = useState<StocksChartPeriod>("ONE_MONTH");
  const [news, setNews] = useState<{ items: StocksNewsItem[]; tldr: string | null } | null>(null);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [chartPending, startChart] = useTransition();

  useEffect(() => {
    let cancelled = false;
    securityDetailAction(position.securityId).then((r) => {
      if (cancelled) return;
      if (r.ok) setDetail(r.detail);
      else setDetailError(r.error);
    });
    securityNewsAction(position.securityId).then((r) => {
      if (cancelled) return;
      if (r.ok) setNews({ items: r.items, tldr: r.tldr });
      else setNewsError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [position.securityId]);

  useEffect(() => {
    let cancelled = false;
    // chartError is cleared by the period buttons (and starts null on mount);
    // the modal remounts per position, so no reset is needed here.
    startChart(async () => {
      const r = await securityChartAction(position.securityId, period);
      if (cancelled) return;
      if (r.ok) setPoints(r.points);
      else setChartError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [position.securityId, period]);

  const stats: Array<{ label: string; value: string }> = detail
    ? [
        {
          label: "Market cap",
          // WS reports marketCap in millions (live-verified 2026-07-09).
          value: detail.marketCap === null ? "—" : formatNumber(detail.marketCap * 1_000_000, { compact: true }),
        },
        { label: "P/E", value: detail.peRatio === null ? "—" : detail.peRatio.toFixed(1) },
        { label: "EPS", value: detail.eps === null ? "—" : detail.eps.toFixed(2) },
        {
          label: "52w range",
          value:
            detail.low52Week === null || detail.high52Week === null
              ? "—"
              : `${detail.low52Week.toFixed(2)} – ${detail.high52Week.toFixed(2)}`,
        },
        {
          label: "Yield",
          value: detail.dividendYield === null ? "—" : `${(detail.dividendYield * 100).toFixed(2)}%`,
        },
        { label: "Beta", value: detail.beta === null ? "—" : detail.beta.toFixed(2) },
        { label: "Avg volume", value: detail.avgVolume === null ? "—" : formatNumber(detail.avgVolume, { compact: true }) },
        {
          label: "Volume",
          value: detail.dailyVolume === null ? "—" : formatNumber(detail.dailyVolume, { compact: true }),
        },
        {
          label: "MER",
          value:
            detail.managementExpenseRatio === null
              ? "—"
              : `${(detail.managementExpenseRatio * 100).toFixed(2)}%`,
        },
        { label: "Dividends", value: detail.dividendFrequency ?? "—" },
        { label: "CEO", value: detail.ceo ?? "—" },
        { label: "HQ", value: detail.hqLocation ?? "—" },
        {
          label: "Employees",
          value: detail.employees === null ? "—" : formatNumber(detail.employees),
        },
      ]
    : [];

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <>
          {position.symbol}
          {position.exchange ? ` · ${position.exchange}` : ""}
        </>
      }
    >
      <div className={styles.modalContent}>
        <p className={styles.emptyText}>
          {position.name} · {formatNumber(position.quantity)} stock
          {position.quantity === 1 ? "" : "s"}
        </p>

        <div className={styles.periodRow} role="group" aria-label="Chart period">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`${styles.periodButton} ${period === p.id ? styles.periodButtonActive : ""}`}
              onClick={() => {
                // Same period: no refetch, so keep any error on screen.
                if (p.id === period) return;
                setChartError(null);
                setPeriod(p.id);
              }}
              disabled={chartPending && period === p.id}
            >
              {p.label}
            </button>
          ))}
        </div>

        {chartError ? (
          <p className={styles.connectError} role="alert">
            {chartError}
          </p>
        ) : !points ? (
          <p className={styles.emptyText}>Loading chart…</p>
        ) : points.length === 0 ? (
          <p className={styles.emptyText}>No price data for this period.</p>
        ) : (
          <div className={styles.chartBox}>
            {/* Numeric height: a percentage measures 0 inside a freshly
                mounted fixed overlay and renders an invisible chart. */}
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--card-edge)" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  height={30}
                  fontSize={12}
                  tick={{ fill: "var(--text-muted)" }}
                  axisLine={{ stroke: "var(--card-edge)" }}
                  tickLine={{ stroke: "var(--card-edge)" }}
                  tickFormatter={tickFor(period)}
                  minTickGap={40}
                />
                <YAxis
                  width={64}
                  domain={["auto", "auto"]}
                  tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                  tickMargin={4}
                  axisLine={{ stroke: "var(--card-edge)" }}
                  tickLine={{ stroke: "var(--card-edge)" }}
                  tickFormatter={(v: number) => v.toFixed(2)}
                />
                <Tooltip
                  formatter={(value) => formatMoney(Number(value), detail?.currency ?? position.currency)}
                  labelFormatter={labelFor(period)}
                  contentStyle={tooltipContentStyle}
                  itemStyle={{ color: "var(--text-main)", margin: 0 }}
                  labelStyle={{ color: "var(--text-muted)", margin: 0 }}
                />
                <Line
                  dataKey="price"
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

        <div className={styles.modalGrid}>
          <div className={styles.modalLeft}>
        <section className={styles.positionStats} aria-label="Position">
          <StatTile
            label="Price"
            value={position.price === null ? "—" : formatMoney(position.price, position.currency)}
          />
          <StatTile label="Value (CAD)" value={formatMoney(position.value)} />
          <StatTile
            label="Day"
            value={
              position.dayChange === null
                ? "—"
                : formatMoney(position.dayChange, position.currency, { signed: true })
            }
            tone={
              position.dayChange === null
                ? "default"
                : position.dayChange >= 0
                  ? "positive"
                  : "negative"
            }
          />
          <StatTile
            label="Total return"
            value={
              position.totalReturn === null
                ? "—"
                : formatMoney(position.totalReturn, "CAD", { signed: true })
            }
            tone={
              position.totalReturn === null
                ? "default"
                : position.totalReturn >= 0
                  ? "positive"
                  : "negative"
            }
          />
        </section>

        <section aria-label="Fundamentals">
          <h3 className={styles.modalSectionHeading}>Fundamentals</h3>
          {detailError ? (
            <p className={styles.connectError} role="alert">
              {detailError}
            </p>
          ) : !detail ? (
            <p className={styles.emptyText}>Loading…</p>
          ) : (
            <>
              <dl className={styles.fundGrid}>
                {stats.map((s) => (
                  <div key={s.label} className={styles.fundItem}>
                    <dt className={styles.statLabel}>{s.label}</dt>
                    <dd className={styles.fundValue}>{s.value}</dd>
                  </div>
                ))}
              </dl>
              {detail.description && <p className={styles.description}>{detail.description}</p>}
            </>
          )}
        </section>

          </div>

          <section className={styles.modalRight} aria-label="News">
            <h3 className={styles.modalSectionHeading}>News</h3>
          {newsError ? (
            <p className={styles.connectError} role="alert">
              {newsError}
            </p>
          ) : !news ? (
            <p className={styles.emptyText}>Loading news…</p>
          ) : news.items.length === 0 ? (
            <p className={styles.emptyText}>No recent articles found.</p>
          ) : (
            <>
              {news.tldr && (
                <p className={styles.newsTldr}>
                  <span className={styles.statLabel}>TLDR</span>
                  {news.tldr}
                </p>
              )}
              <ul className={styles.newsList}>
                {news.items.map((n) => (
                <li key={n.url} className={styles.newsCard}>
                  <a href={n.url} target="_blank" rel="noopener noreferrer">
                    {n.title}
                  </a>
                  <span className={styles.newsMeta}>
                    {[n.source, n.publishedAt ? formatDayFromDate(new Date(n.publishedAt)) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
              </ul>
            </>
          )}
          </section>
        </div>
      </div>
    </Modal>
  );
}
