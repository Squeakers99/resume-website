// Deterministic pre-parser for the two BMO statement layouts (Mastercard and
// Everyday Banking). Produces complete ExtractedStatement objects from the
// pdf-parse text without any LLM call; every entry's category is the
// placeholder "Other" for a later categorization step. Anything the parser
// cannot prove (a split it cannot pin down, a total that does not reconcile)
// is reported in `problems` so the caller can fall back to the LLM path.

import type {
  BudgetAccountType,
  ExtractedEntry,
  ExtractedStatement,
} from "./domain";

export type PreparseLayout = "bmo_card" | "bmo_everyday" | "unknown";

export type PreparseResult = {
  layout: PreparseLayout;
  statements: ExtractedStatement[];
  problems: string[];
};

// ----- Shared helpers -----

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_ALT = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
// Printed money: thousands commas, two decimals, no leading zeros ("0.45" ok).
const MONEY_SRC = "(?:0|[1-9]\\d{0,2}(?:,\\d{3})*)\\.\\d{2}";
const MONEY = new RegExp(`^${MONEY_SRC}$`);
const DAY_MS = 86_400_000;

// "Sep", "Sept", "September" -> 8; -1 when unknown.
function monthIndex(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase());
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function dayNumber(y: number, m: number, d: number): number | null {
  const t = Date.UTC(y, m, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m || back.getUTCDate() !== d) {
    return null;
  }
  return t / DAY_MS;
}

function isoOf(dn: number): string {
  const d = new Date(dn * DAY_MS);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

const yearOf = (dn: number) => new Date(dn * DAY_MS).getUTCFullYear();

// A month-day with no year, placed in whichever year lands closest to the
// statement period (handles periods that cross a year boundary and lines
// dated a few days before the period starts).
function resolveMonthDay(m: number, d: number, start: number, end: number): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (let y = yearOf(start) - 1; y <= yearOf(end) + 1; y++) {
    const dn = dayNumber(y, m, d);
    if (dn === null) continue;
    const dist = dn < start ? start - dn : dn > end ? dn - end : 0;
    if (dist < bestDist) {
      best = dn;
      bestDist = dist;
    }
  }
  return best;
}

// "1,234.56" -> 123456 (integer cents, no float math).
function moneyToCents(s: string): number {
  const [whole, frac] = s.replace(/,/g, "").split(".");
  return Number(whole) * 100 + Number(frac);
}

const centsToDollars = (c: number) => c / 100;
const fmt = (c: number) => (c / 100).toFixed(2);

// Splits a run of glued money values ("999.991,234.56") into its parts. Every
// value ends with exactly two decimals, so the boundaries are unambiguous.
function splitMoneyRun(run: string): number[] | null {
  const re = new RegExp(MONEY_SRC, "y");
  const out: number[] = [];
  let pos = 0;
  while (pos < run.length) {
    re.lastIndex = pos;
    const m = re.exec(run);
    if (!m) return null;
    out.push(moneyToCents(m[0]));
    pos = re.lastIndex;
  }
  return out;
}

type AmountCandidate = { cents: number; desc: string };

// `prefix` is text that ends with "<digits><amount>"; returns every way to cut
// a well-formed amount off its end (longest first), with the leftover text.
function amountCandidates(prefix: string, run: string): AmountCandidate[] {
  const out: AmountCandidate[] = [];
  for (let k = 0; k < run.length; k++) {
    const tail = run.slice(k);
    if (!MONEY.test(tail)) continue;
    const head = run.slice(0, k);
    if (head.endsWith(",") || head.endsWith(".")) continue;
    const cents = moneyToCents(tail);
    if (cents === 0) continue; // a transaction is never 0.00
    out.push({ cents, desc: prefix + head });
  }
  return out;
}

export function detectLayout(text: string): PreparseLayout {
  const compact = text.replace(/\s+/g, "");
  if (
    /EverydayBanking/i.test(compact) &&
    /Summaryofyouraccounts/i.test(compact) &&
    /Openingbalance/i.test(compact)
  ) {
    return "bmo_everyday";
  }
  if (
    /Mastercard/i.test(compact) &&
    /Summaryofyouraccount/i.test(compact) &&
    /Previoustotalbalance/i.test(compact) &&
    /Transactionssinceyourlaststatement/i.test(compact)
  ) {
    return "bmo_card";
  }
  return "unknown";
}

