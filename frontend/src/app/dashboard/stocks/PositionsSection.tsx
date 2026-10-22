"use client";

import { useState } from "react";
import { Card, DataTable, type DataTableColumn } from "@/app/components/ui";
import { formatMoney, formatNumber } from "@/lib/format";
import type { StocksPosition } from "@/lib/server-api";
import PositionDetailModal from "./PositionDetailModal";
import styles from "./Stocks.module.css";

const pnlClass = (n: number | null) =>
  n === null ? "" : n >= 0 ? styles.gain : styles.loss;

// Nulls sort as NaN, which DataTable places after every number.
const sortNum = (n: number | null) => (n === null ? Number.NaN : n);

export default function PositionsSection({ positions }: { positions: StocksPosition[] }) {
  const [selected, setSelected] = useState<StocksPosition | null>(null);

  const columns: DataTableColumn<StocksPosition>[] = [
    {
      key: "symbol",
      header: "Symbol",
      sortValue: (p) => p.symbol,
      cell: (p) => (
        <span className={styles.symbolCell}>
          {p.symbol}
          {p.exchange ? ` · ${p.exchange}` : ""}
          <span className={styles.positionName}>{p.name}</span>
        </span>
      ),
    },
    {
      key: "quantity",
      header: "Qty",
      align: "right",
      sortValue: (p) => p.quantity,
      cell: (p) => formatNumber(p.quantity),
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      sortValue: (p) => sortNum(p.price),
      cell: (p) => (p.price === null ? "—" : formatMoney(p.price, p.currency)),
    },
    {
      key: "value",
      header: "Value (CAD)",
      align: "right",
      sortValue: (p) => p.value,
      cell: (p) => formatMoney(p.value),
    },
    {
      key: "dayChange",
      header: "Day",
      align: "right",
      sortValue: (p) => sortNum(p.dayChange),
      cell: (p) => (
        <span className={pnlClass(p.dayChange)}>
          {p.dayChange === null ? "—" : formatMoney(p.dayChange, p.currency, { signed: true })}
        </span>
      ),
    },
    {
      key: "totalReturn",
      header: "Total return",
      align: "right",
      sortValue: (p) => sortNum(p.totalReturn),
      cell: (p) => (
        <span className={pnlClass(p.totalReturn)}>
          {p.totalReturn === null ? "—" : formatMoney(p.totalReturn, "CAD", { signed: true })}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className={styles.srOnly}>Actions</span>,
      align: "right",
      cell: (p) => (
        <button
          type="button"
          className={styles.viewButton}
          onClick={() => setSelected(p)}
          aria-label={`View ${p.symbol} details`}
        >
          View
        </button>
      ),
    },
  ];

  return (
    <section className={styles.donutCard} aria-label="Positions">
      <Card as="div" title="Positions">
        {positions.length === 0 ? (
          <p className={styles.emptyText}>No open positions.</p>
        ) : (
          <div className={styles.positionsTable}>
            <DataTable
              columns={columns}
              rows={positions}
              rowKey={(p) => p.securityId}
              caption="Open positions"
              hideCaption
            />
          </div>
        )}
      </Card>
      {selected && (
        <PositionDetailModal key={selected.symbol} position={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
