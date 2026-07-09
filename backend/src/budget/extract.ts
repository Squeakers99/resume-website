import OpenAI from "openai";
import {
  ACCOUNT_TYPES,
  BUDGET_CATEGORIES,
  validateStatement,
  type BudgetAccountType,
  type BudgetCategory,
  type ExtractedEntry,
  type ExtractedStatement,
} from "./domain";

export class ExtractionError extends Error {}

const MODEL = "gpt-4.1-nano";
const FALLBACK_MODEL = "gpt-4.1-mini";

const SYSTEM_PROMPT = `You extract bank and credit-card statement data from raw text.
A single statement PDF can contain MULTIPLE account sections (e.g. a chequing
account and a savings account) — return one statement object per account, with
every transaction in that account's table.

Account types:
- credit_card: "Transactions since your last statement". money_in_total = printed
  "Payments and credits" (magnitude), money_out_total = printed "Purchases and
  other charges", opening_balance = "Previous total balance", closing_balance =
  "Total balance". is_credit is true for CR lines (payments, transfers, refunds).
- chequing / savings ("Everyday Banking" style): each account section has an
  account summary (Opening balance, Total amounts deducted, Total amounts added,
  Closing balance → opening_balance, money_out_total, money_in_total,
  closing_balance). is_credit is true for "Amounts added" lines (deposits,
  e-Transfers received, direct deposits), false for "Amounts deducted" lines.
  "Opening balance" and "Closing totals" rows are NOT transactions — skip them.
  The running Balance column is never an amount. Bank statements have a single
  date per line — use it for BOTH trans_date and posting_date.

Rules:
- All dates ISO-8601 (yyyy-mm-dd). Resolve month-day dates like "Jun. 9" using the
  statement period's years (a period may span a year boundary).
- All money values are positive numbers in dollars.
- Category rules for money-in lines:
  - Employer payroll deposits are "Income". The reference "13139026" is the
    owner's employer — any line containing it is ALWAYS "Income", as are
    "Direct Deposit ... PAY/PAY" salary lines.
  - Payments INTO a credit-card account (card-side CR lines such as "PAYMENT
    RECEIVED" or "TRSF FROM/DE ACCT/CPT ...") are "Card Payment".
  - All other money-in (e-Transfers received, refunds, interest earned) is
    "Payment/Credit".
- Bank-side money-out lines that pay the owner's own credit card (a "TRSF" to a
  card, or an Online Transfer whose reference contains a 16-digit card number)
  are "Card Payment" — the spending is tracked on the card side. Other money-out
  entries get the best-fitting category from the provided list ("Other" when
  nothing fits).
- source identifies the account: card product + last 4 digits ("BMO Mastercard
  4423") or account product + account number suffix ("BMO Primary Chequing
  3922-387").
- Extracted text may run tokens together. A description can end in a partially
  masked account number (e.g. "TRSF FROM/DE ACCT/CPT 3776-XXXX-387") followed
  immediately by the amount ("480.96") — never absorb the amount's digits into
  the account number or vice versa. The amount is the full final monetary value
  on the line.
- Return transactions in exactly the order they appear on the statement.
- Do not invent, merge, or drop transactions or accounts.`;

const ENTRY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["trans_date", "posting_date", "description", "amount", "is_credit", "category"],
  properties: {
    trans_date: { type: "string" },
    posting_date: { type: "string" },
    description: { type: "string" },
    amount: { type: "number" },
    is_credit: { type: "boolean" },
    category: { type: "string", enum: [...BUDGET_CATEGORIES] },
  },
} as const;

const STATEMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "source",
    "account_type",
    "statement_date",
    "period_start",
    "period_end",
    "opening_balance",
    "money_in_total",
    "money_out_total",
    "closing_balance",
    "entries",
  ],
  properties: {
    source: { type: "string" },
    account_type: { type: "string", enum: [...ACCOUNT_TYPES] },
    statement_date: { type: "string" },
    period_start: { type: "string" },
    period_end: { type: "string" },
    opening_balance: { type: "number" },
    money_in_total: { type: "number" },
    money_out_total: { type: "number" },
    closing_balance: { type: "number" },
    entries: { type: "array", items: ENTRY_SCHEMA },
  },
} as const;

const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["statements"],
  properties: {
    statements: { type: "array", items: STATEMENT_SCHEMA },
  },
} as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function requireIsoDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) {
    throw new ExtractionError(`${field} is not an ISO date: ${String(value)}`);
  }
  return value;
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ExtractionError(`${field} is not a number: ${String(value)}`);
  }
  return value;
}