export function preparseStatementText(text: string): PreparseResult {
  const layout = detectLayout(text);
  if (layout === "unknown") {
    return { layout, statements: [], problems: ["preparse: unsupported layout"] };
  }
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/ /g, " ").trimEnd());
  const problems: string[] = [];
  const statements =
    layout === "bmo_card" ? parseCard(lines, problems) : parseEveryday(lines, problems);
  if (statements.length === 0 && problems.length === 0) {
    problems.push("preparse: no statements found");
  }
  return { layout, statements, problems };
}

// ----- BMO Mastercard -----

const CARD_DATE = /([A-Z][a-z]{2,8})\.? (\d{1,2}), (\d{4})/;
const CARD_ROW = new RegExp(
  `^(${MONTH_ALT})\\.? ?(\\d{1,2}) ?(${MONTH_ALT})\\.? ?(\\d+)(.*)$`
);
const CARD_AMOUNT_ONLY = new RegExp(`^(${MONEY_SRC})( ?CR)?$`);
const CARD_AMOUNT_TAIL = /^(.*?)([\d,]*\.\d{2})( ?CR)?$/;
const CARD_TERMINATOR =
  /^(Subtotal for|Total for card number|\(continued on next page\)|Transactions since your last statement)/;
const MASKED_ACCOUNT_END = /\d{4}-X{4}-\d{3}$/;
const FX_PREFIX = /^USD\s*(\d[\d,]*(?:\.\d+)?)\s*@\s*(\d+(?:\.\d+)?)\s*/;
const MAX_POSTING_GAP_DAYS = 10;

function parseCardDate(s: string): number | null {
  const m = CARD_DATE.exec(s);
  if (!m) return null;
  const mi = monthIndex(m[1]);
  if (mi < 0) return null;
  return dayNumber(Number(m[3]), mi, Number(m[2]));
}

function findLine(lines: string[], re: RegExp): RegExpExecArray | null {
  for (const l of lines) {
    const m = re.exec(l);
    if (m) return m;
  }
  return null;
}

