import { describe, expect, it, vi } from "vitest";
import {
  categorizeStatements,
  deterministicCategory,
  type CategorizeCaller,
  type CategorizeItem,
} from "./categorize";
import type { ExtractedEntry, ExtractedStatement } from "./domain";

// Synthetic statements only — invented descriptions, numbers and amounts.

const entry = (description: string, amount: number, isCredit = false): ExtractedEntry => ({
  transDate: "2026-02-10",
  postingDate: "2026-02-11",
  description,
  amount,
  isCredit,
  category: "Other",
});

const statements = (): ExtractedStatement[] => [
  {
    source: "BMO Mastercard 9876",
    accountType: "credit_card",
    statementDate: "2026-03-05",
    periodStart: "2026-02-06",
    periodEnd: "2026-03-05",
    previousBalance: 250,
    paymentsCredits: 262.35,
    purchasesTotal: 125.92,
    totalBalance: 113.57,
    entries: [
      entry("TRSF FROM/DE ACCT/CPT 1111-XXXX-222", 250, true), // 0 card payment
      entry("CORNER GROCER SPRINGFIELD ON", 45.67), // 1 model
      entry("REFUND STORE SPRINGFIELD ON", 12.35, true), // 2 model (card-side credit)
      entry("MOUNTAIN OUTFITTERS LTD SPRINGFIELD ON", 80.25), // 3 model
    ],
  },
  {
    source: "BMO Primary Chequing 5678-901",
    accountType: "chequing",
    statementDate: "2026-03-05",
    periodStart: "2026-02-06",
    periodEnd: "2026-03-05",
    previousBalance: 1000,
    paymentsCredits: 2150,
    purchasesTotal: 1784.5,
    totalBalance: 1365.5,
    entries: [
      entry("Direct Deposit, 13139026 EXAMPLECORP", 2000, true), // 0 income (employer ref)
      entry("Online Transfer, TF 0001111222233334444", 684.91), // 1 card payment (3 + 16 digits)
      entry("INTERAC e-Transfer Sent", 1049.59), // 2 e-transfer sent
      entry("INTERAC e-Transfer Received", 150, true), // 3 payment/credit
      entry("CITY HYDRO BILL PAYMENT", 50), // 4 model
    ],
  },
];

const stubCaller = (
  respond: (items: CategorizeItem[]) => unknown
): CategorizeCaller & ReturnType<typeof vi.fn> =>
  vi.fn(async (items: CategorizeItem[]) => respond(items)) as never;

const modelAnswers: Record<string, string> = {
  "0:1": "Groceries",
  "0:2": "Payment/Credit",
  "0:3": "Shopping & Electronics",
  "1:4": "Bills & Utilities",
};

const goodCaller = () =>
  stubCaller((items) => ({
    categories: items.map((it) => ({
      statement: it.statement,
      entry: it.entry,
      category: modelAnswers[`${it.statement}:${it.entry}`],
    })),
  }));

const categories = (list: ExtractedStatement[]) => list.map((s) => s.entries.map((e) => e.category));

const nonCategoryShape = (list: ExtractedStatement[]) =>
  list.map((s) => ({
    ...s,
    entries: s.entries.map(({ category: _category, ...rest }) => rest),
  }));

