import { Router } from "express";
import type { RequestHandler } from "express";
import multer from "multer";
import pdfParse from "pdf-parse";
import { prisma } from "../db/prisma";
import { BUDGET_CATEGORIES, toCents, validateStatement } from "../budget/domain";
import { ExtractionError, extractStatementFromText } from "../budget/extract";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Multer throws before the route handler runs; without this wrapper a too-large
// upload falls through to Express's default HTML 500 instead of the JSON contract.
const uploadPdf: RequestHandler = (req, res, next) => {
  upload.single("file")(req, res, (err?: unknown) => {
    if (err instanceof multer.MulterError) {
      const tooLarge = err.code === "LIMIT_FILE_SIZE";
      return res
        .status(tooLarge ? 413 : 400)
        .json({ error: tooLarge ? "PDF is larger than 10 MB" : "Invalid upload" });
    }
    if (err) return next(err as Error);
    next();
  });
};

// Memoized as a promise: the budgeting page fans out several requests in
// parallel, and concurrent CREATE TABLE IF NOT EXISTS can fail in Postgres.
let tablesReady: Promise<void> | null = null;

function ensureBudgetTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = createBudgetTables().catch((error) => {
      tablesReady = null;
      throw error;
    });
  }
  return tablesReady;
}

async function createBudgetTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS budget_statements (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      source TEXT NOT NULL,
      statement_date DATE NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      previous_balance_cents INTEGER NOT NULL,
      payments_credits_cents INTEGER NOT NULL,
      purchases_total_cents INTEGER NOT NULL,
      total_balance_cents INTEGER NOT NULL,
      validation_status TEXT NOT NULL,
      extracted_purchases_sum_cents INTEGER NOT NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (source, statement_date)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS budget_entries (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      statement_id TEXT NOT NULL REFERENCES budget_statements(id) ON DELETE CASCADE,
      trans_date DATE NOT NULL,
      posting_date DATE NOT NULL,
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      is_credit BOOLEAN NOT NULL DEFAULT FALSE,
      category TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS budget_entries_statement_idx ON budget_entries(statement_id)`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS budget_entries_date_idx ON budget_entries(trans_date)`
  );
}

type StatementRow = {
  id: string;
  source: string;
  statement_date: Date;
  period_start: Date;
  period_end: Date;
  previous_balance_cents: number;
  payments_credits_cents: number;
  purchases_total_cents: number;
  total_balance_cents: number;
  validation_status: string;
  extracted_purchases_sum_cents: number;
  uploaded_at: Date;
  entry_count?: number;
};

