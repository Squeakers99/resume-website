// Captures the pdf-parse text of every statement PDF in bill-examples/ (repo
// root, gitignored, real personal data) into test-fixtures/budget/corpus/
// (also gitignored) so the pre-parser harness can run offline.
// Run from backend/:  pnpm tsx scripts/budget-capture-corpus.ts
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pdfParse from "pdf-parse";

const SOURCE_DIR = path.resolve(__dirname, "..", "..", "bill-examples");
const CORPUS_DIR = path.resolve(__dirname, "..", "test-fixtures", "budget", "corpus");

async function main() {
  const files = (await readdir(SOURCE_DIR))
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();
  if (files.length === 0) {
    console.error(`No PDFs found in ${SOURCE_DIR}`);
    process.exitCode = 1;
    return;
  }
  await mkdir(CORPUS_DIR, { recursive: true });

  for (const file of files) {
    const buffer = await readFile(path.join(SOURCE_DIR, file));
    const parsed = await pdfParse(buffer);
    // Same normalization as the upload route: trimmed pdf-parse text.
    const text = parsed.text?.trim() ?? "";
    const outName = file.replace(/\.pdf$/i, ".txt");
    await writeFile(path.join(CORPUS_DIR, outName), text, "utf8");
    console.log(`${outName}  ${text.length} chars`);
  }
  console.log(`Captured ${files.length} file(s) into ${CORPUS_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
