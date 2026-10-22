// Shared dashboard formatters: money and dates in one module.
//
// Money variant -> formatMoney options map. Every call below returns a string
// byte-identical to the inline formatter it replaces (checked against the
// originals for 0, 12.5, -1234.56, 1234567.891, NaN, Infinity; -0 is the one
// intentional difference: it formats as 0, so signed gives "+$0.00", not "+-$0.00").
//
//   money(n)  -- n.toLocaleString("en-CA", { style: "currency", currency: "CAD" })
//     budgeting/BudgetChartsSection.tsx:103, :129, :162
//     budgeting/BudgetEntriesTable.tsx:32
//     budgeting/BudgetInsightsSection.tsx:11
//     budgeting/page.tsx:21
//     budgeting/RecurringModal.tsx:11
//     budgeting/ReviewStatementModal.tsx:18
//     stocks/AllocationDonut.tsx:21
//     stocks/PortfolioChart.tsx:17
//       -> formatMoney(n)
//
//   money(n, currency = "CAD")  -- same, currency parameterised
//     stocks/page.tsx:19
//     stocks/PositionDetailModal.tsx:32
//     stocks/PositionsSection.tsx:8
//       -> formatMoney(n, currency)
//
//   signedMoney(n, currency = "CAD")  -- `${n >= 0 ? "+" : ""}${money(n, currency)}`
//     stocks/page.tsx:22, stocks/PositionDetailModal.tsx:35,
//     stocks/PositionsSection.tsx:11
//       -> formatMoney(n, currency, { signed: true })
//
//   dollarsTick(v)  -- `$${Math.round(v).toLocaleString("en-CA")}`
//     stocks/PortfolioChart.tsx:34 (value-axis ticks)
//       -> formatMoney(v, "CAD", { cents: false })
//       Identical for v >= 0 and NaN. For v < 0 the sign moves in front of
//       the symbol ("-$1,235" instead of "$-1,235"); the axis is a portfolio
//       value and does not go negative.
//
// Number variant -> formatNumber options map (byte-identical):
//
//   n.toLocaleString("en-CA")  -- quantities and counts, no options
//     stocks/PositionsSection.tsx:47, stocks/PositionDetailModal.tsx:158, :181
//       -> formatNumber(n)
//
//   compact(n)  -- n.toLocaleString("en-CA", { notation: "compact", maximumFractionDigits: 1 })
//     stocks/PositionDetailModal.tsx:38 (market cap, volumes: "1.2M")
//       -> formatNumber(n, { compact: true })
//
// Not mapped (no byte-identical option set):
//   dollars(v)  -- `$${v.toLocaleString("en-CA")}`, budgeting/BudgetChartsSection.tsx:311
//     (axis ticks with 0-3 decimals, e.g. "$312.5"). Nearest: formatMoney(v)
//     gives "$312.50"; formatMoney(v, "CAD", { cents: false }) gives "$313".
//
// formatMoney options:
//   signed  prefix "+" when n >= 0 (negatives already carry "-").
//   cents   default true. false -> whole units, rounded with Math.round.
//   compact compact notation ("$1.2M"), at most 1 fraction digit (0 when
//           cents is false).
//
// formatNumber options:
//   decimals exactly this many fraction digits (default: en-CA default, 0-3).
//   compact  compact notation ("1.2M"), at most 1 fraction digit unless
//            decimals is given (then at most `decimals`).

import { formatDay, formatDayFromDate } from "./formatDate";

export { formatDay, formatMonth, formatDayFromDate } from "./formatDate";

export function formatMoney(
  n: number,
  currency = "CAD",
  opts?: { compact?: boolean; signed?: boolean; cents?: boolean }
): string {
  n = Object.is(n, -0) ? 0 : n;
  const cents = opts?.cents ?? true;
  let out: string;
  if (opts?.compact) {
    out = n.toLocaleString("en-CA", {
      style: "currency",
      currency,
      notation: "compact",
      minimumFractionDigits: 0,
      maximumFractionDigits: cents ? 1 : 0,
    });
  } else if (!cents) {
    out = Math.round(n).toLocaleString("en-CA", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  } else {
    out = n.toLocaleString("en-CA", { style: "currency", currency });
  }
  return opts?.signed ? `${n >= 0 ? "+" : ""}${out}` : out;
}

export function formatNumber(
  n: number,
  opts?: { compact?: boolean; decimals?: number }
): string {
  const decimals = opts?.decimals;
  if (opts?.compact) {
    return n.toLocaleString("en-CA", {
      notation: "compact",
      maximumFractionDigits: decimals ?? 1,
    });
  }
  if (decimals === undefined) return n.toLocaleString("en-CA");
  return n.toLocaleString("en-CA", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const pad2 = (v: number) => String(v).padStart(2, "0");

// "2026-06-05" -> "05 JUN 26". Date-only strings are read as calendar dates
// (no timezone shift); full timestamps are shown in the viewer's local date.
// Unparseable input is returned unchanged.
export function formatDate(iso: string): string {
  if (DATE_ONLY.test(iso)) return formatDay(iso);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDayFromDate(d);
}

// "2026-06-05T14:03:00Z" -> "05 JUN 26 10:03" (local time, 24-hour).
// Date-only strings have no time part and format like formatDate.
// Unparseable input is returned unchanged.
export function formatDateTime(iso: string): string {
  if (DATE_ONLY.test(iso)) return formatDay(iso);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${formatDayFromDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