type EntryRow = {
  id: string;
  statement_id: string;
  trans_date: Date;
  posting_date: Date;
  description: string;
  amount_cents: number;
  is_credit: boolean;
  category: string;
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

const toStatement = (row: StatementRow) => ({
  id: row.id,
  source: row.source,
  statementDate: isoDay(row.statement_date),
  periodStart: isoDay(row.period_start),
  periodEnd: isoDay(row.period_end),
  previousBalance: row.previous_balance_cents / 100,
  paymentsCredits: row.payments_credits_cents / 100,
  purchasesTotal: row.purchases_total_cents / 100,
  totalBalance: row.total_balance_cents / 100,
  validationStatus: row.validation_status,
  extractedPurchasesSum: row.extracted_purchases_sum_cents / 100,
  uploadedAt: row.uploaded_at.toISOString(),
  entryCount: row.entry_count ?? undefined,
});

const toEntry = (row: EntryRow) => ({
  id: row.id,
  statementId: row.statement_id,
  transDate: isoDay(row.trans_date),
  postingDate: isoDay(row.posting_date),
  description: row.description,
  amount: row.amount_cents / 100,
  isCredit: row.is_credit,
  category: row.category,
});

// ----- Upload -----

router.post("/statements", uploadPdf, async (req, res) => {
  try {
    await ensureBudgetTables();

    if (!req.file || req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ error: "Upload a PDF file in the 'file' field" });
    }

    let text: string;
    try {
      const parsed = await pdfParse(req.file.buffer);
      text = parsed.text?.trim() ?? "";
    } catch {
      return res.status(422).json({ error: "Could not read that PDF" });
    }
    if (!text) {
      return res.status(422).json({ error: "That PDF contains no extractable text" });
    }

    let extracted;
    try {
      extracted = await extractStatementFromText(text);
    } catch (error) {
      console.error("Statement extraction failed", error);
      const message =
        error instanceof ExtractionError
          ? `Extraction failed: ${error.message}`
          : "Extraction failed — try again";
      return res.status(502).json({ error: message });
    }

    const dupes = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM budget_statements
      WHERE source = ${extracted.source}
        AND statement_date = ${extracted.statementDate}::date
    `;
    if (dupes.length > 0) {
      return res.status(409).json({
        error: `The ${extracted.statementDate} statement for ${extracted.source} is already uploaded`,
      });
    }

    const validation = validateStatement(extracted);

    const result = await prisma.$transaction(async (tx) => {
      const stmtRows = await tx.$queryRaw<StatementRow[]>`
        INSERT INTO budget_statements (
          source, statement_date, period_start, period_end,
          previous_balance_cents, payments_credits_cents,
          purchases_total_cents, total_balance_cents,
          validation_status, extracted_purchases_sum_cents
        ) VALUES (
          ${extracted.source}, ${extracted.statementDate}::date,
          ${extracted.periodStart}::date, ${extracted.periodEnd}::date,
          ${toCents(extracted.previousBalance)}, ${toCents(extracted.paymentsCredits)},
          ${toCents(extracted.purchasesTotal)}, ${toCents(extracted.totalBalance)},
          ${validation.status}, ${validation.extractedPurchasesSumCents}
        )
        RETURNING *
      `;
      const statement = stmtRows[0];

      const entries: EntryRow[] = [];
      for (const e of extracted.entries) {
        const rows = await tx.$queryRaw<EntryRow[]>`
          INSERT INTO budget_entries (
            statement_id, trans_date, posting_date, description,
            amount_cents, is_credit, category
          ) VALUES (
            ${statement.id}, ${e.transDate}::date, ${e.postingDate}::date,
            ${e.description}, ${toCents(e.amount)}, ${e.isCredit}, ${e.category}
          )
          RETURNING id, statement_id, trans_date, posting_date, description,
                    amount_cents, is_credit, category
        `;
        entries.push(rows[0]);
      }
      return { statement, entries };
    });

    res.status(201).json({
      statement: toStatement(result.statement),
      entries: result.entries.map(toEntry),
      problems: validation.problems,
    });
  } catch (error) {
    // Concurrent upload of the same statement can slip past the pre-check and
    // hit UNIQUE (source, statement_date) — surface it as the intended 409.
    const meta = (error as { meta?: { code?: string; message?: string } })?.meta;
    const detail = `${meta?.code ?? ""} ${meta?.message ?? ""} ${
      error instanceof Error ? error.message : ""
    }`;
    if (detail.includes("23505")) {
      return res.status(409).json({ error: "This statement is already uploaded" });
    }
    console.error("Failed to upload statement", error);
    res.status(500).json({ error: "Failed to process statement" });
  }
});

// ----- Reads -----

router.get("/statements", async (_req, res) => {
  try {
    await ensureBudgetTables();
    const rows = await prisma.$queryRaw<StatementRow[]>`
      SELECT s.*, (SELECT COUNT(*)::int FROM budget_entries e WHERE e.statement_id = s.id) AS entry_count
      FROM budget_statements s
      ORDER BY s.statement_date DESC
    `;
    res.json(rows.map(toStatement));
  } catch (error) {
    console.error("Failed to list statements", error);
    res.status(500).json({ error: "Failed to list statements" });
  }
});

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

router.get("/entries", async (req, res) => {
  try {
    await ensureBudgetTables();
    const q = (name: string) =>
      typeof req.query[name] === "string" ? (req.query[name] as string) : null;
    const category = q("category");
    const from = ISO_DAY.test(q("from") ?? "") ? q("from") : null;
    const to = ISO_DAY.test(q("to") ?? "") ? q("to") : null;
    const rows = await prisma.$queryRaw<EntryRow[]>`
      SELECT id, statement_id, trans_date, posting_date, description,
             amount_cents, is_credit, category
      FROM budget_entries
      WHERE (${category}::text IS NULL OR category = ${category})
        AND (${from}::date IS NULL OR trans_date >= ${from}::date)
        AND (${to}::date IS NULL OR trans_date <= ${to}::date)
      ORDER BY trans_date DESC, posting_date DESC
      LIMIT 500
    `;
    res.json(rows.map(toEntry));
  } catch (error) {
    console.error("Failed to list entries", error);
    res.status(500).json({ error: "Failed to list entries" });
  }
});

// ----- Mutations -----

router.patch("/entries/:id", async (req, res) => {
  try {
    await ensureBudgetTables();
    const { category } = req.body ?? {};
    if (!(BUDGET_CATEGORIES as readonly string[]).includes(category)) {
      return res.status(400).json({ error: "invalid category" });
    }
    const rows = await prisma.$queryRaw<EntryRow[]>`
      UPDATE budget_entries SET category = ${category}
      WHERE id = ${req.params.id}
      RETURNING id, statement_id, trans_date, posting_date, description,
                amount_cents, is_credit, category
    `;
    if (rows.length === 0) return res.status(404).json({ error: "entry not found" });
    res.json(toEntry(rows[0]));
  } catch (error) {
    console.error("Failed to update entry", error);
    res.status(500).json({ error: "Failed to update entry" });
  }
});

router.delete("/statements/:id", async (req, res) => {
  try {
    await ensureBudgetTables();
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      DELETE FROM budget_statements WHERE id = ${req.params.id} RETURNING id
    `;
    if (rows.length === 0) return res.status(404).json({ error: "statement not found" });
    res.status(204).end();
  } catch (error) {
    console.error("Failed to delete statement", error);
    res.status(500).json({ error: "Failed to delete statement" });
  }
});

