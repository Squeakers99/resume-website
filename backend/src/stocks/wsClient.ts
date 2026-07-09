// TypeScript port of the slice of the unofficial Wealthsimple API needed for
// the read-only /stocks dashboard. Protocol reference:
// https://github.com/gboudreau/ws-api-python (and its PHP twin).
// This module never touches the database; persistence is injected.
import { GRAPHQL_QUERIES } from "./wsQueries";

export const OAUTH_BASE_URL = "https://api.production.wealthsimple.com/v1/oauth/v2";
export const GRAPHQL_URL = "https://my.wealthsimple.com/graphql";
const GRAPHQL_VERSION = "12";
const WS_CLIENT_HEADER = "@wealthsimple/wealthsimple";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
// Read-only by design: never widen this scope.
export const SCOPE_READ_ONLY = "invest.read trade.read tax.read";

export type StoredSession = {
  client_id: string;
  access_token: string;
  refresh_token: string;
  session_id: string;
  wssdi: string;
  token_info: { identity_canonical_id?: string } | null;
};

// Session is unrecoverable (refresh rejected): caller must mark disconnected.
export class WsAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WsAuthError";
  }
}

// Transient or protocol failure (WS down, schema changed, non-JSON body).
export class WsApiError extends Error {
  constructor(message: string, public detail?: unknown) {
    super(message);
    this.name = "WsApiError";
  }
}

export class OtpRequiredError extends Error {
  constructor() {
    super("Wealthsimple requires a 2FA code");
    this.name = "OtpRequiredError";
  }
}

// Internal signal: access token rejected, refresh may still succeed.
class WsNotAuthorizedError extends Error {}

type Raw = Record<string, unknown>;
const obj = (x: unknown): Raw | null =>
  typeof x === "object" && x !== null ? (x as Raw) : null;

function isNotAuthorizedBody(body: unknown): boolean {
  const b = obj(body);
  if (!b) return false;
  if (b.message === "Not Authorized.") return true;
  const firstError = Array.isArray(b.errors) ? obj(b.errors[0]) : null;
  return firstError?.message === "Not Authorized.";
}

export class WsClient {
  constructor(
    private session: StoredSession,
    private persist: (s: StoredSession) => Promise<void>,
    private fetchImpl: typeof fetch = fetch
  ) {}

