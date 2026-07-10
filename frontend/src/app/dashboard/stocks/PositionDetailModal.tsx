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
import { securityChartAction, securityDetailAction, securityNewsAction } from "./actions";
import styles from "./Stocks.module.css";

const PERIODS: Array<{ id: StocksChartPeriod; label: string }> = [
  { id: "ONE_DAY", label: "1D" },
  { id: "ONE_MONTH", label: "1M" },
  { id: "THREE_MONTHS", label: "3M" },
  { id: "ONE_YEAR", label: "1Y" },
  { id: "FIVE_YEARS", label: "5Y" },
];

const money = (n: number, currency = "CAD") =>
  n.toLocaleString("en-CA", { style: "currency", currency });

const signedMoney = (n: number, currency = "CAD") =>
  `${n >= 0 ? "+" : ""}${money(n, currency)}`;

const compact = (n: number) =>
  n.toLocaleString("en-CA", { notation: "compact", maximumFractionDigits: 1 });

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
    if (period === "ONE_DAY") {
      return d.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    return d.toLocaleDateString("en-CA", { month: "short" }).toUpperCase();
  };
}

function labelFor(period: StocksChartPeriod) {
  return (t: unknown) => {
    const d = new Date(String(t));
    return period === "ONE_DAY"
      ? d.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false })
      : d
          .toLocaleDateString("en-CA", { day: "2-digit", month: "short", year: "2-digit" })
          .toUpperCase()
          .replace(/,/g, "");
  };
}

type Props = { position: StocksPosition; onClose: () => void };

export default function PositionDetailModal({ position, onClose }: Props) {
  const [detail, setDetail] = useState<StocksSecurityDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [points, setPoints] = useState<StocksChartPoint[] | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [period, setPeriod] = useState<StocksChartPeriod>("ONE_MONTH");
  const [news, setNews] = useState<StocksNewsItem[] | null>(null);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [chartPending, startChart] = useTransition();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    securityDetailAction(position.securityId).then((r) => {
      if (cancelled) return;
      if (r.ok) setDetail(r.detail);
      else setDetailError(r.error);
    });
    securityNewsAction(position.securityId).then((r) => {
      if (cancelled) return;
      if (r.ok) setNews(r.items);
      else setNewsError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [position.securityId]);

  useEffect(() => {
    let cancelled = false;
    setChartError(null);
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
          value: detail.marketCap === null ? "—" : compact(detail.marketCap * 1_000_000),
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
        { label: "Avg volume", value: detail.avgVolume === null ? "—" : compact(detail.avgVolume) },
        {
          label: "Volume",
          value: detail.dailyVolume === null ? "—" : compact(detail.dailyVolume),
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
          value: detail.employees === null ? "—" : detail.employees.toLocaleString("en-CA"),
        },
      ]
    : [];

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={`${position.symbol} details`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.cardHeading}>
              {position.symbol}
              {position.exchange ? ` · ${position.exchange}` : ""}
            </h2>
            <p className={styles.emptyText}>{position.name}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.periodRow} role="group" aria-label="Chart period">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`${styles.periodButton} ${period === p.id ? styles.periodButtonActive : ""}`}
              onClick={() => setPeriod(p.id)}
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
                  formatter={(value) => money(Number(value), detail?.currency ?? position.currency)}
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
        <section className={styles.statRow} aria-label="Position">
          <div className={styles.statTile}>
            <span className={styles.statLabel}>Quantity</span>
            <span className={styles.statValue}>{position.quantity.toLocaleString("en-CA")}</span>
          </div>
          <div className={styles.statTile}>
            <span className={styles.statLabel}>Price</span>
            <span className={styles.statValue}>
              {position.price === null ? "—" : money(position.price, position.currency)}
            </span>
          </div>
          <div className={styles.statTile}>
            <span className={styles.statLabel}>Value (CAD)</span>
            <span className={styles.statValue}>{money(position.value)}</span>
          </div>
          <div className={styles.statTile}>
            <span className={styles.statLabel}>Day</span>
            <span
              className={`${styles.statValue} ${
                position.dayChange === null ? "" : position.dayChange >= 0 ? styles.gain : styles.loss
              }`}
            >
              {position.dayChange === null ? "—" : signedMoney(position.dayChange, position.currency)}
            </span>
          </div>
          <div className={styles.statTile}>
            <span className={styles.statLabel}>Total return</span>
            <span
              className={`${styles.statValue} ${
                position.totalReturn === null
                  ? ""
                  : position.totalReturn >= 0
                    ? styles.gain
                    : styles.loss
              }`}
            >
              {position.totalReturn === null ? "—" : signedMoney(position.totalReturn)}
            </span>
          </div>
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
          ) : news.length === 0 ? (
            <p className={styles.emptyText}>No recent articles found.</p>
          ) : (
            <ul className={styles.newsList}>
              {news.map((n) => (
                <li key={n.url} className={styles.newsItem}>
                  <a href={n.url} target="_blank" rel="noopener noreferrer">
                    {n.title}
                  </a>
                  <span className={styles.newsMeta}>
                    {[n.source, n.publishedAt ? new Date(n.publishedAt).toLocaleDateString("en-CA") : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          </section>
        </div>
      </div>
    </div>
  );
}
