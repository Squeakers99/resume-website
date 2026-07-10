import { describe, expect, it } from "vitest";
import { fetchCompanyNews } from "./news";

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Apple hits record high]]></title><link>https://example.com/a</link><pubDate>Wed, 08 Jul 2026 12:00:00 GMT</pubDate><source url="https://example.com">Example News</source></item>
<item><title>Apple &amp; suppliers rally</title><link>https://example.com/b</link></item>
<item><title>no link, skipped</title></item>
<item><title>bad scheme, skipped</title><link>javascript:alert(1)</link></item>
</channel></rss>`;

describe("fetchCompanyNews", () => {
  it("parses items, decodes entities/CDATA, skips linkless items", async () => {
    const fake = (async () => new Response(RSS, { status: 200 })) as unknown as typeof fetch;
    const items = await fetchCompanyNews("Apple Inc", "AAPL", fake);
    expect(items).toEqual([
      {
        title: "Apple hits record high",
        url: "https://example.com/a",
        source: "Example News",
        publishedAt: "Wed, 08 Jul 2026 12:00:00 GMT",
      },
      { title: "Apple & suppliers rally", url: "https://example.com/b", source: null, publishedAt: null },
    ]);
  });

  it("throws on a non-OK response", async () => {
    const fake = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchCompanyNews("X", "X", fake)).rejects.toThrow("news fetch failed");
  });
});