  private baseHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-ws-session-id": this.session.session_id,
      "x-ws-device-id": this.session.wssdi,
      "User-Agent": USER_AGENT,
    };
  }

  private async refreshTokens(): Promise<void> {
    const res = await this.fetchImpl(`${OAUTH_BASE_URL}/token`, {
      method: "POST",
      // Deliberately no Authorization header on refresh (matches upstream).
      headers: {
        ...this.baseHeaders(),
        "x-wealthsimple-client": WS_CLIENT_HEADER,
        "x-ws-profile": "invest",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: this.session.refresh_token,
        client_id: this.session.client_id,
      }),
    });
    const body = (await res.json().catch(() => null)) as Raw | null;
    if (!body || typeof body.access_token !== "string" || typeof body.refresh_token !== "string") {
      throw new WsAuthError(
        `Wealthsimple session cannot be refreshed (${(body && body.error) || res.status}) — run pnpm ws:login`
      );
    }
    this.session.access_token = body.access_token;
    this.session.refresh_token = body.refresh_token;
    await this.persist(this.session);
  }

  // Run fn; on an access-token rejection refresh once, re-persist, retry once.
  private async withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof WsNotAuthorizedError)) throw error;
      await this.refreshTokens();
      return await fn();
    }
  }

  private async graphqlOnce(
    operationName: string,
    variables: Record<string, unknown>,
    path: string
  ): Promise<{ value: unknown; hasNextPage: boolean; endCursor: string | null }> {
    const query = GRAPHQL_QUERIES[operationName];
    if (!query) throw new WsApiError(`Unknown GraphQL operation: ${operationName}`);

    const res = await this.fetchImpl(GRAPHQL_URL, {
      method: "POST",
      headers: {
        ...this.baseHeaders(),
        Authorization: `Bearer ${this.session.access_token}`,
        "x-ws-profile": "trade",
        "x-ws-api-version": GRAPHQL_VERSION,
        "x-ws-locale": "en-CA",
        "x-platform-os": "web",
      },
      body: JSON.stringify({ operationName, query, variables }),
    });
    if (res.status === 401) throw new WsNotAuthorizedError();

    const parsed: unknown = await res.json().catch(() => {
      throw new WsApiError(`GraphQL ${operationName}: non-JSON response (HTTP ${res.status})`);
    });
    if (isNotAuthorizedBody(parsed)) throw new WsNotAuthorizedError();
    const body = obj(parsed);
    const data = body ? obj(body.data) : null;
    if (!data) throw new WsApiError(`GraphQL ${operationName} failed`, parsed);

    // Walk the dot-path, capturing connection pageInfo along the way.
    let cursor: unknown = data;
    let hasNextPage = false;
    let endCursor: string | null = null;
    const keys = path.split(".");
    for (const key of keys) {
      const here = obj(cursor);
      if (!here || !(key in here)) {
        throw new WsApiError(`GraphQL ${operationName}: missing '${key}' in response path '${path}'`, body);
      }
      cursor = here[key];
      const pageInfo = obj(obj(cursor)?.pageInfo);
      if (pageInfo?.hasNextPage === true && typeof pageInfo.endCursor === "string") {
        hasNextPage = true;
        endCursor = pageInfo.endCursor;
      }
    }

    if (keys[keys.length - 1] === "edges") {
      if (!Array.isArray(cursor)) {
        throw new WsApiError(`GraphQL ${operationName}: edges is not an array`, body);
      }
      cursor = cursor.map((edge) => obj(edge)?.node);
    }
    return { value: cursor, hasNextPage, endCursor };
  }

  async graphql(
    operationName: string,
    variables: Record<string, unknown>,
    path: string,
    opts: { loadAllPages?: boolean } = {}
  ): Promise<unknown> {
    const first = await this.withAuthRetry(() => this.graphqlOnce(operationName, variables, path));
    if (!opts.loadAllPages || !first.hasNextPage) return first.value;

    const all = Array.isArray(first.value) ? [...first.value] : [];
    let { hasNextPage, endCursor } = first;
    while (hasNextPage && endCursor) {
      const next = await this.withAuthRetry(() =>
        this.graphqlOnce(operationName, { ...variables, cursor: endCursor }, path)
      );
      if (Array.isArray(next.value)) all.push(...next.value);
      [hasNextPage, endCursor] = [next.hasNextPage, next.endCursor] as [typeof hasNextPage, typeof endCursor];
    }
    return all;
  }

  private async identityId(): Promise<string> {
    const cached = this.session.token_info?.identity_canonical_id;
    if (cached) return cached;

    const info = await this.withAuthRetry(async () => {
      const res = await this.fetchImpl(`${OAUTH_BASE_URL}/token/info`, {
        headers: {
          ...this.baseHeaders(),
          Authorization: `Bearer ${this.session.access_token}`,
          "x-wealthsimple-client": WS_CLIENT_HEADER,
        },
      });
      if (res.status === 401) throw new WsNotAuthorizedError();
      const body = (await res.json().catch(() => null)) as Raw | null;
      if (!body || typeof body.identity_canonical_id !== "string") {
        throw new WsApiError("token/info did not return identity_canonical_id", body);
      }
      return body;
    });
    this.session.token_info = { identity_canonical_id: info.identity_canonical_id as string };
    await this.persist(this.session);
    return info.identity_canonical_id as string;
  }

  // The four raw payloads the /portfolio route needs. `todayIso` is today's
  // date in America/Toronto (YYYY-MM-DD); simpleReturns since that date is
  // the day P&L.
  async fetchPortfolioRaw(todayIso: string): Promise<{
    accounts: unknown;
    positions: unknown;
    allTime: unknown;
    today: unknown;
  }> {
    const identityId = await this.identityId();
    const accounts = await this.graphql(
      "FetchAllAccountFinancials",
      { pageSize: 25, identityId },
      "identity.accounts.edges",
      { loadAllPages: true }
    );
    const positions = await this.graphql(
      "FetchIdentityPositions",
      {
        identityId,
        currency: "CAD",
        first: 250,
        filter: { securityIds: null },
        includeAccountData: true,
        includeSecurity: true,
      },
      "identity.financials.current.positions.edges",
      { loadAllPages: true }
    );
    const allTime = await this.graphql(
      "FetchIdentityCurrentFinancials",
      { identityId, currency: "CAD" },
      "identity.financials.current"
    );
    const today = await this.graphql(
      "FetchIdentityCurrentFinancials",
      { identityId, currency: "CAD", startDate: todayIso },
      "identity.financials.current"
    );
    return { accounts, positions, allTime, today };
  }
}

