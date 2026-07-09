import { createHash } from "crypto";
import { Router } from "express";
import type { RequestHandler } from "express";
import multer from "multer";
import pdfParse from "pdf-parse";
import { prisma } from "../db/prisma";
import {
  BUDGET_CATEGORIES,
  toCents,
  validateStatement,
  type BudgetAccountType,
  type BudgetCategory,
  type ExtractedStatement,
} from "../budget/domain";
import { ExtractionError, extractStatementsFromText } from "../budget/extract";
import { deleteStatementPdf, putStatementPdf } from "../lib/s3";

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
  // One row per uploaded PDF; the raw file lives in S3 under s3_key.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS budget_documents (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      filename TEXT NOT NULL,
      s3_key TEXT NOT NULL,
      content_hash TEXT NOT NULL UNIQUE,
      size_bytes INTEGER NOT NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

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

  // Columns added after the initial table shipped (same pattern as Project.secondaryImages).
  await prisma.$executeRawUnsafe(`
    ALTER TABLE budget_statements
    ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'credit_card'
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE budget_statements
    ADD COLUMN IF NOT EXISTS document_id TEXT REFERENCES budget_documents(id)
  `);
  // 'pdf' statements carry real printed balances; 'csv' ones are synthesized
  // from transaction flow and are never used for balance tiles.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE budget_statements
    ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'pdf'
  `);
}

type StatementRow = {
  id: string;
  source: string;
  account_type: string;
  document_id: string | null;
  origin: string;
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
  accountType: row.account_type,
  documentId: row.document_id,
  origin: row.origin,
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

// Rebuild a statement + its entries from the DB and re-run the printed-totals
// validation — used after manual edits so the mismatch flag stays truthful.
async function revalidateStatement(
  statementId: string
): Promise<{ statement: StatementRow; problems: string[] } | null> {
  const stmtRows = await prisma.$queryRaw<StatementRow[]>`
    SELECT * FROM budget_statements WHERE id = ${statementId}
  `;
  if (stmtRows.length === 0) return null;
  const s = stmtRows[0];

  // CSV statements have no printed totals to reconcile against (their summary
  // is synthesized) — they are always considered valid.
  if (s.origin === "csv") {
    const updated = await prisma.$queryRaw<StatementRow[]>`
      UPDATE budget_statements SET validation_status = 'valid'
      WHERE id = ${statementId} RETURNING *
    `;
    return { statement: updated[0], problems: [] };
  }

  const entryRows = await prisma.$queryRaw<EntryRow[]>`
    SELECT id, statement_id, trans_date, posting_date, description,
           amount_cents, is_credit, category
    FROM budget_entries WHERE statement_id = ${statementId}
  `;

  const extracted: ExtractedStatement = {
    source: s.source,
    accountType: s.account_type as BudgetAccountType,
    statementDate: isoDay(s.statement_date),
    periodStart: isoDay(s.period_start),
    periodEnd: isoDay(s.period_end),
    previousBalance: s.previous_balance_cents / 100,
    paymentsCredits: s.payments_credits_cents / 100,
    purchasesTotal: s.purchases_total_cents / 100,
    totalBalance: s.total_balance_cents / 100,
    entries: entryRows.map((e) => ({
      transDate: isoDay(e.trans_date),
      postingDate: isoDay(e.posting_date),
      description: e.description,
      amount: e.amount_cents / 100,
      isCredit: e.is_credit,
      category: e.category as BudgetCategory,
    })),
  };
  const validation = validateStatement(extracted);

  const updated = await prisma.$queryRaw<StatementRow[]>`
    UPDATE budget_statements
    SET validation_status = ${validation.status},
        extracted_purchases_sum_cents = ${validation.extractedPurchasesSumCents}
    WHERE id = ${statementId}
    RETURNING *
  `;
  return { statement: updated[0], problems: validation.problems };
}

// ----- Upload -----

router.post("/statements", uploadPdf, async (req, res) => {
  try {
    await ensureBudgetTables();

    if (!req.file || req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ error: "Upload a PDF file in the 'file' field" });
    }
    const origin = "pdf"; // 'csv' remains only on historical rows

    // Exact-file dedupe first — cheaper than an OpenAI call.
    const contentHash = createHash("sha256").update(req.file.buffer).digest("hex");
    const docDupes = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM budget_documents WHERE content_hash = ${contentHash}
    `;
    if (docDupes.length > 0) {
      return res.status(409).json({ error: "This exact PDF is already uploaded" });
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
      extracted = await extractStatementsFromText(text);
    } catch (error) {
      console.error("Statement extraction failed", error);
      const message =
        error instanceof ExtractionError
          ? `Extraction failed: ${error.message}`
          : "Extraction failed — try again";
      return res.status(502).json({ error: message });
    }

    // One PDF can contain several account sections; reject the whole upload if
    // any of them is already on file.
    for (const s of extracted) {
      const dupes = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM budget_statements
        WHERE source = ${s.source} AND statement_date = ${s.statementDate}::date
      `;
      if (dupes.length > 0) {
        return res.status(409).json({
          error: `The ${s.statementDate} statement for ${s.source} is already uploaded`,
        });
      }
    }

    const validations = extracted.map(validateStatement);

    const filename = req.file.originalname || "statement.pdf";
    const s3Key = `statements/${contentHash.slice(0, 32)}.pdf`;
    try {
      await putStatementPdf(s3Key, req.file.buffer);
    } catch (error) {
      console.error("Failed to store statement PDF in S3", error);
      return res.status(502).json({
        error:
          "Could not store the PDF in S3 — check the bucket policy allows PutObject on statements/*",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const docRows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO budget_documents (filename, s3_key, content_hash, size_bytes)
        VALUES (${filename}, ${s3Key}, ${contentHash}, ${req.file!.size})
        RETURNING id
      `;
      const documentId = docRows[0].id;

      const results: Array<{
        statement: StatementRow;
        entries: EntryRow[];
        skippedDuplicates: number;
      }> = [];
      for (let i = 0; i < extracted.length; i++) {
        const s = extracted[i];
        const validation = validations[i];
        const stmtRows = await tx.$queryRaw<StatementRow[]>`
          INSERT INTO budget_statements (
            source, account_type, document_id, origin, statement_date, period_start, period_end,
            previous_balance_cents, payments_credits_cents,
            purchases_total_cents, total_balance_cents,
            validation_status, extracted_purchases_sum_cents
          ) VALUES (
            ${s.source}, ${s.accountType}, ${documentId}, ${origin}, ${s.statementDate}::date,
            ${s.periodStart}::date, ${s.periodEnd}::date,
            ${toCents(s.previousBalance)}, ${toCents(s.paymentsCredits)},
            ${toCents(s.purchasesTotal)}, ${toCents(s.totalBalance)},
            ${validation.status}, ${validation.extractedPurchasesSumCents}
          )
          RETURNING *
        `;
        const statement = stmtRows[0];

        const entries: EntryRow[] = [];
        let skippedDuplicates = 0;
        for (const e of s.entries) {
          // The same transaction can arrive via different formats (a May CSV
          // and a May PDF); never record it twice. Same-statement repeats are
          // allowed — a single document listing identical rows is authoritative.
          const dupe = await tx.$queryRaw<Array<{ found: boolean }>>`
            SELECT EXISTS (
              SELECT 1 FROM budget_entries
              WHERE trans_date = ${e.transDate}::date
                AND amount_cents = ${toCents(e.amount)}
                AND is_credit = ${e.isCredit}
                AND statement_id <> ${statement.id}
            ) AS found
          `;
          if (dupe[0].found) {
            skippedDuplicates++;
            continue;
          }
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
        results.push({ statement, entries, skippedDuplicates });
      }
      return { documentId, results };
    });

    res.status(201).json({
      document: { id: result.documentId, filename, s3Key },
      results: result.results.map((r, i) => ({
        statement: toStatement(r.statement),
        entries: r.entries.map(toEntry),
        problems: validations[i].problems,
        skippedDuplicates: r.skippedDuplicates,
      })),
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
      WHERE category <> 'Card Payment'
        AND (${category}::text IS NULL OR category = ${category})
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

// All entries of one statement, including hidden Card Payment rows — the
// review modal needs the complete picture to reconcile a mismatch.
router.get("/statements/:id/entries", async (req, res) => {
  try {
    await ensureBudgetTables();
    const rows = await prisma.$queryRaw<EntryRow[]>`
      SELECT id, statement_id, trans_date, posting_date, description,
             amount_cents, is_credit, category
      FROM budget_entries
      WHERE statement_id = ${req.params.id}
      ORDER BY trans_date ASC, posting_date ASC
    `;
    res.json(rows.map(toEntry));
  } catch (error) {
    console.error("Failed to list statement entries", error);
    res.status(500).json({ error: "Failed to list statement entries" });
  }
});

// ----- Mutations -----

const isIsoDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

router.patch("/statements/:id", async (req, res) => {
  try {
    await ensureBudgetTables();
    const b = (req.body ?? {}) as Record<string, unknown>;

    if (b.source !== undefined && (typeof b.source !== "string" || !b.source.trim())) {
      return res.status(400).json({ error: "source must be a non-empty string" });
    }
    for (const f of ["statementDate", "periodStart", "periodEnd"]) {
      if (b[f] !== undefined && !isIsoDay(b[f])) {
        return res.status(400).json({ error: `${f} must be a yyyy-mm-dd date` });
      }
    }
    for (const f of ["previousBalance", "totalBalance"]) {
      if (b[f] !== undefined && !isFiniteNum(b[f])) {
        return res.status(400).json({ error: `${f} must be a number` });
      }
    }
    for (const f of ["paymentsCredits", "purchasesTotal"]) {
      if (b[f] !== undefined && (!isFiniteNum(b[f]) || (b[f] as number) < 0)) {
        return res.status(400).json({ error: `${f} must be a non-negative number` });
      }
    }

    const cents = (v: unknown) => (v !== undefined ? toCents(v as number) : null);
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE budget_statements SET
        source = COALESCE(${(b.source as string | undefined)?.trim() ?? null}, source),
        statement_date = COALESCE(${(b.statementDate as string | undefined) ?? null}::date, statement_date),
        period_start = COALESCE(${(b.periodStart as string | undefined) ?? null}::date, period_start),
        period_end = COALESCE(${(b.periodEnd as string | undefined) ?? null}::date, period_end),
        previous_balance_cents = COALESCE(${cents(b.previousBalance)}, previous_balance_cents),
        payments_credits_cents = COALESCE(${cents(b.paymentsCredits)}, payments_credits_cents),
        purchases_total_cents = COALESCE(${cents(b.purchasesTotal)}, purchases_total_cents),
        total_balance_cents = COALESCE(${cents(b.totalBalance)}, total_balance_cents)
      WHERE id = ${req.params.id}
      RETURNING id
    `;
    if (rows.length === 0) return res.status(404).json({ error: "statement not found" });

    const result = await revalidateStatement(req.params.id);
    if (!result) return res.status(404).json({ error: "statement not found" });
    res.json({ statement: toStatement(result.statement), problems: result.problems });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    if (detail.includes("23505")) {
      return res
        .status(409)
        .json({ error: "Another statement already exists for that source and date" });
    }
    console.error("Failed to update statement", error);
    res.status(500).json({ error: "Failed to update statement" });
  }
});

router.patch("/entries/:id", async (req, res) => {
  try {
    await ensureBudgetTables();
    const b = (req.body ?? {}) as Record<string, unknown>;

    if (
      b.category !== undefined &&
      !(BUDGET_CATEGORIES as readonly string[]).includes(b.category as string)
    ) {
      return res.status(400).json({ error: "invalid category" });
    }
    if (b.description !== undefined && (typeof b.description !== "string" || !b.description.trim())) {
      return res.status(400).json({ error: "description must be a non-empty string" });
    }
    for (const f of ["transDate", "postingDate"]) {
      if (b[f] !== undefined && !isIsoDay(b[f])) {
        return res.status(400).json({ error: `${f} must be a yyyy-mm-dd date` });
      }
    }
    if (b.amount !== undefined && (!isFiniteNum(b.amount) || (b.amount as number) < 0)) {
      return res.status(400).json({ error: "amount must be a non-negative number" });
    }
    if (b.isCredit !== undefined && typeof b.isCredit !== "boolean") {
      return res.status(400).json({ error: "isCredit must be a boolean" });
    }

    const rows = await prisma.$queryRaw<EntryRow[]>`
      UPDATE budget_entries SET
        category = COALESCE(${(b.category as string | undefined) ?? null}, category),
        description = COALESCE(${(b.description as string | undefined)?.trim() ?? null}, description),
        trans_date = COALESCE(${(b.transDate as string | undefined) ?? null}::date, trans_date),
        posting_date = COALESCE(${(b.postingDate as string | undefined) ?? null}::date, posting_date),
        amount_cents = COALESCE(${b.amount !== undefined ? toCents(b.amount as number) : null}, amount_cents),
        is_credit = COALESCE(${(b.isCredit as boolean | undefined) ?? null}, is_credit)
      WHERE id = ${req.params.id}
      RETURNING id, statement_id, trans_date, posting_date, description,
                amount_cents, is_credit, category
    `;
    if (rows.length === 0) return res.status(404).json({ error: "entry not found" });

    // Amount/credit-flag edits change the reconciliation — refresh the flag.
    const result = await revalidateStatement(rows[0].statement_id);
    res.json({
      entry: toEntry(rows[0]),
      statement: result ? toStatement(result.statement) : null,
      problems: result?.problems ?? [],
    });
  } catch (error) {
    console.error("Failed to update entry", error);
    res.status(500).json({ error: "Failed to update entry" });
  }
});

router.delete("/statements/:id", async (req, res) => {
  try {
    await ensureBudgetTables();
    const rows = await prisma.$queryRaw<Array<{ id: string; document_id: string | null }>>`
      DELETE FROM budget_statements WHERE id = ${req.params.id} RETURNING id, document_id
    `;
    if (rows.length === 0) return res.status(404).json({ error: "statement not found" });

    // When the parent PDF has no statements left, remove its document row and
    // the S3 object — otherwise the content-hash dedupe blocks re-uploads.
    const documentId = rows[0].document_id;
    if (documentId) {
      const docRows = await prisma.$queryRaw<Array<{ s3_key: string }>>`
        DELETE FROM budget_documents d
        WHERE d.id = ${documentId}
          AND NOT EXISTS (SELECT 1 FROM budget_statements s WHERE s.document_id = d.id)
        RETURNING s3_key
      `;
      if (docRows.length > 0) {
        try {
          await deleteStatementPdf(docRows[0].s3_key);
        } catch (error) {
          // Best-effort: the DB row is gone and a re-upload overwrites the
          // same content-hash key, so a dangling object is harmless.
          console.error("Failed to delete statement PDF from S3", error);
        }
      }
    }

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

    // Balance tiles trust only printed (PDF) balances — CSV summaries are
    // synthesized from transaction flow and would show meaningless numbers.
    const latestOf = (accountType: string) => prisma.$queryRaw<StatementRow[]>`
      SELECT s.*, (SELECT COUNT(*)::int FROM budget_entries e WHERE e.statement_id = s.id) AS entry_count
      FROM budget_statements s
      WHERE s.account_type = ${accountType} AND s.origin = 'pdf'
      ORDER BY s.statement_date DESC
      LIMIT 1
    `;
    const [latestCard, latestChequing, latestSavings] = await Promise.all([
      latestOf("credit_card"),
      latestOf("chequing"),
      latestOf("savings"),
    ]);
    const countRows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM budget_statements
    `;
    const categoryTotals = await prisma.$queryRaw<
      Array<{ category: string; total_cents: number }>
    >`
      SELECT category, SUM(amount_cents)::int AS total_cents
      FROM budget_entries
      WHERE NOT is_credit AND category NOT IN ('Payment/Credit', 'Card Payment')
      GROUP BY category
      ORDER BY total_cents DESC
    `;
    const monthlyByCategory = await prisma.$queryRaw<
      Array<{ month: string; category: string; total_cents: number }>
    >`
      SELECT to_char(date_trunc('month', trans_date), 'YYYY-MM') AS month,
             category, SUM(amount_cents)::int AS total_cents
      FROM budget_entries
      WHERE NOT is_credit AND category NOT IN ('Payment/Credit', 'Card Payment')
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `;

    res.json({
      latestCard: latestCard.length ? toStatement(latestCard[0]) : null,
      latestChequing: latestChequing.length ? toStatement(latestChequing[0]) : null,
      latestSavings: latestSavings.length ? toStatement(latestSavings[0]) : null,
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
