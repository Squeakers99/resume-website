"use server";

import { revalidatePath } from "next/cache";
import { getOwnerSession } from "@/lib/auth";
import {
  deleteBudgetStatement,
  listStatementEntries,
  patchBudgetEntry,
  patchBudgetStatement,
  uploadBudgetStatement,
  type BudgetEntry,
  type BudgetEntryPatch,
  type BudgetStatement,
  type BudgetStatementPatch,
  type BudgetUploadResult,
} from "@/lib/server-api";

// Server actions are public HTTP endpoints — every one of them must
// re-verify the session, independently of the layout gate.
async function assertOwner(): Promise<void> {
  const session = await getOwnerSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
}

export type ActionResult = { ok: boolean; error?: string };
export type UploadActionResult = ActionResult & { result?: BudgetUploadResult };

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

const MAX_PDF_BYTES = 10 * 1024 * 1024;

export async function uploadStatementAction(
  formData: FormData
): Promise<UploadActionResult> {
  try {
    await assertOwner();

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose a PDF statement to upload" };
    }
    if (file.type !== "application/pdf") {
      return { ok: false, error: "Only PDF files are supported" };
    }
    if (file.size > MAX_PDF_BYTES) {
      return { ok: false, error: "PDF is larger than 10 MB" };
    }

    const fd = new FormData();
    fd.append("file", file, file.name);
    const result = await uploadBudgetStatement(fd);

    revalidatePath("/dashboard/budgeting");
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export type ReviewActionResult = ActionResult & {
  statement?: BudgetStatement | null;
  entry?: BudgetEntry;
  problems?: string[];
};

export async function recategorizeEntryAction(
  id: string,
  category: string
): Promise<ActionResult> {
  try {
    await assertOwner();
    await patchBudgetEntry(id, { category });
    revalidatePath("/dashboard/budgeting");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function updateEntryAction(
  id: string,
  patch: BudgetEntryPatch
): Promise<ReviewActionResult> {
  try {
    await assertOwner();
    const result = await patchBudgetEntry(id, patch);
    revalidatePath("/dashboard/budgeting");
    return {
      ok: true,
      statement: result.statement,
      entry: result.entry,
      problems: result.problems,
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function updateStatementAction(
  id: string,
  patch: BudgetStatementPatch
): Promise<ReviewActionResult> {
  try {
    await assertOwner();
    const result = await patchBudgetStatement(id, patch);
    revalidatePath("/dashboard/budgeting");
    return { ok: true, statement: result.statement, problems: result.problems };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function getStatementEntriesAction(
  id: string
): Promise<ActionResult & { entries?: BudgetEntry[] }> {
  try {
    await assertOwner();
    return { ok: true, entries: await listStatementEntries(id) };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function deleteStatementAction(id: string): Promise<ActionResult> {
  try {
    await assertOwner();
    await deleteBudgetStatement(id);
    revalidatePath("/dashboard/budgeting");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
