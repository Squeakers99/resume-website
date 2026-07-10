import { describe, expect, it, vi } from "vitest";
import { WsApiError, WsAuthError, WsClient, type StoredSession } from "./wsClient";

const session = (): StoredSession => ({
  client_id: "client123",
  access_token: "old-access",
  refresh_token: "old-refresh",
  session_id: "sess-1",
  wssdi: "device-1",
  token_info: { identity_canonical_id: "identity-1" },
});

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Queue-based fake fetch: each call shifts the next responder.
function fakeFetch(responders: Array<(url: string, init?: RequestInit) => Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const responder = responders.shift();
    if (!responder) throw new Error(`Unexpected fetch call to ${url}`);
    return responder(url, init);
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const accountsBody = {
  data: {
    identity: {
      accounts: {
        pageInfo: { hasNextPage: false, endCursor: null },
        edges: [{ node: { id: "acc-1", status: "open" } }],
      },
    },
  },
};

describe("WsClient.graphql", () => {
  it("walks the response path and unwraps edges to nodes", async () => {
    const { impl } = fakeFetch([() => jsonRes(accountsBody)]);
    const client = new WsClient(session(), async () => {}, impl);
    const nodes = await client.graphql("FetchAllAccountFinancials", { identityId: "identity-1" }, "identity.accounts.edges");
    expect(nodes).toEqual([{ id: "acc-1", status: "open" }]);
  });

  it("follows pagination when loadAllPages is set", async () => {
    const page = (id: string, hasNextPage: boolean) => ({
      data: {
        identity: {
          accounts: {
            pageInfo: { hasNextPage, endCursor: hasNextPage ? "cur-1" : null },
            edges: [{ node: { id } }],
          },
        },
      },
    });
    const { impl, calls } = fakeFetch([
      () => jsonRes(page("acc-1", true)),
      () => jsonRes(page("acc-2", false)),
    ]);
    const client = new WsClient(session(), async () => {}, impl);
    const nodes = await client.graphql(
      "FetchAllAccountFinancials",
      { identityId: "identity-1" },
      "identity.accounts.edges",
      { loadAllPages: true }
    );
    expect(nodes).toEqual([{ id: "acc-1" }, { id: "acc-2" }]);
    const secondBody = JSON.parse(String(calls[1].init?.body));
    expect(secondBody.variables.cursor).toBe("cur-1");
  });

  it("refreshes the token once on Not Authorized, persists it, and retries", async () => {
    const persisted: StoredSession[] = [];
    const { impl, calls } = fakeFetch([
      () => jsonRes({ message: "Not Authorized." }, 401),
      () => jsonRes({ access_token: "new-access", refresh_token: "new-refresh" }),
      () => jsonRes(accountsBody),
    ]);
    const client = new WsClient(session(), async (s) => { persisted.push({ ...s }); }, impl);
    const nodes = await client.graphql("FetchAllAccountFinancials", {}, "identity.accounts.edges");

    expect(nodes).toHaveLength(1);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].access_token).toBe("new-access");
    expect(persisted[0].refresh_token).toBe("new-refresh");
    // Refresh call: no Authorization header, refresh_token grant.
    const refreshInit = calls[1].init!;
    const refreshHeaders = refreshInit.headers as Record<string, string>;
    expect(refreshHeaders.Authorization).toBeUndefined();
    expect(JSON.parse(String(refreshInit.body)).grant_type).toBe("refresh_token");
    // Retry used the new access token.
    const retryHeaders = calls[2].init!.headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe("Bearer new-access");
  });

  it("throws WsAuthError when the refresh itself fails", async () => {
    const { impl } = fakeFetch([
      () => jsonRes({ errors: [{ message: "Not Authorized." }] }),
      () => jsonRes({ error: "invalid_grant" }, 400),
    ]);
    const client = new WsClient(session(), async () => {}, impl);
    await expect(
      client.graphql("FetchAllAccountFinancials", {}, "identity.accounts.edges")
    ).rejects.toBeInstanceOf(WsAuthError);
  });

  it("throws WsApiError (no refresh) on a non-auth GraphQL failure", async () => {
    const { impl, calls } = fakeFetch([() => jsonRes({ errors: [{ message: "boom" }] })]);
    const client = new WsClient(session(), async () => {}, impl);
    await expect(
      client.graphql("FetchAllAccountFinancials", {}, "identity.accounts.edges")
    ).rejects.toBeInstanceOf(WsApiError);
    expect(calls).toHaveLength(1);
  });

  it("throws WsAuthError when the retried call is still Not Authorized after a successful refresh", async () => {
    const { impl, calls } = fakeFetch([
      () => jsonRes({ message: "Not Authorized." }, 401),
      () => jsonRes({ access_token: "new-access", refresh_token: "new-refresh" }),
      () => jsonRes({ message: "Not Authorized." }, 401),
    ]);
    const client = new WsClient(session(), async () => {}, impl);
    await expect(
      client.graphql("FetchAllAccountFinancials", {}, "identity.accounts.edges")
    ).rejects.toBeInstanceOf(WsAuthError);
    expect(calls).toHaveLength(3); // no second refresh attempt, no infinite loop
  });
});

describe("WsClient.fetchPortfolioRaw", () => {
  it("fetches accounts, positions, and both financials snapshots", async () => {
    const financialsBody = {
      data: { identity: { financials: { current: { netLiquidationValueV2: { cents: 1 } } } } },
    };
    const positionsBody = {
      data: {
        identity: {
          financials: {
            current: {
              positions: {
                pageInfo: { hasNextPage: false, endCursor: null },
                edges: [{ node: { id: "pos-1" } }],
              },
            },
          },
        },
      },
    };
    const bodies: Array<() => Response> = [
      () => jsonRes(accountsBody),
      () => jsonRes(positionsBody),
      () => jsonRes(financialsBody),
      () => jsonRes(financialsBody),
    ];
    const { impl, calls } = fakeFetch(bodies);
    const client = new WsClient(session(), async () => {}, impl);
    const raw = await client.fetchPortfolioRaw("2026-07-09");

    expect(raw.accounts).toEqual([{ id: "acc-1", status: "open" }]);
    expect(raw.positions).toEqual([{ id: "pos-1" }]);
    expect(raw.allTime).toEqual({ netLiquidationValueV2: { cents: 1 } });
    expect(raw.today).toEqual({ netLiquidationValueV2: { cents: 1 } });
    // token_info was cached in the session, so no /token/info call happened.
    expect(calls.every((c) => c.url.includes("/graphql"))).toBe(true);
    // Day-P&L call carries the startDate.
    const lastBody = JSON.parse(String(calls[3].init?.body));
    expect(lastBody.variables.startDate).toBe("2026-07-09");
  });
});

describe("WsClient.fetchHistoryRaw", () => {
  it("queries identity historical financials with accountIds and startDate", async () => {
    const body = {
      data: {
        identity: {
          financials: {
            historicalDaily: {
              pageInfo: { hasNextPage: false, endCursor: null },
              edges: [{ node: { date: "2026-07-01" } }],
            },
          },
        },
      },
    };
    const { impl, calls } = fakeFetch([() => jsonRes(body)]);
    const client = new WsClient(session(), async () => {}, impl);
    const nodes = await client.fetchHistoryRaw(["acc-1"], "2025-07-09");
    expect(nodes).toEqual([{ date: "2026-07-01" }]);
    const sent = JSON.parse(String(calls[0].init?.body));
    expect(sent.variables.accountIds).toEqual(["acc-1"]);
    expect(sent.variables.startDate).toBe("2025-07-09");
  });
});