// Magnitude fields: the statement prints some of these signed ("-580.95") and
// the model sometimes echoes the sign despite the prompt. Direction is carried
// separately (is_credit, the balance formula), so the absolute value is safe.
function requireMagnitude(value: unknown, field: string): number {
  return Math.abs(requireFiniteNumber(value, field));
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ExtractionError(`${field} is missing`);
  }
  return value.trim();
}

// Pure + unit-tested: turns the model's snake_case JSON into ExtractedStatement
// objects (one per account section), rejecting anything malformed so bad data
// never reaches the DB.
export function mapExtractionPayload(payload: unknown): ExtractedStatement[] {
  if (typeof payload !== "object" || payload === null) {
    throw new ExtractionError("payload is not an object");
  }
  const rawStatements = (payload as Record<string, unknown>).statements;
  if (!Array.isArray(rawStatements) || rawStatements.length === 0) {
    throw new ExtractionError("no statements extracted");
  }

  return rawStatements.map((rawStatement, si) => {
    const p = rawStatement as Record<string, unknown>;
    const at = `statements[${si}]`;

    const accountType = p.account_type;
    if (
      typeof accountType !== "string" ||
      !(ACCOUNT_TYPES as readonly string[]).includes(accountType)
    ) {
      throw new ExtractionError(`${at}.account_type is invalid: ${String(accountType)}`);
    }

    const rawEntries = p.entries;
    if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
      throw new ExtractionError(`${at} has no transactions`);
    }

    const entries: ExtractedEntry[] = rawEntries.map((raw, i) => {
      const e = raw as Record<string, unknown>;
      const category = e.category;
      if (
        typeof category !== "string" ||
        !(BUDGET_CATEGORIES as readonly string[]).includes(category)
      ) {
        throw new ExtractionError(`${at}.entries[${i}].category is invalid: ${String(category)}`);
      }
      const transDate = requireIsoDate(e.trans_date, `${at}.entries[${i}].trans_date`);
      // Bank statements have one date per line; models sometimes leave
      // posting_date empty there — fall back to the transaction date.
      const postingDate =
        typeof e.posting_date === "string" && ISO_DATE.test(e.posting_date)
          ? e.posting_date
          : transDate;
      return {
        transDate,
        postingDate,
        description: requireString(e.description, `${at}.entries[${i}].description`),
        amount: requireMagnitude(e.amount, `${at}.entries[${i}].amount`),
        isCredit: e.is_credit === true,
        category: category as BudgetCategory,
      };
    });

    return {
      source: requireString(p.source, `${at}.source`),
      accountType: accountType as BudgetAccountType,
      statementDate: requireIsoDate(p.statement_date, `${at}.statement_date`),
      periodStart: requireIsoDate(p.period_start, `${at}.period_start`),
      periodEnd: requireIsoDate(p.period_end, `${at}.period_end`),
      previousBalance: requireFiniteNumber(p.opening_balance, `${at}.opening_balance`),
      paymentsCredits: requireMagnitude(p.money_in_total, `${at}.money_in_total`),
      purchasesTotal: requireMagnitude(p.money_out_total, `${at}.money_out_total`),
      totalBalance: requireFiniteNumber(p.closing_balance, `${at}.closing_balance`),
      entries,
    };
  });
}

async function callModel(
  client: OpenAI,
  model: string,
  text: string
): Promise<ExtractedStatement[]> {
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "statement_extraction",
        strict: true,
        schema: EXTRACTION_JSON_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new ExtractionError("model returned no content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ExtractionError("model returned invalid JSON");
  }
  return mapExtractionPayload(parsed);
}

const problemCount = (statements: ExtractedStatement[]): number =>
  statements.reduce((sum, s) => sum + validateStatement(s).problems.length, 0);

// Cheap-first ladder: nano handles simple card statements; when its output
// fails the printed-totals validation (multi-column bank layouts trip it up),
// retry once with the stronger model and keep whichever result validates better.
export async function extractStatementsFromText(text: string): Promise<ExtractedStatement[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new ExtractionError("OPENAI_API_KEY is not set");
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const first = await callModel(client, MODEL, text);
  const firstProblems = problemCount(first);
  if (firstProblems === 0) return first;

  console.warn(
    `Extraction via ${MODEL} has ${firstProblems} validation problem(s); escalating to ${FALLBACK_MODEL}`
  );
  try {
    const second = await callModel(client, FALLBACK_MODEL, text);
    return problemCount(second) < firstProblems ? second : first;
  } catch (error) {
    console.error(`Fallback extraction via ${FALLBACK_MODEL} failed`, error);
    return first;
  }
}
