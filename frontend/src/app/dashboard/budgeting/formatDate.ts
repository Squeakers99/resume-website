const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

// "2026-06-05" -> "05 JUN 26"
export function formatDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1].slice(2)}`;
}

// "2026-06" -> "JUN 26"
export function formatMonth(ym: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(ym);
  if (!m) return ym;
  return `${MONTHS[Number(m[2]) - 1]} ${m[1].slice(2)}`;
}
