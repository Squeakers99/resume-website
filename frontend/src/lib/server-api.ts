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

export type BudgetAccountType = "credit_card" | "chequing" | "savings";

export type BudgetStatement = {
  id: string;
  source: string;
  accountType: BudgetAccountType;
  documentId: string | null;
  origin: "pdf" | "csv";
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
  recurring: boolean;
};

export type BudgetSummary = {
  latestCard: BudgetStatement | null;
  latestChequing: BudgetStatement | null;
  latestSavings: BudgetStatement | null;
  statementCount: number;
  categoryTotals: Array<{ category: string; total: number }>;
  cardBills: Array<{
    month: string;
    total: number;
    chequing: number | null;
    savings: number | null;
  }>;
  monthlyByCategory: Array<{ month: string; category: string; total: number }>;
};

// One uploaded PDF can contain several account sections.
export type BudgetUploadResult = {
  document: { id: string; filename: string; s3Key: string };
  results: Array<{
    statement: BudgetStatement;
    entries: BudgetEntry[];
    problems: string[];
    skippedDuplicates: number;
    learnedCategories: number;
  }>;
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

export type BudgetStatementPatch = {
  source?: string;
  statementDate?: string;
  periodStart?: string;
  periodEnd?: string;
  previousBalance?: number;
  paymentsCredits?: number;
  purchasesTotal?: number;
  totalBalance?: number;
};

export type BudgetEntryPatch = {
  category?: string;
  description?: string;
  transDate?: string;
  postingDate?: string;
  amount?: number;
  isCredit?: boolean;
  recurring?: boolean;
};

export type BudgetEntryPatchResult = {
  entry: BudgetEntry;
  statement: BudgetStatement | null;
  problems: string[];
};

export type BudgetStatementPatchResult = {
  statement: BudgetStatement;
  problems: string[];
};

export async function patchBudgetEntry(
  id: string,
  patch: BudgetEntryPatch
): Promise<BudgetEntryPatchResult> {
  const res = await dashboardFetch(`/budget/entries/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return res.json();
}

export async function patchBudgetStatement(
  id: string,
  patch: BudgetStatementPatch
): Promise<BudgetStatementPatchResult> {
  const res = await dashboardFetch(`/budget/statements/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return res.json();
}

// Every entry of one statement, including hidden Card Payment rows.
export async function listStatementEntries(id: string): Promise<BudgetEntry[]> {
  const res = await dashboardFetch(
    `/budget/statements/${encodeURIComponent(id)}/entries`
  );
  return res.json();
}

export async function deleteBudgetStatement(id: string): Promise<void> {
  await dashboardFetch(`/budget/statements/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getBudgetSummary(): Promise<BudgetSummary> {
  const res = await dashboardFetch("/budget/summary");
  return res.json();
}

export type BudgetInsights = {
  projection: {
    month: string;
    total: number;
    byCategory: Array<{ category: string; projected: number }>;
    monthsUsed: number;
    reasoning?: string;
  } | null;
  projectionSource: "ai" | "trend";
  recommendations: Array<{ title: string; detail: string }> | null;
  generatedAt: string | null;
  stale: boolean;
};

export async function getBudgetInsights(): Promise<BudgetInsights> {
  const res = await dashboardFetch("/budget/insights");
  return res.json();
}

export async function refreshBudgetInsights(): Promise<BudgetInsights> {
  const res = await dashboardFetch("/budget/insights/refresh", { method: "POST" });
  return res.json();
}

export async function detectRecurring(): Promise<{ marked: number }> {
  const res = await dashboardFetch("/budget/recurring/detect", { method: "POST" });
  return res.json();
}

export async function listRecurring(): Promise<BudgetEntry[]> {
  const res = await dashboardFetch("/budget/recurring");
  return res.json();
}

// ----- Stocks dashboard (Wealthsimple) -----

export type StocksStatus = "connected" | "disconnected" | "never_connected";

export type StocksAccount = {
  id: string;
  label: string;
  type: string;
  currency: string;
  value: number;
};

export type StocksPosition = {
  securityId: string;
  symbol: string;
  name: string;
  exchange: string | null;
  quantity: number;
  price: number | null;
  currency: string;
  value: number; // CAD
  dayChange: number | null; // native currency
  totalReturn: number | null; // CAD
  accountIds: string[];
};

export type StocksPortfolio = {
  summary: {
    totalValue: number;
    dayPnl: number | null;
    totalPnl: number | null;
    totalPnlRate: number | null;
  };
  accounts: StocksAccount[];
  positions: StocksPosition[];
  fetchedAt: string;
  stale: boolean;
};

export async function getStocksStatus(): Promise<StocksStatus> {
  const res = await dashboardFetch("/stocks/status");
  const body = (await res.json()) as { status: StocksStatus };
  return body.status;
}

export async function getStocksPortfolio(): Promise<StocksPortfolio> {
  const res = await dashboardFetch("/stocks/portfolio");
  return res.json();
}

export async function startStocksConnect(): Promise<{
  otpRequired: boolean;
  connected?: boolean;
}> {
  const res = await dashboardFetch("/stocks/connect/start", { method: "POST" });
  return res.json();
}

export async function submitStocksOtp(code: string): Promise<{ connected: boolean }> {
  const res = await dashboardFetch("/stocks/connect/otp", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  return res.json();
}

export type StocksHistorySeries = {
  id: string;
  label: string;
  points: Array<{ date: string; value: number }>;
};

export type StocksHistory = {
  series: StocksHistorySeries[];
  fetchedAt: string;
  stale: boolean;
};

export async function getStocksHistory(): Promise<StocksHistory> {
  const res = await dashboardFetch("/stocks/history");
  return res.json();
}

export type StocksSecurityDetail = {
  securityId: string;
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string | null;
  description: string | null;
  ceo: string | null;
  hqLocation: string | null;
  employees: number | null;
  marketCap: number | null;
  peRatio: number | null;
  eps: number | null;
  high52Week: number | null;
  low52Week: number | null;
  dividendYield: number | null;
  beta: number | null;
  avgVolume: number | null;
  dailyVolume: number | null;
  managementExpenseRatio: number | null;
  dividendFrequency: string | null;
};

export type StocksChartPeriod =
  | "ONE_DAY"
  | "ONE_MONTH"
  | "THREE_MONTHS"
  | "ONE_YEAR"
  | "FIVE_YEARS";

export type StocksChartPoint = { timestamp: string; price: number };

export type StocksNewsItem = {
  title: string;
  url: string;
  source: string | null;
  publishedAt: string | null;
};

export async function getSecurityDetail(id: string): Promise<StocksSecurityDetail> {
  const res = await dashboardFetch(`/stocks/securities/${encodeURIComponent(id)}`);
  return res.json();
}

export async function getSecurityChart(
  id: string,
  period: StocksChartPeriod
): Promise<{ points: StocksChartPoint[] }> {
  const res = await dashboardFetch(
    `/stocks/securities/${encodeURIComponent(id)}/chart?period=${period}`
  );
  return res.json();
}

export async function getSecurityNews(
  id: string
): Promise<{ items: StocksNewsItem[]; tldr: string | null }> {
  const res = await dashboardFetch(`/stocks/securities/${encodeURIComponent(id)}/news`);
  return res.json();
}
