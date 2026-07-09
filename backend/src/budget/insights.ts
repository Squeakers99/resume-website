import OpenAI from "openai";

// Spending insights: deterministic trend projection (no AI — reproducible
// math) plus LLM-generated cost-cutting recommendations.

export type ProjectedCategory = { category: string; projected: number };

export type SpendingProjection = {
  month: string; // the month being predicted, YYYY-MM
  total: number;
  byCategory: ProjectedCategory[];
  monthsUsed: number;
};

export type Recommendation = { title: string; detail: string };

export class InsightsError extends Error {}

export function nextMonthLabel(lastMonth: string): string {
  const [y, m] = lastMonth.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return next;
}

// Ordinary least squares over the series index; predicts the next value,
// clamped at zero (spending can't be negative).
export function linearProjection(series: number[]): number {
  const n = series.length;
  if (n === 0) return 0;
  if (n === 1) return Math.max(0, series[0]);
  const xMean = (n - 1) / 2;
  const yMean = series.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (series[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = num / den;
  const intercept = yMean - slope * xMean;
  const predicted = intercept + slope * n;
  return Math.max(0, Math.round(predicted * 100) / 100);
}

export function projectSpending(
  monthly: Array<{ month: string; category: string; total: number }>
): SpendingProjection | null {
  const months = [...new Set(monthly.map((m) => m.month))].sort();
  if (months.length < 2) return null;

  const categories = [...new Set(monthly.map((m) => m.category))];
  const seriesFor = (category: string) =>
    months.map(
      (month) =>
        monthly.find((m) => m.month === month && m.category === category)?.total ?? 0
    );

  const byCategory = categories
    .map((category) => ({
      category,
      projected: linearProjection(seriesFor(category)),
    }))
    .filter((c) => c.projected > 0)
    .sort((a, b) => b.projected - a.projected)
    .slice(0, 5);

  const totals = months.map((month) =>
    monthly.filter((m) => m.month === month).reduce((s, m) => s + m.total, 0)
  );

  return {
    month: nextMonthLabel(months[months.length - 1]),
    total: linearProjection(totals),
    byCategory,
    monthsUsed: months.length,
  };
}

export type MerchantGroup = {
  key: string; // normalized merchant name
  sample: string; // a raw description example
  months: number;
  charges: number;
  minAmount: number;
  maxAmount: number;
};

const SUBSCRIPTION_PROMPT = `You classify merchant charge groups from the owner's
bank/card statements. A SUBSCRIPTION is a recurring service billed automatically:
streaming (Disney+, Netflix, Spotify), paid memberships (UBER ONE / UberOneMem,
Amazon Prime, gym), software/app subscriptions (Discord Nitro, iCloud, Google
services billed monthly), phone/internet plans, cloud hosting. Ordinary repeated
purchases are NOT subscriptions: coffee shops, restaurants, groceries, gas,
transit, vending, car-share usage, ride/delivery orders (Uber trips and Uber Eats
orders are NOT subscriptions, but an Uber One membership IS), person-to-person
transfers, campus card top-ups. A stable amount charged about once a month is
strong evidence FOR; highly variable amounts or many charges per month are
evidence AGAINST. Classify every group.`;

const SUBSCRIPTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["groups"],
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "is_subscription"],
        properties: {
          key: { type: "string" },
          is_subscription: { type: "boolean" },
        },
      },
    },
  },
} as const;

// Returns the normalized keys of the groups the model considers subscriptions.
export async function classifySubscriptions(
  groups: MerchantGroup[]
): Promise<Set<string>> {
  if (!process.env.OPENAI_API_KEY) {
    throw new InsightsError("OPENAI_API_KEY is not set");
  }
  if (groups.length === 0) return new Set();
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const payload = groups
    .map(
      (g) =>
        `key: ${g.key}\n  example: ${g.sample}\n  pattern: ${g.charges} charges across ${g.months} months, amounts $${g.minAmount.toFixed(2)}–$${g.maxAmount.toFixed(2)}`
    )
    .join("\n");

  const completion = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: SUBSCRIPTION_PROMPT },
      { role: "user", content: payload },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "subscription_classification",
        strict: true,
        schema: SUBSCRIPTION_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new InsightsError("model returned no content");
  let parsed: { groups: Array<{ key: string; is_subscription: boolean }> };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new InsightsError("model returned invalid JSON");
  }
  return new Set(
    parsed.groups.filter((g) => g.is_subscription).map((g) => g.key)
  );
}