// ----- Summary (chart aggregates; spend only) -----

router.get("/summary", async (_req, res) => {
  try {
    await ensureBudgetTables();

    const latestRows = await prisma.$queryRaw<StatementRow[]>`
      SELECT s.*, (SELECT COUNT(*)::int FROM budget_entries e WHERE e.statement_id = s.id) AS entry_count
      FROM budget_statements s
      ORDER BY s.statement_date DESC
      LIMIT 1
    `;
    const countRows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM budget_statements
    `;
    const categoryTotals = await prisma.$queryRaw<
      Array<{ category: string; total_cents: number }>
    >`
      SELECT category, SUM(amount_cents)::int AS total_cents
      FROM budget_entries
      WHERE NOT is_credit AND category <> 'Payment/Credit'
      GROUP BY category
      ORDER BY total_cents DESC
    `;
    const monthlyByCategory = await prisma.$queryRaw<
      Array<{ month: string; category: string; total_cents: number }>
    >`
      SELECT to_char(date_trunc('month', trans_date), 'YYYY-MM') AS month,
             category, SUM(amount_cents)::int AS total_cents
      FROM budget_entries
      WHERE NOT is_credit AND category <> 'Payment/Credit'
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `;

    res.json({
      latest: latestRows.length ? toStatement(latestRows[0]) : null,
      statementCount: countRows[0].count,
      categoryTotals: categoryTotals.map((r) => ({
        category: r.category,
        total: r.total_cents / 100,
      })),
      monthlyByCategory: monthlyByCategory.map((r) => ({
        month: r.month,
        category: r.category,
        total: r.total_cents / 100,
      })),
    });
  } catch (error) {
    console.error("Failed to build summary", error);
    res.status(500).json({ error: "Failed to build summary" });
  }
});

export default router;
