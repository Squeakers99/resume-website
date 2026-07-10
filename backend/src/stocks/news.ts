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