describe("deterministicCategory", () => {
  it("applies the hard owner rules", () => {
    expect(deterministicCategory(entry("PAYROLL 13139026", 10, true), "chequing")).toBe("Income");
    expect(deterministicCategory(entry("Direct Deposit, 555 ACME/PAY/PAY", 10, true), "chequing")).toBe(
      "Income"
    );
    expect(deterministicCategory(entry("PAYMENT RECEIVED - THANK YOU", 10, true), "credit_card")).toBe(
      "Card Payment"
    );
    expect(deterministicCategory(entry("TRSF FROM/DE ACCT/CPT 1111-XXXX-222", 10, true), "credit_card")).toBe(
      "Card Payment"
    );
    expect(deterministicCategory(entry("Interest Earned", 1, true), "savings")).toBe("Payment/Credit");
    expect(
      deterministicCategory(entry("Online Transfer, TF 0001111222233334444", 10), "chequing")
    ).toBe("Card Payment");
    expect(deterministicCategory(entry("INTERAC e-Transfer Received", 10, true), "chequing")).toBe(
      "Payment/Credit"
    );
    expect(deterministicCategory(entry("INTERAC e-Transfer Sent", 10), "chequing")).toBe("E-Transfer Sent");
    expect(deterministicCategory(entry("ETRNSFR SENT JOHN", 10), "chequing")).toBe("E-Transfer Sent");
  });

  it("leaves ordinary spending to the model", () => {
    expect(deterministicCategory(entry("CORNER GROCER", 10), "credit_card")).toBeNull();
    // A short transfer reference is not an own-card number.
    expect(deterministicCategory(entry("Online Transfer, TF 0001#9999-555", 10), "chequing")).toBeNull();
  });

  it("applies the employer reference to credits only", () => {
    // A payroll reversal is a debit and must not become Income.
    expect(deterministicCategory(entry("PAYROLL REVERSAL 13139026", 10), "chequing")).toBeNull();
    expect(deterministicCategory(entry("Direct Deposit, 13139026 EXAMPLECORP", 10, true), "chequing")).toBe(
      "Income"
    );
  });

  it("sends card-side credits other than TRSF and PAYMENT RECEIVED to the model", () => {
    expect(deterministicCategory(entry("REFUND STORE", 10, true), "credit_card")).toBeNull();
    expect(deterministicCategory(entry("AUTOMATIC PAYMENT - THANK YOU", 10, true), "credit_card")).toBeNull();
    expect(deterministicCategory(entry("PAIEMENT MERCI", 10, true), "credit_card")).toBeNull();
    // Bank-side credits keep their deterministic rule.
    expect(deterministicCategory(entry("REFUND STORE", 10, true), "chequing")).toBe("Payment/Credit");
  });

  it("treats only a 16- or 19-digit TF reference as an own-card transfer", () => {
    const tf = (digits: number) =>
      deterministicCategory(entry(`Online Transfer, TF ${"1".repeat(digits)}`, 10), "chequing");
    expect(tf(15)).toBeNull();
    expect(tf(16)).toBe("Card Payment");
    expect(tf(19)).toBe("Card Payment");
    expect(tf(20)).toBeNull();
    // Spaces inside the reference do not count as digits.
    expect(
      deterministicCategory(entry("Online Transfer, TF 1111 2222 3333 4444", 10), "chequing")
    ).toBe("Card Payment");
  });
});

