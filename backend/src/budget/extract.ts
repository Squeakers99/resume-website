import OpenAI from "openai";
import {
  BUDGET_CATEGORIES,
  type BudgetCategory,
  type ExtractedEntry,
  type ExtractedStatement,
} from "./domain";

export class ExtractionError extends Error {}

const MODEL = "gpt-4.1-nano";

const SYSTEM_PROMPT = `You extract credit-card statement data from raw text.
Return every transaction in the "Transactions since your last statement" table.
Rules:
- All dates ISO-8601 (yyyy-mm-dd). Resolve month-day dates like "Jun. 9" using the
  statement period's years (a period may span a year boundary).
- All money values are positive numbers in dollars. "payments_credits" is the printed
  "Payments and credits" as a positive number.
- is_credit is true for CR lines (payments, transfers, refunds); those get category
  "Payment/Credit".
- Assign every non-credit entry the best-fitting category from the provided list.
  Use "Other" only when nothing fits.
- source is the card product + last 4 digits, e.g. "BMO Mastercard 4423".
- Extracted text may run tokens together. A description can end in a partially
  masked account number (e.g. "TRSF FROM/DE ACCT/CPT 3776-XXXX-387") followed
  immediately by the amount ("480.96") — never absorb the amount's digits into
  the account number or vice versa. The amount is the full final monetary value
  on the line.
- Do not invent, merge, or drop transactions.`;

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

const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "source",
    "statement_date",
    "period_start",
    "period_end",
    "previous_balance",
    "payments_credits",
    "purchases_total",
    "total_balance",
    "entries",
  ],
  properties: {
    source: { type: "string" },
    statement_date: { type: "string" },
    period_start: { type: "string" },
    period_end: { type: "string" },
    previous_balance: { type: "number" },
    payments_credits: { type: "number" },
    purchases_total: { type: "number" },
    total_balance: { type: "number" },
    entries: { type: "array", items: ENTRY_SCHEMA },
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

// Pure + unit-tested: turns the model's snake_case JSON into ExtractedStatement,
// rejecting anything malformed so bad data never reaches the DB.
export function mapExtractionPayload(payload: unknown): ExtractedStatement {
  if (typeof payload !== "object" || payload === null) {
    throw new ExtractionError("payload is not an object");
  }
  const p = payload as Record<string, unknown>;

  const rawEntries = p.entries;
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    throw new ExtractionError("no transactions extracted");
  }

  const entries: ExtractedEntry[] = rawEntries.map((raw, i) => {
    const e = raw as Record<string, unknown>;
    const category = e.category;
    if (
      typeof category !== "string" ||
      !(BUDGET_CATEGORIES as readonly string[]).includes(category)
    ) {
      throw new ExtractionError(`entries[${i}].category is invalid: ${String(category)}`);
    }
    return {
      transDate: requireIsoDate(e.trans_date, `entries[${i}].trans_date`),
      postingDate: requireIsoDate(e.posting_date, `entries[${i}].posting_date`),
      description: requireString(e.description, `entries[${i}].description`),
      amount: requireMagnitude(e.amount, `entries[${i}].amount`),
      isCredit: e.is_credit === true,
      category: category as BudgetCategory,
    };
  });

  return {
    source: requireString(p.source, "source"),
    statementDate: requireIsoDate(p.statement_date, "statement_date"),
    periodStart: requireIsoDate(p.period_start, "period_start"),
    periodEnd: requireIsoDate(p.period_end, "period_end"),
    previousBalance: requireFiniteNumber(p.previous_balance, "previous_balance"),
    paymentsCredits: requireMagnitude(p.payments_credits, "payments_credits"),
    purchasesTotal: requireMagnitude(p.purchases_total, "purchases_total"),
    totalBalance: requireFiniteNumber(p.total_balance, "total_balance"),
    entries,
  };
}

export async function extractStatementFromText(text: string): Promise<ExtractedStatement> {
  if (!process.env.OPENAI_API_KEY) {
    throw new ExtractionError("OPENAI_API_KEY is not set");
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await client.chat.completions.create({
    model: MODEL,
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
