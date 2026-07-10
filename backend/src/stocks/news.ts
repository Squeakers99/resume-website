import OpenAI from "openai";

// Company news via Google News RSS search — keyless, best-effort. The feed is
// public data; a tolerant regex parse beats an XML dependency for one endpoint.
export type NewsItem = {
  title: string;
  url: string;
  source: string | null;
  publishedAt: string | null;
};

const MAX_ITEMS = 12;

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();

export async function fetchCompanyNews(
  companyName: string,
  symbol: string,
  fetchImpl: typeof fetch = fetch
): Promise<NewsItem[]> {
  const q = encodeURIComponent(`"${companyName}" OR "${symbol} stock"`);
  const res = await fetchImpl(
    `https://news.google.com/rss/search?q=${q}&hl=en-CA&gl=CA&ceid=CA:en`,
    { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) throw new Error(`news fetch failed: ${res.status}`);
  const xml = await res.text();

  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) && items.length < MAX_ITEMS) {
    const block = m[1];
    const pick = (tag: string): string | null => {
      const t = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(block);
      return t ? decode(t[1]) : null;
    };
    const title = pick("title");
    const url = pick("link");
    if (!title || !url || !/^https?:\/\//i.test(url)) continue;
    items.push({ title, url, source: pick("source"), publishedAt: pick("pubDate") });
  }
  return items;
}

// 2-3 sentence TLDR of the most important headlines. Best-effort: returns
// null (and the UI hides the block) when OPENAI_API_KEY is unset or the
// call fails — news must still render without it.
export async function summarizeNews(
  companyName: string,
  symbol: string,
  items: NewsItem[]
): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY || items.length === 0) return null;
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const headlines = items
      .map(
        (i) =>
          `- ${i.title}${i.source ? ` (${i.source}` : ""}${
            i.publishedAt ? `${i.source ? ", " : " ("}${i.publishedAt.slice(0, 16)})` : i.source ? ")" : ""
          }`
      )
      .join("\n");
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-nano",
      messages: [
        {
          role: "system",
          content:
            "You write the TLDR for the news panel on a stock's page in a personal portfolio dashboard. Summarize the important news AND the market trends they imply for this company, prioritizing the most recent day's items. 2-4 sentences, plain text, no markdown, no preamble. When a point comes from a specific article, reference it briefly by source name in parentheses.",
        },
        {
          role: "user",
          content: `Company: ${companyName} (${symbol})\nHeadlines (with source and date):\n${headlines}`,
        },
      ],
      max_tokens: 220,
      temperature: 0.3,
    });
    const text = completion.choices[0]?.message?.content?.trim();
    return text || null;
  } catch (error) {
    console.error("News TLDR generation failed", error);
    return null;
  }
}