function parseCard(lines: string[], problems: string[]): ExtractedStatement[] {
  const label = "Mastercard";
  const prevM = findLine(
    lines,
    new RegExp(`^Previous total balance\\b.*?\\d{4}\\s*(-)?\\s*\\$\\s*(${MONEY_SRC})(\\s*CR)?`)
  );
  const payM = findLine(lines, new RegExp(`^Payments and credits\\s*[-+]?\\s*\\$?\\s*(${MONEY_SRC})`));
  const purM = findLine(
    lines,
    new RegExp(`^Purchases and other charges\\s*[-+]?\\s*\\$?\\s*(${MONEY_SRC})`)
  );
  const totM = findLine(
    lines,
    new RegExp(`^Total balance\\s*(-)?\\s*\\$?\\s*(${MONEY_SRC})(\\s*CR)?`)
  );
  // Other charge buckets printed under purchases; their rows also appear in
  // the transactions table, so they count toward the charges sum.
  const otherChargeLabels = ["New installments", "Cash advances", "Total interest charges", "Fees"];
  let otherChargesCents = 0;
  for (const label of otherChargeLabels) {
    const idx = lines.findIndex((l) => l.startsWith(label));
    if (idx < 0) continue;
    // The value sits on the label line, or (after a footnote marker) on one
    // of the next two lines.
    const valueRe = new RegExp(`^[-+]?\\s*\\$?\\s*(${MONEY_SRC})$`);
    const sameLine = valueRe.exec(lines[idx].slice(label.length).trim());
    const value =
      sameLine ??
      [lines[idx + 1], lines[idx + 2]]
        .map((l) => (l === undefined ? null : valueRe.exec(l.trim())))
        .find((m) => m) ??
      null;
    if (value) otherChargesCents += moneyToCents(value[1]);
  }
  const stmtM = findLine(lines, /^Statement date\s*(.*)$/);
  const periodM = findLine(lines, /^Statement period\s*(.*?)\s*[-–]\s*(.*)$/);
  const cardM = findLine(lines, /^Card number:?\s*(?:X{4}\s*){3}(\d{4})/);

  const missing: string[] = [];
  if (!prevM) missing.push("previous total balance");
  if (!payM) missing.push("payments and credits");
  if (!purM) missing.push("purchases and other charges");
  if (!totM) missing.push("total balance");
  if (!stmtM) missing.push("statement date");
  if (!periodM) missing.push("statement period");
  if (!cardM) missing.push("card number");
  const statementDn = stmtM ? parseCardDate(stmtM[1]) : null;
  const startDn = periodM ? parseCardDate(periodM[1]) : null;
  const endDn = periodM ? parseCardDate(periodM[2]) : null;
  if (stmtM && statementDn === null) missing.push("a readable statement date");
  if (periodM && (startDn === null || endDn === null)) missing.push("a readable statement period");
  if (missing.length > 0) {
    problems.push(`${label} summary: could not find ${missing.join(", ")}`);
    return [];
  }

  const source = `BMO Mastercard ${cardM![1]}`;
  const start = startDn!;
  const end = endDn!;
  const signed = (neg: boolean, cents: number) => (neg ? -cents : cents);
  const previousCents = signed(!!prevM![1] || !!prevM![3], moneyToCents(prevM![2]));
  const paymentsCents = moneyToCents(payM![1]);
  const purchasesCents = moneyToCents(purM![1]);
  const totalCents = signed(!!totM![1] || !!totM![3], moneyToCents(totM![2]));

  const tableStart = lines.findIndex((l) => l.startsWith("Transactions since your last statement"));
  let tableEnd = -1;
  for (let i = lines.length - 1; i > tableStart; i--) {
    if (lines[i].startsWith("Total for card number")) {
      tableEnd = i;
      break;
    }
  }
  if (tableEnd < 0) {
    problems.push(`${source}: could not find the "Total for card number" line closing the transactions table`);
    tableEnd = lines.length;
  }

  const entries: ExtractedEntry[] = [];
  let rowNo = 0;
  for (let i = tableStart + 1; i < tableEnd; i++) {
    const m = CARD_ROW.exec(lines[i]);
    if (!m) continue;
    rowNo++;
    const where = `${source} row ${rowNo} (${m[1]} ${m[2]})`;

    const transDn = resolveMonthDay(monthIndex(m[1]), Number(m[2]), start, end);
    if (transDn === null) {
      problems.push(`${where}: invalid transaction date`);
      continue;
    }

    // The posting day is glued to the description, which may itself start
    // with digits ("Dec. 245 MINUTE" is Dec 24 + "5 MINUTE" or Dec 2 +
    // "45 MINUTE"). Read both the two-digit and the one-digit day: a reading
    // in the window (0 to MAX_POSTING_GAP_DAYS after the transaction date)
    // wins when it is the only one; when both are, the two-digit day wins and
    // the row is flagged; when neither is, the first non-negative gap is kept.
    const postingMonth = monthIndex(m[3]);
    const digits = m[4];
    type PostingReading = { dn: number; gap: number; body: string };
    const readings: PostingReading[] = [];
    for (const len of [2, 1]) {
      if (digits.length < len) continue;
      const dn = resolveMonthDay(postingMonth, Number(digits.slice(0, len)), start, end);
      if (dn === null) continue;
      readings.push({ dn, gap: dn - transDn, body: digits.slice(len) + m[5] });
    }
    const inWindow = readings.filter((r) => r.gap >= 0 && r.gap <= MAX_POSTING_GAP_DAYS);
    let picked: PostingReading | null = null;
    if (inWindow.length === 1) {
      picked = inWindow[0];
    } else if (inWindow.length > 1) {
      // Two-digit day first: a description starting with a digit is rarer
      // than a transaction on the 1st posting on the 10th.
      picked = inWindow[0];
      const show = (r: PostingReading) =>
        `posted ${isoOf(r.dn)} with description "${r.body.trim()}"`;
      problems.push(
        `${where}: posting day is ambiguous (${inWindow.map(show).join(" or ")}); used ${isoOf(picked.dn)}`
      );
    } else {
      picked = readings.find((r) => r.gap >= 0) ?? null;
    }
    const postingDn: number | null = picked ? picked.dn : null;
    const body = picked ? picked.body : "";
    if (postingDn === null) {
      problems.push(`${where}: could not read the posting date`);
      continue;
    }

    // Amount: at the end of the row line, or (wrapped descriptions) on its own
    // line after one or more continuation lines.
    let descParts: string[] = [];
    let candidates: AmountCandidate[] = [];
    let isCredit = false;
    const inline = CARD_AMOUNT_TAIL.exec(body);
    if (inline && /\d\.\d{2}( ?CR)?$/.test(body)) {
      // A digit run that is itself a well-formed amount is the amount (the
      // description ends in a non-digit); only an over-long run is ambiguous.
      candidates = MONEY.test(inline[2])
        ? [{ cents: moneyToCents(inline[2]), desc: inline[1] }]
        : amountCandidates(inline[1], inline[2]);
      isCredit = !!inline[3];
    } else {
      const continuation: string[] = [];
      let found = false;
      for (let j = i + 1; j < Math.min(tableEnd, i + 6); j++) {
        const l = lines[j].trim();
        if (CARD_ROW.test(l) || CARD_TERMINATOR.test(l)) break;
        const amt = CARD_AMOUNT_ONLY.exec(l);
        if (amt) {
          candidates = [{ cents: moneyToCents(amt[1]), desc: body }];
          isCredit = !!amt[2];
          descParts = continuation;
          i = j;
          found = true;
          break;
        }
        continuation.push(l);
      }
      if (!found) {
        problems.push(`${where}: no amount found`);
        continue;
      }
    }
    if (candidates.length === 0) {
      problems.push(`${where}: no amount found`);
      continue;
    }

    const fullDesc = (c: AmountCandidate) =>
      [c.desc, ...descParts].join(" ").replace(/\s+/g, " ").trim();

    // Pick the amount. Fixed-width masked accounts ("3776-XXXX-387") and FX
    // conversions (USD x rate = CAD) pin the split exactly.
    let chosen: AmountCandidate | null = null;
    const fx = FX_PREFIX.exec(fullDesc(candidates[0]));
    const fxExpected = fx
      ? Math.round(Number(fx[1].replace(/,/g, "")) * Number(fx[2]) * 100)
      : null;
    if (candidates.length === 1) {
      chosen = candidates[0];
    } else {
      const masked = candidates.filter((c) => MASKED_ACCOUNT_END.test(c.desc.trimEnd()));
      const fxFit =
        fxExpected === null ? [] : candidates.filter((c) => Math.abs(c.cents - fxExpected) <= 1);
      if (masked.length === 1) chosen = masked[0];
      else if (fxFit.length === 1) chosen = fxFit[0];
      else {
        chosen = candidates[0];
        problems.push(
          `${where}: amount is glued to digits in the description; could not split it deterministically (read ${fmt(chosen.cents)})`
        );
      }
    }
    if (fxExpected !== null && Math.abs(chosen.cents - fxExpected) > 1) {
      problems.push(
        `${where}: FX conversion ${fx![1]} USD at ${fx![2]} gives ${fmt(fxExpected)}, not the CAD amount ${fmt(chosen.cents)}`
      );
    }

    let description = fullDesc(chosen);
    const stripped = description.replace(FX_PREFIX, "").trim();
    if (stripped) description = stripped;
    if (!description) description = "Transaction";

    entries.push({
      transDate: isoOf(transDn),
      postingDate: isoOf(postingDn),
      description,
      amount: centsToDollars(chosen.cents),
      isCredit,
      category: "Other",
    });
  }

  // Validation of the total balance and credits happens in validateStatement;
  // the printed purchases figure is only checked here.
  const chargesCents = entries
    .filter((e) => !e.isCredit)
    .reduce((sum, e) => sum + Math.round(e.amount * 100), 0);
  const printedChargesCents = purchasesCents + otherChargesCents;
  if (chargesCents !== printedChargesCents) {
    problems.push(
      `${source}: charges sum ${fmt(chargesCents)} does not match printed purchases, installments, cash advances, interest and fees ${fmt(printedChargesCents)}`
    );
  }

  return [
    {
      source,
      accountType: "credit_card",
      statementDate: isoOf(statementDn!),
      periodStart: isoOf(start),
      periodEnd: isoOf(end),
      previousBalance: centsToDollars(previousCents),
      paymentsCredits: centsToDollars(paymentsCents),
      purchasesTotal: centsToDollars(purchasesCents),
      totalBalance: centsToDollars(totalCents),
      entries,
    },
  ];
}

