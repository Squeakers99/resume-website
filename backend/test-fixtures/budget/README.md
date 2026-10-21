# Budget statement pre-parser fixtures

`corpus/` holds the pdf-parse text of real BMO statements and is **gitignored**
(it contains personal financial data). Never commit it.

## Regenerate the corpus

1. Put the statement PDFs in `bill-examples/` at the repo root (also gitignored).
2. From `backend/`:

   ```sh
   pnpm tsx scripts/budget-capture-corpus.ts
   ```

   This writes one `<pdf name>.txt` per PDF into `test-fixtures/budget/corpus/`,
   using the same normalization as the upload route (trimmed pdf-parse text).

## Run the regression harness

```sh
pnpm budget:harness          # one line per file, then "N/M PASS"; exit 1 on any FAIL
pnpm budget:harness --json   # machine-readable output
```

A file passes when the deterministic pre-parser (`src/budget/preparse.ts`)
reports no problems and `validateStatement` accepts every statement it
produced. The harness runs fully offline (no OpenAI, no S3).

Unit tests in `src/budget/preparse.test.ts` use synthetic fixtures only.
