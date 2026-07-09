import "server-only";

// Server-side client for the personal dashboard API. The x-dashboard-key
// header must never reach the browser, so this module is server-only.

export type DashboardTask = {
  id: string;
  title: string;
  priority: "Low" | "Medium" | "High";
  status: "backlog" | "todo" | "progress" | "done";
  createdAt: string;
};

function config() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  const key = process.env.DASHBOARD_API_KEY;
  if (!base) throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
  if (!key) throw new Error("DASHBOARD_API_KEY is not set");
  return { base, key };
}

async function dashboardFetch(path: string, init?: RequestInit): Promise<Response> {
  const { base, key } = config();
  const res = await fetch(`${base}/api/dashboard${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "x-dashboard-key": key,
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
  });

  if (!res.ok) {
    let message = `Dashboard API request failed: ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // keep the status-based message
    }
    throw new Error(message);
  }

  return res;
}

export async function listTasks(): Promise<DashboardTask[]> {
  const res = await dashboardFetch("/tasks");
  return res.json();
}

export async function createTask(input: {
  title: string;
  priority: string;
  status: string;
}): Promise<DashboardTask> {
  const res = await dashboardFetch("/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.json();
}

export async function updateTaskStatus(id: string, status: string): Promise<DashboardTask> {
  const res = await dashboardFetch(`/tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return res.json();
}

export async function deleteTask(id: string): Promise<void> {
  await dashboardFetch(`/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function createDashboardProject(input: {
  title: string;
  description: string;
  githubUrl: string;
  imageUrl: string;
  tags: string[];
}): Promise<{ id: string }> {
  const res = await dashboardFetch("/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.json();
}

export async function patchProjectImages(
  id: string,
  input: { imageUrl?: string; secondaryImages?: string[] }
): Promise<void> {
  await dashboardFetch(`/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// ----- Budgeting dashboard -----

export type BudgetStatement = {
  id: string;
  source: string;
  statementDate: string;
  periodStart: string;
  periodEnd: string;
  previousBalance: number;
  paymentsCredits: number;
  purchasesTotal: number;
  totalBalance: number;
  validationStatus: "valid" | "mismatch";
  extractedPurchasesSum: number;
  uploadedAt: string;
  entryCount?: number;
};

export type BudgetEntry = {
  id: string;
  statementId: string;
  transDate: string;
  postingDate: string;
  description: string;
  amount: number;
  isCredit: boolean;
  category: string;
};

export type BudgetSummary = {
  latest: BudgetStatement | null;
  statementCount: number;
  categoryTotals: Array<{ category: string; total: number }>;
  monthlyByCategory: Array<{ month: string; category: string; total: number }>;
};

export type BudgetUploadResult = {
  statement: BudgetStatement;
  entries: BudgetEntry[];
  problems: string[];
};

export async function uploadBudgetStatement(fd: FormData): Promise<BudgetUploadResult> {
  const res = await dashboardFetch("/budget/statements", { method: "POST", body: fd });
  return res.json();
}

export async function listBudgetStatements(): Promise<BudgetStatement[]> {
  const res = await dashboardFetch("/budget/statements");
  return res.json();
}

export async function listBudgetEntries(filters?: {
  category?: string;
  from?: string;
  to?: string;
}): Promise<BudgetEntry[]> {
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  const qs = params.size ? `?${params.toString()}` : "";
  const res = await dashboardFetch(`/budget/entries${qs}`);
  return res.json();
}

export async function patchBudgetEntryCategory(
  id: string,
  category: string
): Promise<BudgetEntry> {
  const res = await dashboardFetch(`/budget/entries/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ category }),
  });
  return res.json();
}

export async function deleteBudgetStatement(id: string): Promise<void> {
  await dashboardFetch(`/budget/statements/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getBudgetSummary(): Promise<BudgetSummary> {
  const res = await dashboardFetch("/budget/summary");
  return res.json();
}
