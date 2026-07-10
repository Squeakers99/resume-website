"use client";

import { useState } from "react";
import type { StocksPosition } from "@/lib/server-api";
import PositionDetailModal from "./PositionDetailModal";
import styles from "./Stocks.module.css";

const money = (n: number, currency = "CAD") =>
  n.toLocaleString("en-CA", { style: "currency", currency });

const signedMoney = (n: number, currency = "CAD") =>
  `${n >= 0 ? "+" : ""}${money(n, currency)}`;

const pnlClass = (n: number | null) =>
  n === null ? "" : n >= 0 ? styles.gain : styles.loss;

export default function PositionsSection({ positions }: { positions: StocksPosition[] }) {
  const [selected, setSelected] = useState<StocksPosition | null>(null);

  return (
    <section className={`${styles.card} ${styles.donutCard}`} aria-label="Positions">
      <h2 className={styles.cardHeading}>Positions</h2>
      {positions.length === 0 ? (
        <p className={styles.emptyText}>No open positions.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Symbol</th>
                <th className={styles.num}>Qty</th>
                <th className={styles.num}>Price</th>
                <th className={styles.num}>Value (CAD)</th>
                <th className={styles.num}>Day</th>
                <th className={styles.num}>Total return</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.securityId}>
                  <td className={styles.symbolCell}>
                    {p.symbol}
                    {p.exchange ? ` · ${p.exchange}` : ""}
                    <span className={styles.positionName}>{p.name}</span>
                  </td>
                  <td className={styles.num}>{p.quantity.toLocaleString("en-CA")}</td>
                  <td className={styles.num}>
                    {p.price === null ? "—" : money(p.price, p.currency)}
                  </td>
                  <td className={styles.num}>{money(p.value)}</td>
                  <td className={`${styles.num} ${pnlClass(p.dayChange)}`}>
                    {p.dayChange === null ? "—" : signedMoney(p.dayChange, p.currency)}
                  </td>
                  <td className={`${styles.num} ${pnlClass(p.totalReturn)}`}>
                    {p.totalReturn === null ? "—" : signedMoney(p.totalReturn)}
                  </td>
                  <td className={styles.num}>
                    <button
                      type="button"
                      className={styles.viewButton}
                      onClick={() => setSelected(p)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <PositionDetailModal position={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