export type AiProjection = {
  month: string;
  total: number;
  byCategory: ProjectedCategory[];
  reasoning: string;
};

// Guard the model's numbers before they reach storage/UI.
export function validateAiProjection(
  payload: unknown,
  month: string
): AiProjection | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as { total?: unknown; by_category?: unknown; reasoning?: unknown };
  if (typeof p.total !== "number" || !Number.isFinite(p.total)) return null;
  const byCategory = Array.isArray(p.by_category)
    ? p.by_category
        .filter(
          (c: { category?: unknown; projected?: unknown }) =>
            typeof c?.category === "string" &&
            typeof c?.projected === "number" &&
            Number.isFinite(c.projected)
        )
        .map((c: { category: string; projected: number }) => ({
          category: c.category,
          projected: Math.max(0, Math.round(c.projected * 100) / 100),
        }))
        .slice(0, 8)
    : [];
  return {
    month,
    total: Math.max(0, Math.round(p.total * 100) / 100),
    byCategory,
    reasoning: typeof p.reasoning === "string" ? p.reasoning : "",
  };
}

const INSIGHTS_PROMPT = `You are a personal-finance analyst reviewing the owner's
real spending data.

Task 1 — recommendations: suggest 3 to 5 concrete, specific ways to cut
spending, grounded in the numbers you were given — reference actual categories,
merchants, and amounts. No generic advice ("make a budget"), no advice about
income, card payments, or transfers between the owner's own accounts. Keep each
title under 8 words and each detail to 1-2 sentences.

Task 2 — projection: predict the owner's spending for the TARGET MONTH stated
in the data, based on their patterns: distinguish recurring spending
(subscriptions, groceries, regular habits) from one-off spikes (a single big
purchase or transfer shouldn't be projected to repeat), and weight recent
months more than old ones. Return the projected total, the projected amount
per category you expect spending in, and one sentence of reasoning.`;

const INSIGHTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["recommendations", "projection"],
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail"],
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
        },
      },
    },
    projection: {
      type: "object",
      additionalProperties: false,
      required: ["total", "by_category", "reasoning"],
      properties: {
        total: { type: "number" },
        by_category: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["category", "projected"],
            properties: {
              category: { type: "string" },
              projected: { type: "number" },
            },
          },
        },
        reasoning: { type: "string" },
      },
    },
  },
} as const;

export async function generateInsights(input: {
  monthly: Array<{ month: string; category: string; total: number }>;
  topExpenses: Array<{ date: string; description: string; amount: number; category: string }>;
  cardBills: Array<{ month: string; total: number }>;
  targetMonth: string;
}): Promise<{ recommendations: Recommendation[]; projection: AiProjection | null }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new InsightsError("OPENAI_API_KEY is not set");
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const payload = [
    `TARGET MONTH for the projection: ${input.targetMonth}`,
    "",
    "Monthly spend by category:",
    ...input.monthly.map((m) => `${m.month} ${m.category}: $${m.total.toFixed(2)}`),
    "",
    "Largest individual expenses:",
    ...input.topExpenses.map(
      (e) => `${e.date} ${e.description} (${e.category}): $${e.amount.toFixed(2)}`
    ),
    "",
    "Credit card bill totals:",
    ...input.cardBills.map((b) => `${b.month}: $${b.total.toFixed(2)}`),
  ].join("\n");

  const completion = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: INSIGHTS_PROMPT },
      { role: "user", content: payload },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "spending_insights",
        strict: true,
        schema: INSIGHTS_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new InsightsError("model returned no content");
  let parsed: { recommendations: Recommendation[]; projection: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new InsightsError("model returned invalid JSON");
  }
  if (!Array.isArray(parsed.recommendations) || parsed.recommendations.length === 0) {
    throw new InsightsError("model returned no recommendations");
  }
  return {
    recommendations: parsed.recommendations.slice(0, 5),
    projection: validateAiProjection(parsed.projection, input.targetMonth),
  };
}