describe("categorizeStatements", () => {
  it("applies deterministic rules and sends only the rest to the model in one call", async () => {
    const caller = goodCaller();
    const result = await categorizeStatements(statements(), { caller });

    expect(caller).toHaveBeenCalledTimes(1);
    const sent = caller.mock.calls[0][0] as CategorizeItem[];
    expect(sent.map((it) => [it.statement, it.entry, it.account_type, it.is_credit])).toEqual([
      [0, 1, "credit_card", false],
      [0, 2, "credit_card", true],
      [0, 3, "credit_card", false],
      [1, 4, "chequing", false],
    ]);

    expect(result.warnings).toEqual([]);
    expect(result.warningsByStatement).toEqual([[], []]);
    expect(result.documentWarnings).toEqual([]);
    expect(categories(result.statements)).toEqual([
      ["Card Payment", "Groceries", "Payment/Credit", "Shopping & Electronics"],
      ["Income", "Card Payment", "E-Transfer Sent", "Payment/Credit", "Bills & Utilities"],
    ]);
  });

  it("skips the model call when every entry is decided by rule", async () => {
    const caller = goodCaller();
    const input = statements();
    input[0].entries = [input[0].entries[0]];
    input[1].entries = input[1].entries.slice(0, 4);
    const result = await categorizeStatements(input, { caller });
    expect(caller).not.toHaveBeenCalled();
    expect(result.warnings).toEqual([]);
  });

  it("keeps Other for unmatched entries when the response length mismatches", async () => {
    const caller = stubCaller(() => ({
      categories: [{ statement: 0, entry: 1, category: "Groceries" }],
    }));
    const result = await categorizeStatements(statements(), { caller });
    expect(categories(result.statements)[0][1]).toBe("Groceries");
    expect(categories(result.statements)[0][2]).toBe("Other");
    expect(categories(result.statements)[0][3]).toBe("Other");
    expect(categories(result.statements)[1][4]).toBe("Other");
    expect(result.warnings.some((w) => w.includes("returned 1 categories for 4 entries"))).toBe(true);
    expect(result.warnings.some((w) => w.includes('3 entries left as "Other"'))).toBe(true);
    // Per-statement attribution: statement 0 has 2 unmatched, statement 1 has 1.
    expect(result.warningsByStatement[0].some((w) => w.includes('2 entries left as "Other"'))).toBe(true);
    expect(result.warningsByStatement[1].some((w) => w.includes('1 entry left as "Other"'))).toBe(true);
    expect(result.warningsByStatement[1].some((w) => w.includes("returned 1 categories for 4 entries"))).toBe(
      true
    );
  });

  it("ignores unknown or repeated indices", async () => {
    const caller = stubCaller(() => ({
      categories: [
        { statement: 0, entry: 1, category: "Groceries" },
        { statement: 0, entry: 1, category: "Travel" },
        { statement: 0, entry: 0, category: "Travel" }, // decided by rule, not sent
        { statement: 7, entry: 0, category: "Travel" }, // no such statement
      ],
    }));
    const result = await categorizeStatements(statements(), { caller });
    expect(categories(result.statements)[0]).toEqual([
      "Card Payment",
      "Groceries",
      "Other",
      "Other",
    ]);
    expect(result.warnings.some((w) => w.includes("ignored 3"))).toBe(true);
    expect(result.warningsByStatement[0].some((w) => w.includes("ignored 2"))).toBe(true);
    expect(result.documentWarnings.some((w) => w.includes("ignored 1 model category"))).toBe(true);
  });

  // Rule-based categories survive a failure; only model-pending entries stay "Other".
  const ruleOnly = [
    ["Card Payment", "Other", "Other", "Other"],
    ["Income", "Card Payment", "E-Transfer Sent", "Payment/Credit", "Other"],
  ];

  it("keeps the rule-based categories with a warning when the caller throws", async () => {
    const input = statements();
    const caller = stubCaller(() => {
      throw new Error("network down");
    });
    const result = await categorizeStatements(input, { caller });
    expect(categories(result.statements)).toEqual(ruleOnly);
    expect(nonCategoryShape(result.statements)).toEqual(nonCategoryShape(statements()));
    expect(result.statements).not.toBe(input);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("network down");
    expect(result.warningsByStatement.map((l) => l.length)).toEqual([1, 1]);
  });

  it("keeps the rule-based categories with a warning on a malformed response", async () => {
    const result = await categorizeStatements(statements(), { caller: stubCaller(() => "nope") });
    expect(categories(result.statements)).toEqual(ruleOnly);
    expect(result.warnings).toEqual([
      'categorize: malformed model response; model-categorized entries left as "Other"',
    ]);
  });

  it("resets a pre-set category on a model-pending entry to Other on failure", async () => {
    const input = statements();
    input[0].entries[1].category = "Travel"; // model-pending: reset to Other on failure
    const result = await categorizeStatements(input, { caller: stubCaller(() => "nope") });
    expect(categories(result.statements)).toEqual(ruleOnly);
  });

  it("attributes warnings only to statements that had model-pending entries", async () => {
    const input = statements();
    input[1].entries = input[1].entries.slice(0, 4); // statement 1 fully rule-decided
    const caller = stubCaller(() => {
      throw new Error("offline");
    });
    const result = await categorizeStatements(input, { caller });
    expect(result.warningsByStatement[0]).toHaveLength(1);
    expect(result.warningsByStatement[1]).toEqual([]);
  });

  it("never changes amounts, dates, sources, entry count or order, and does not mutate the input", async () => {
    const input = statements();
    const snapshot = structuredClone(input);
    const result = await categorizeStatements(input, { caller: goodCaller() });

    expect(input).toEqual(snapshot);
    expect(nonCategoryShape(result.statements)).toEqual(nonCategoryShape(snapshot));
    expect(result.statements[0]).not.toBe(input[0]);
    expect(result.statements[0].entries[0]).not.toBe(input[0].entries[0]);
  });
});
