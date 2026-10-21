// Offline regression harness for the deterministic statement pre-parser.
// Runs preparseStatementText + validateStatement over every captured corpus
// file (test-fixtures/budget/corpus/*.txt, see test-fixtures/budget/README.md)
// and prints one line per file. Never calls OpenAI or S3.
// Run from backend/:  pnpm budget:harness [--json]
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { validateStatement } from "../src/budget/domain";
import { preparseStatementText } from "../src/budget/preparse";

const CORPUS_DIR = path.resolve(__dirname, "..", "test-fixtures", "budget", "corpus");

type FileResult = {
  file: string;
  layout: string;
  statements: number;
  entries: number[];
  pass: boolean;
  problems: string[];
};

async function main() {
  const json = process.argv.includes("--json");
  let files: string[];
  try {
    files = (await readdir(CORPUS_DIR)).filter((f) => f.endsWith(".txt")).sort();
  } catch {
    files = [];
  }
  if (files.length === 0) {
    console.error(
      `No corpus files in ${CORPUS_DIR}. Run: pnpm tsx scripts/budget-capture-corpus.ts`
    );
    process.exitCode = 1;
    return;
  }

  const results: FileResult[] = [];
  for (const file of files) {
    const text = await readFile(path.join(CORPUS_DIR, file), "utf8");
    const result = preparseStatementText(text);
    const problems = [...result.problems];
    for (const s of result.statements) {
      for (const p of validateStatement(s).problems) problems.push(`${s.source}: ${p}`);
    }
    results.push({
      file,
      layout: result.layout,
      statements: result.statements.length,
      entries: result.statements.map((s) => s.entries.length),
      pass:
        result.layout !== "unknown" &&
        result.statements.length > 0 &&
        result.statements.every((s) => s.entries.length > 0) &&
        problems.length === 0,
      problems,
    });
  }

  const passed = results.filter((r) => r.pass).length;
  if (json) {
    console.log(JSON.stringify({ passed, total: results.length, results }, null, 2));
  } else {
    for (const r of results) {
      const head = `${r.file} | ${r.layout} | ${r.statements} statement(s) | entries ${r.entries.join("/") || "-"} | ${r.pass ? "PASS" : "FAIL"}`;
      // A statement with no entries fails even with no problems recorded.
      const reasons = [...(r.entries.some((n) => n === 0) ? ["entries 0"] : []), ...r.problems];
      console.log(reasons.length ? `${head} | ${reasons.join("; ")}` : head);
    }
    console.log(`${passed}/${results.length} PASS`);
  }
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
