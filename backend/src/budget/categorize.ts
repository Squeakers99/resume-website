import OpenAI from "openai";
import {
  BUDGET_CATEGORIES,
  type BudgetAccountType,
  type BudgetCategory,
  type ExtractedEntry,
  type ExtractedStatement,
} from "./domain";

// Categorization step for statements that were parsed deterministically
// (preparse.ts leaves every category as "Other"). Hard owner rules are applied
// in code; only the remaining money-out lines go to the model, in one batched
// structured-output call per upload. Never throws: on any failure the
// rule-based categories are kept, the model-pending entries stay "Other", and a
// warning is returned.

const MODEL = "gpt-4.1-nano";

// Category rules only — mirrors the category section of SYSTEM_PROMPT in
// extract.ts, without the extraction instructions.
export const CATEGORY_PROMPT = `You assign a spending category to bank and credit-card statement lines.
You receive a JSON list of entries, each with a statement index, an entry index,
the account type (credit_card, chequing or savings), whether the line is a
credit (money in, or a CR line on a card) and the line's description.
Return exactly one category per entry, echoing its statement and entry indices.

Category rules:
- Employer payroll deposits are "Income". The reference "13139026" is the
  owner's employer — any line containing it is ALWAYS "Income", as are
  "Direct Deposit ... PAY/PAY" salary lines.
- Payments INTO a credit-card account (card-side CR lines such as "PAYMENT
  RECEIVED" or "TRSF FROM/DE ACCT/CPT ...") are "Card Payment". A card-side
  credit that is a payment of the card balance (e.g. "AUTOMATIC PAYMENT",
  "ONLINE PAYMENT", "PAIEMENT") is "Card Payment"; card-side refunds, rewards
  and adjustments are "Payment/Credit".
- All other money-in (e-Transfers received, refunds, interest earned) is
  "Payment/Credit".
- Bank-side money-out lines that pay the owner's own credit card (a "TRSF" to a
  card, or an Online Transfer whose reference contains a 16-digit card number)
  are "Card Payment" — the spending is tracked on the card side. Outgoing
  Interac e-Transfers to people ("INTERAC e-Transfer Sent" / "ETRNSFR SENT")
  are "E-Transfer Sent". Other money-out entries get the best-fitting category
  from the provided list ("Other" when nothing fits).
- Do not skip, merge, or add entries.`;

const CATEGORIZE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["categories"],
  properties: {
    categories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["statement", "entry", "category"],
        properties: {
          statement: { type: "integer" },
          entry: { type: "integer" },
          category: { type: "string", enum: [...BUDGET_CATEGORIES] },
        },
      },
    },
  },
} as const;

export type CategorizeItem = {
  statement: number; // index into the statements array
  entry: number; // index into that statement's entries
  account_type: BudgetAccountType;
  is_credit: boolean;
  description: string;
};

// Injectable model call: receives the entries that still need a category and
// returns the raw parsed JSON payload ({ categories: [...] }). Tests stub it.
export type CategorizeCaller = (items: CategorizeItem[]) => Promise<unknown>;

export const openAiCategorizeCaller: CategorizeCaller = async (items) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: CATEGORY_PROMPT },
      { role: "user", content: JSON.stringify({ entries: items }) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "entry_categorization",
        strict: true,
        schema: CATEGORIZE_JSON_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("model returned no content");
  }
  return JSON.parse(content);
};

const EMPLOYER_REF = "13139026";

// Bank-side transfer to the owner's own card: the TF reference is exactly the
// 16-digit card number, or 19 digits where BMO prints a 3-digit prefix before
// it. Any other length is left to the model.
function isOwnCardTransfer(description: string): boolean {
  const m = /Online\s*Transfer\s*,?\s*TF\s*([\d\s]+)/i.exec(description);
  if (!m) return false;
  const digits = m[1].replace(/\s+/g, "").length;
  return digits === 16 || digits === 19;
}

// The hard owner rules from the extraction prompt that need no judgment.
// Returns null when the model should decide.
export function deterministicCategory(
  entry: Pick<ExtractedEntry, "description" | "isCredit">,
  accountType: BudgetAccountType
): BudgetCategory | null {
  const d = entry.description;

  if (entry.isCredit) {
    // Employer payroll is a credit; a debit carrying the reference (e.g. a
    // payroll reversal) is not Income.
    if (d.includes(EMPLOYER_REF)) return "Income";
    if (/Direct\s*Deposit/i.test(d) && /PAY\s*\/\s*PAY/i.test(d)) return "Income";
    if (accountType === "credit_card") {
      if (/^\s*TRSF\b/i.test(d) || /PAYMENT\s*RECEIVED/i.test(d)) return "Card Payment";
      // Other card-side credits may be balance payments or refunds/rewards.
      return null;
    }
    return "Payment/Credit";
  }

  if (accountType !== "credit_card" && isOwnCardTransfer(d)) return "Card Payment";
  if (/INTERAC\s*e-?\s*Transfer\s*Sent/i.test(d) || /ETRNSFR\s*SENT/i.test(d)) {
    return "E-Transfer Sent";
  }
  return null;
}

const copyStatements = (statements: ExtractedStatement[]): ExtractedStatement[] =>
  statements.map((s) => ({ ...s, entries: s.entries.map((e) => ({ ...e })) }));

