// Deterministic parser for BMO debit-card CSV exports. The file is
// machine-formatted, so structure needs no LLM — only categorization does.
//
// Shape observed (bill-examples/statement (1).csv):
//   Following data is valid as of 20260709114529 (...)
//   First Bank Card,Transaction Type,Date Posted, Transaction Amount,Description
//   '5510290119795713',CREDIT,20260417,12.5,[CW]INTERAC ETRNSFR AD RECVD ...
// A repeated header line starts a new account block.

export class CsvParseError extends Error {}

export type CsvRow = {
  date: string; // ISO yyyy-mm-dd
  amount: number; // positive dollars
  isCredit: boolean;
  description: string;
};

export type CsvBlock = {
  card: string;
  rows: CsvRow[];
};

export function looksLikeCsv(filename: string, mimetype: string): boolean {
  if (/\.csv$/i.test(filename)) return true;
  return ["text/csv", "application/csv", "application/vnd.ms-excel"].includes(
    mimetype
  );
}

const HEADER_RE = /transaction type.*date posted.*transaction amount.*description/i;
const YMD_RE = /^(\d{4})(\d{2})(\d{2})$/;

function cleanDescription(raw: string): string {
  return raw
    .replace(/^\s*\[[A-Z]{2}\]\s*/, "") // bank channel tag like [CW]/[DN]/[IN]
    .replace(/\s+/g, " ")
    .trim();
}

export function parseBmoCsv(text: string): CsvBlock[] {
  const blocks: CsvBlock[] = [];
  let current: CsvBlock | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (HEADER_RE.test(line)) {
      current = { card: "", rows: [] };
      blocks.push(current);
      continue;
    }

    // Data row: card,TYPE,YYYYMMDD,amount,description (description last, may
    // contain anything — split only the first four commas).
    const parts = line.split(",");
    if (parts.length < 5) continue; // preamble/footer noise
    const [cardRaw, typeRaw, dateRaw, amountRaw] = parts;
    const description = cleanDescription(parts.slice(4).join(","));

    const type = typeRaw.trim().toUpperCase();
    if (type !== "CREDIT" && type !== "DEBIT") continue;

    const m = YMD_RE.exec(dateRaw.trim());
    if (!m) {
      throw new CsvParseError(`unparseable date: ${dateRaw.trim()}`);
    }
    const amount = Number(amountRaw.trim());
    if (!Number.isFinite(amount)) {
      throw new CsvParseError(`unparseable amount: ${amountRaw.trim()}`);
    }

    if (!current) {
      current = { card: "", rows: [] };
      blocks.push(current);
    }
    if (!current.card) {
      current.card = cardRaw.replace(/['"\s]/g, "");
    }
    current.rows.push({
      date: `${m[1]}-${m[2]}-${m[3]}`,
      amount: Math.abs(amount),
      isCredit: type === "CREDIT",
      description: description || "(no description)",
    });
  }

  const nonEmpty = blocks.filter((b) => b.rows.length > 0);
  if (nonEmpty.length === 0) {
    throw new CsvParseError("no transactions found in CSV");
  }
  return nonEmpty;
}