// ----- BMO Everyday Banking -----
// pdf-parse strips every space from this layout, so all matching runs on
// whitespace-free lines.

const BANK_PERIOD_END = /Fortheperiodending([A-Z][a-z]+)(\d{1,2}),(\d{4})/i;
const BANK_SUMMARY_ROW = /^([A-Za-z]*)#(\d{4})(\d{4})-(\d{3})([\d,.]+)$/;
const BANK_SECTION = /^([A-Za-z]+)#(\d{4})(\d{4})-(\d{3})(\(continued\))?$/;
const BANK_ROW = new RegExp(`^(${MONTH_ALT})(\\d{2})(.+)$`);
const BANK_TAIL = /^(.*?)([\d,.]*\.\d{2})$/;
const MAX_CHAIN_COMBOS = 4096;

type SummaryRow = {
  product: string;
  suffix: string;
  opening: number;
  deducted: number;
  added: number;
  closing: number;
};

type BankRow = {
  where: string;
  dn: number;
  candidates: AmountCandidate[];
  balance: number | null;
};

function productName(raw: string): string {
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s*Account$/, "")
    .trim();
}

function accountTypeOf(product: string): BudgetAccountType | null {
  if (/chequing/i.test(product)) return "chequing";
  if (/savings/i.test(product)) return "savings";
  return null;
}