// Everything except category must survive categorization untouched.
function sameExceptCategory(a: ExtractedStatement[], b: ExtractedStatement[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, si) => {
    const t = b[si];
    if (
      s.source !== t.source ||
      s.accountType !== t.accountType ||
      s.statementDate !== t.statementDate ||
      s.periodStart !== t.periodStart ||
      s.periodEnd !== t.periodEnd ||
      s.previousBalance !== t.previousBalance ||
      s.paymentsCredits !== t.paymentsCredits ||
      s.purchasesTotal !== t.purchasesTotal ||
      s.totalBalance !== t.totalBalance ||
      s.entries.length !== t.entries.length
    ) {
      return false;
    }
    return s.entries.every((e, ei) => {
      const f = t.entries[ei];
      return (
        e.transDate === f.transDate &&
        e.postingDate === f.postingDate &&
        e.description === f.description &&
        e.amount === f.amount &&
        e.isCredit === f.isCredit
      );
    });
  });
}

const isIndex = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

export type CategorizeResult = {
  statements: ExtractedStatement[];
  // Flat list of every warning.
  warnings: string[];
  // warningsByStatement[i]: the warnings that concern statement i.
  warningsByStatement: string[][];
  // Warnings that cannot be tied to one statement.
  documentWarnings: string[];
};

export async function categorizeStatements(
  statements: ExtractedStatement[],
  deps: { caller?: CategorizeCaller } = {}
): Promise<CategorizeResult> {
  const caller = deps.caller ?? openAiCategorizeCaller;
  const warnings: string[] = [];
  const byStatement: string[][] = statements.map(() => []);
  const documentWarnings: string[] = [];

  // Applies the rule-based categories to a copy of the input; every entry the
  // model would decide is set to "Other" (and queued when `collect` is set).
  const pending: CategorizeItem[] = [];
  const applyRules = (list: ExtractedStatement[], collect: boolean): ExtractedStatement[] => {
    list.forEach((s, si) => {
      s.entries.forEach((e, ei) => {
        const fixed = deterministicCategory(e, s.accountType);
        if (fixed) {
          e.category = fixed;
          return;
        }
        e.category = "Other";
        if (collect) {
          pending.push({
            statement: si,
            entry: ei,
            account_type: s.accountType,
            is_credit: e.isCredit,
            description: e.description,
          });
        }
      });
    });
    return list;
  };
  const out = applyRules(copyStatements(statements), true);
  const pendingStatements = [...new Set(pending.map((p) => p.statement))];

  // Failure: keep the rule-based categories, leave model-pending entries "Other".
  const fail = (earlier: string[], warning: string, affected: number[]): CategorizeResult => {
    for (const si of affected) byStatement[si].push(warning);
    return {
      statements: applyRules(copyStatements(statements), false),
      warnings: [...earlier, warning],
      warningsByStatement: byStatement,
      documentWarnings,
    };
  };

  if (pending.length > 0) {
    let payload: unknown;
    try {
      payload = await caller(pending);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return fail(
        [],
        `categorize: model call failed (${reason}); model-categorized entries left as "Other"`,
        pendingStatements
      );
    }

    const raw =
      typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>).categories
        : undefined;
    if (!Array.isArray(raw)) {
      return fail(
        [],
        'categorize: malformed model response; model-categorized entries left as "Other"',
        pendingStatements
      );
    }

    if (raw.length !== pending.length) {
      const w = `categorize: model returned ${raw.length} categories for ${pending.length} entries`;
      warnings.push(w);
      for (const si of pendingStatements) byStatement[si].push(w);
    }

    const wanted = new Set(pending.map((p) => `${p.statement}:${p.entry}`));
    const assigned = new Set<string>();
    let rejected = 0;
    const rejectedBy = new Map<number, number>();
    let rejectedUnattributed = 0;
    for (const item of raw) {
      const r = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
      const key = `${String(r.statement)}:${String(r.entry)}`;
      if (
        !isIndex(r.statement) ||
        !isIndex(r.entry) ||
        typeof r.category !== "string" ||
        !(BUDGET_CATEGORIES as readonly string[]).includes(r.category) ||
        !wanted.has(key) ||
        assigned.has(key)
      ) {
        rejected++;
        if (isIndex(r.statement) && r.statement < statements.length) {
          rejectedBy.set(r.statement, (rejectedBy.get(r.statement) ?? 0) + 1);
        } else {
          rejectedUnattributed++;
        }
        continue;
      }
      assigned.add(key);
      out[r.statement].entries[r.entry].category = r.category as BudgetCategory;
    }
    const rejectedMsg = (n: number) =>
      `categorize: ignored ${n} model categor${n === 1 ? "y" : "ies"} with unknown or repeated indices`;
    if (rejected > 0) {
      warnings.push(rejectedMsg(rejected));
      for (const [si, n] of rejectedBy) byStatement[si].push(rejectedMsg(n));
      if (rejectedUnattributed > 0) documentWarnings.push(rejectedMsg(rejectedUnattributed));
    }
    const unmatchedMsg = (n: number) =>
      `categorize: ${n} entr${n === 1 ? "y" : "ies"} left as "Other" (no matching model category)`;
    const unmatched = pending.length - assigned.size;
    if (unmatched > 0) {
      warnings.push(unmatchedMsg(unmatched));
      const unmatchedBy = new Map<number, number>();
      for (const p of pending) {
        if (!assigned.has(`${p.statement}:${p.entry}`)) {
          out[p.statement].entries[p.entry].category = "Other";
          unmatchedBy.set(p.statement, (unmatchedBy.get(p.statement) ?? 0) + 1);
        }
      }
      for (const [si, n] of unmatchedBy) byStatement[si].push(unmatchedMsg(n));
    }
  }

  if (!sameExceptCategory(statements, out)) {
    return fail(
      warnings,
      'categorize: invariant check failed; model-categorized entries left as "Other"',
      statements.map((_, i) => i)
    );
  }
  return { statements: out, warnings, warningsByStatement: byStatement, documentWarnings };
}