// ----- One-time login (used only by scripts/ws-login.ts) -----

// Fetch the login page for the wssdi device-id cookie, then the app JS bundle
// for the production OAuth client_id.
export async function bootstrapDeviceAndClient(
  fetchImpl: typeof fetch = fetch
): Promise<{ wssdi: string; clientId: string }> {
  const res = await fetchImpl("https://my.wealthsimple.com/app/login", {
    headers: { "User-Agent": USER_AGENT },
  });
  const setCookies: string[] =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  let wssdi: string | null = null;
  for (const cookie of setCookies) {
    const m = /wssdi=([a-f0-9-]+)/i.exec(cookie);
    if (m) {
      wssdi = m[1];
      break;
    }
  }
  const html = await res.text();
  if (!wssdi) throw new Error("Couldn't find the wssdi cookie on the Wealthsimple login page");

  const jsMatch = /<script[^>]*src="([^"]*\/app-[a-f0-9]+\.js)"/i.exec(html);
  if (!jsMatch) throw new Error("Couldn't find the app JS bundle URL in the login page");
  const jsUrl = jsMatch[1].startsWith("http")
    ? jsMatch[1]
    : `https://my.wealthsimple.com${jsMatch[1]}`;

  const js = await (await fetchImpl(jsUrl, { headers: { "User-Agent": USER_AGENT } })).text();
  const cid = /"production"[^}]*clientId:"([a-f0-9]+)"/i.exec(js);
  if (!cid) throw new Error("Couldn't find the production clientId in the Wealthsimple app JS");

  return { wssdi, clientId: cid[1] };
}

export async function loginWithPassword(opts: {
  email: string;
  password: string;
  otp?: string;
  wssdi: string;
  clientId: string;
  sessionId: string;
  fetchImpl?: typeof fetch;
}): Promise<StoredSession> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-wealthsimple-client": WS_CLIENT_HEADER,
    "x-ws-profile": "undefined",
    "x-ws-session-id": opts.sessionId,
    "x-ws-device-id": opts.wssdi,
    "User-Agent": USER_AGENT,
  };
  if (opts.otp) headers["x-wealthsimple-otp"] = `${opts.otp};remember=true`;

  const res = await fetchImpl(`${OAUTH_BASE_URL}/token`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      grant_type: "password",
      username: opts.email,
      password: opts.password,
      skip_provision: "true",
      scope: SCOPE_READ_ONLY,
      client_id: opts.clientId,
      otp_claim: null,
    }),
  });
  const body = (await res.json().catch(() => null)) as Raw | null;

  if (body?.error === "invalid_grant" && !opts.otp) throw new OtpRequiredError();
  if (!body || body.error || typeof body.access_token !== "string" || typeof body.refresh_token !== "string") {
    throw new Error(`Wealthsimple login failed: ${JSON.stringify(body)}`);
  }

  return {
    client_id: opts.clientId,
    access_token: body.access_token,
    refresh_token: body.refresh_token as string,
    session_id: opts.sessionId,
    wssdi: opts.wssdi,
    token_info: null,
  };
}