// Best-effort spacing for the glued bank descriptions; deterministic so the
// same line always yields the same text.
function prettifyBankDescription(raw: string): string {
  const out = raw
    .replace(/INTERACe-/g, "INTERAC e-")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/,(?=\S)/g, ", ")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z]{2,})/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return out || "Transaction";
}

// Splits "<description><amount><balance>" (or "<description><amount>" when the
// balance column is blank). The amount/balance boundary is fixed by the two
// decimals; only how many trailing description digits belong to the amount
// is open, so every possible amount is returned.
function splitBankRow(body: string): { candidates: AmountCandidate[]; balance: number | null } | null {
  const m = BANK_TAIL.exec(body);
  if (!m) return null;
  const run = m[2];
  const dots: number[] = [];
  for (let k = 0; k < run.length; k++) if (run[k] === ".") dots.push(k);
  if (dots.length === 1) {
    return { candidates: amountCandidates(m[1], run), balance: null };
  }
  const amountEnd = dots[dots.length - 2] + 3;
  const balanceStr = run.slice(amountEnd);
  if (!MONEY.test(balanceStr)) return null;
  return {
    candidates: amountCandidates(m[1], run.slice(0, amountEnd)),
    balance: moneyToCents(balanceStr),
  };
}

function parseEveryday(rawLines: string[], problems: string[]): ExtractedStatement[] {
  const lines = rawLines.map((l) => l.replace(/\s+/g, ""));
  const full = lines.join("\n");

  const endM = BANK_PERIOD_END.exec(full);
  const endMonth = endM ? monthIndex(endM[1]) : -1;
  const endDn = endM && endMonth >= 0 ? dayNumber(Number(endM[3]), endMonth, Number(endM[2])) : null;
  if (endDn === null) {
    problems.push('Everyday Banking: could not find "For the period ending" date');
    return [];
  }

  // Page-1 summary: one row per account (opening, deducted, added, closing).
  const summary: SummaryRow[] = [];
  lines.forEach((l, i) => {
    const m = BANK_SUMMARY_ROW.exec(l);
    if (!m) return;
    const product = productName(m[1] || lines[i - 1] || "");
    const values = splitMoneyRun(m[5]);
    const suffix = `${m[3]}-${m[4]}`;
    if (!values || values.length !== 4) {
      problems.push(`Everyday Banking summary row for ${product} ${suffix}: expected 4 amounts`);
      return;
    }
    const [opening, deducted, added, closing] = values;
    summary.push({ product, suffix, opening, deducted, added, closing });
  });
  if (summary.length === 0) {
    problems.push("Everyday Banking: could not read the account summary table");
  }

  // Account sections.
  type Section = {
    product: string;
    suffix: string;
    openingCents: number | null;
    openingDay: { m: number; d: number } | null;
    rows: Array<{ lineNo: number; m: number; d: number; body: string }>;
    totals: number[] | null;
  };
  const sections: Section[] = [];
  let current: Section | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const sec = BANK_SECTION.exec(l);
    if (sec) {
      const product = productName(sec[1]);
      const suffix = `${sec[3]}-${sec[4]}`;
      if (sec[5]) {
        if (!current || current.suffix !== suffix) {
          current = sections.find((s) => s.suffix === suffix && !s.totals) ?? null;
        }
      } else {
        current = { product, suffix, openingCents: null, openingDay: null, rows: [], totals: null };
        sections.push(current);
      }
      continue;
    }
    if (!current) continue;
    const row = BANK_ROW.exec(l);
    if (!row) continue;
    const m = monthIndex(row[1]);
    const d = Number(row[2]);
    const body = row[3];
    if (body.startsWith("Openingbalance")) {
      const v = splitMoneyRun(body.slice("Openingbalance".length));
      current.openingCents = v && v.length === 1 ? v[0] : null;
      current.openingDay = { m, d };
      continue;
    }
    if (body.startsWith("Closingtotals")) {
      const v = splitMoneyRun(body.slice("Closingtotals".length));
      current.totals = v && v.length === 2 ? v : [];
      current = null;
      continue;
    }
    current.rows.push({ lineNo: i + 1, m, d, body });
  }

  // Period start = the first section's opening-balance date.
  const firstOpening = sections.find((s) => s.openingDay)?.openingDay;
  const startDn = firstOpening
    ? resolveMonthDay(firstOpening.m, firstOpening.d, endDn - 62, endDn)
    : null;
  if (startDn === null) {
    problems.push("Everyday Banking: could not find an opening balance date");
    return [];
  }

  for (const s of summary) {
    if (!sections.some((sec) => sec.suffix === s.suffix)) {
      problems.push(`BMO ${s.product} ${s.suffix}: listed in the summary but its transactions section was not found`);
    }
  }

  const statements: ExtractedStatement[] = [];
  for (const sec of sections) {
    const source = `BMO ${sec.product} ${sec.suffix}`;
    const accountType = accountTypeOf(sec.product);
    if (!accountType) {
      problems.push(`${source}: unsupported account type`);
      continue;
    }
    const sum = summary.find((s) => s.suffix === sec.suffix) ?? null;
    if (!sum) problems.push(`${source}: no matching row in the account summary table`);
    if (sec.openingCents === null) problems.push(`${source}: could not read the opening balance`);
    if (!sec.totals || sec.totals.length !== 2) {
      problems.push(`${source}: could not read the closing totals row`);
    }

    const opening = sec.openingCents ?? sum?.opening ?? null;
    if (sum && sec.openingCents !== null && sum.opening !== sec.openingCents) {
      problems.push(
        `${source}: opening balance ${fmt(sec.openingCents)} does not match the summary ${fmt(sum.opening)}`
      );
    }

    // Parse rows into candidates.
    const rows: BankRow[] = [];
    for (const r of sec.rows) {
      const dn = resolveMonthDay(r.m, r.d, startDn, endDn);
      const where = `${source} row on ${MONTHS[r.m][0].toUpperCase()}${MONTHS[r.m].slice(1)} ${pad2(r.d)}`;
      const split = splitBankRow(r.body);
      if (dn === null || !split || split.candidates.length === 0) {
        problems.push(`${where}: could not read the amount and balance`);
        continue;
      }
      rows.push({ where, dn, candidates: split.candidates, balance: split.balance });
    }

    // Balance chain: each row's direction (deducted vs added) and amount come
    // from the unique split for which previous balance +/- amount = balance.
    const entries: ExtractedEntry[] = [];
    let prev: number | null = opening;
    let pending: BankRow[] = [];
    const resolveGroup = (group: BankRow[], target: number) => {
      const solutions = solveChain(group, prev, target);
      if (solutions === "too_many") {
        problems.push(`${group[0].where}: too many unresolved rows in a row to check against the running balance`);
      } else if (solutions.length !== 1) {
        const last = group[group.length - 1];
        const what =
          solutions.length === 0
            ? "no split of the amount fits the running balance"
            : "more than one split of the amount fits the running balance";
        problems.push(`${last.where}: ${what}`);
      } else {
        group.forEach((row, k) => {
          const { candidate, credit } = solutions[0][k];
          entries.push({
            transDate: isoOf(row.dn),
            postingDate: isoOf(row.dn),
            description: prettifyBankDescription(candidate.desc),
            amount: centsToDollars(candidate.cents),
            isCredit: credit,
            category: "Other",
          });
        });
      }
      // Re-anchor on the printed balance either way.
      prev = target;
    };
    for (const row of rows) {
      pending.push(row);
      if (row.balance === null) continue;
      resolveGroup(pending, row.balance);
      pending = [];
    }
    const closing = sum?.closing ?? null;
    if (pending.length > 0) {
      if (closing === null) {
        problems.push(`${pending[0].where}: no balance to check the last rows against`);
      } else {
        resolveGroup(pending, closing);
      }
    }

    // Reconcile against the closing totals row and the summary table.
    if (closing !== null && prev !== null && prev !== closing) {
      problems.push(`${source}: running balance ends at ${fmt(prev)}, not the closing balance ${fmt(closing)}`);
    }
    const deductedSum = entries.filter((e) => !e.isCredit).reduce((a, e) => a + Math.round(e.amount * 100), 0);
    const addedSum = entries.filter((e) => e.isCredit).reduce((a, e) => a + Math.round(e.amount * 100), 0);
    if (sec.totals && sec.totals.length === 2) {
      if (sec.totals[0] !== deductedSum) {
        problems.push(`${source}: amounts deducted sum ${fmt(deductedSum)} does not match the closing totals ${fmt(sec.totals[0])}`);
      }
      if (sec.totals[1] !== addedSum) {
        problems.push(`${source}: amounts added sum ${fmt(addedSum)} does not match the closing totals ${fmt(sec.totals[1])}`);
      }
    }
    if (sum) {
      if (sum.deducted !== deductedSum) {
        problems.push(`${source}: amounts deducted sum ${fmt(deductedSum)} does not match the summary ${fmt(sum.deducted)}`);
      }
      if (sum.added !== addedSum) {
        problems.push(`${source}: amounts added sum ${fmt(addedSum)} does not match the summary ${fmt(sum.added)}`);
      }
    }

    if (opening === null || closing === null) continue;
    statements.push({
      source,
      accountType,
      statementDate: isoOf(endDn),
      periodStart: isoOf(startDn),
      periodEnd: isoOf(endDn),
      previousBalance: centsToDollars(opening),
      paymentsCredits: centsToDollars(sum?.added ?? addedSum),
      purchasesTotal: centsToDollars(sum?.deducted ?? deductedSum),
      totalBalance: centsToDollars(closing),
      entries,
    });
  }
  return statements;
}

type ChainChoice = { candidate: AmountCandidate; credit: boolean };

// Enumerates (amount, direction) for every row of the group and returns the
// assignments that carry `prev` exactly to `target`. With no trusted previous
// balance every assignment fits, which reports as ambiguous.
function solveChain(
  group: BankRow[],
  prev: number | null,
  target: number
): ChainChoice[][] | "too_many" {
  let combos = 1;
  for (const row of group) combos *= row.candidates.length * 2;
  if (combos > MAX_CHAIN_COMBOS) return "too_many";
  const solutions: ChainChoice[][] = [];
  const pick: ChainChoice[] = [];
  const walk = (k: number, balance: number | null) => {
    if (solutions.length > 1) return;
    if (k === group.length) {
      if (balance === null || balance === target) solutions.push([...pick]);
      return;
    }
    for (const candidate of group[k].candidates) {
      for (const credit of [true, false]) {
        pick.push({ candidate, credit });
        walk(k + 1, balance === null ? null : balance + (credit ? candidate.cents : -candidate.cents));
        pick.pop();
      }
    }
  };
  walk(0, prev);
  return solutions;
}
