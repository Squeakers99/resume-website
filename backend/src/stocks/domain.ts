// Pure mapping from raw Wealthsimple GraphQL payloads to the portfolio model.
// Money is integer cents everywhere in this module; the route serializes dollars.

export class WsShapeError extends Error {
  constructor(operation: string, detail: string) {
    super(`Unexpected Wealthsimple response shape in ${operation}: ${detail}`);
    this.name = "WsShapeError";
  }
}

export type PortfolioAccount = {
  id: string;
  label: string;
  type: string;
  currency: string;
  valueCents: number;
};

export type PortfolioPosition = {
  symbol: string;
  name: string;
  exchange: string | null;
  quantity: number;
  priceCents: number | null; // in the security's native currency
  currency: string; // the security's native currency
  valueCadCents: number; // market value in CAD (query currency)
  dayChangeCents: number | null; // native currency, (price - referenceClose) * quantity
  totalReturnCadCents: number | null;
  accountIds: string[];
};

export type PortfolioSummary = {
  totalValueCents: number;
  dayPnlCents: number | null;
  totalPnlCents: number | null;
  totalPnlRate: number | null;
};

type Raw = Record<string, unknown>;

const obj = (x: unknown): Raw | null =>
  typeof x === "object" && x !== null ? (x as Raw) : null;

// WS sends numbers as numbers or numeric strings interchangeably.
const asNumber = (x: unknown): number | null => {
  if (x === null || x === undefined) return null;
  const n = typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN;
  return Number.isFinite(n) ? n : null;
};

// Money objects carry integer `cents` plus `amount`; prefer cents.
function moneyCents(x: unknown, op: string, field: string): number {
  const m = obj(x);
  if (m) {
    if (typeof m.cents === "number" && Number.isFinite(m.cents)) return Math.round(m.cents);
    const amount = asNumber(m.amount);
    if (amount !== null) return Math.round(amount * 100);
  }
  throw new WsShapeError(op, `${field} is not a Money object`);
}

const optMoneyCents = (x: unknown, op: string, field: string): number | null =>
  x === null || x === undefined ? null : moneyCents(x, op, field);

const OP_ACCOUNTS = "FetchAllAccountFinancials";
const OP_POSITIONS = "FetchIdentityPositions";
const OP_FINANCIALS = "FetchIdentityCurrentFinancials";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  TFSA: "TFSA",
  RRSP: "RRSP",
  FHSA: "FHSA",
  RESP: "RESP",
  LIRA: "LIRA",
  CASH: "Cash",
};

function accountLabel(unifiedType: string, nickname: unknown): string {
  if (typeof nickname === "string" && nickname.trim()) return nickname.trim();
  const known = ACCOUNT_TYPE_LABELS[unifiedType];
  if (known) return known;
  const pretty = unifiedType.toLowerCase().replace(/_/g, " ");
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

export function mapAccounts(nodes: unknown): PortfolioAccount[] {
  if (!Array.isArray(nodes)) throw new WsShapeError(OP_ACCOUNTS, "accounts is not an array");
  const out: PortfolioAccount[] = [];
  nodes.forEach((node, i) => {
    const n = obj(node);
    if (!n || typeof n.id !== "string") {
      throw new WsShapeError(OP_ACCOUNTS, `accounts[${i}] has no id`);
    }
    if (n.status !== "open") return;
    const type = typeof n.unifiedAccountType === "string" ? n.unifiedAccountType : "UNKNOWN";
    const combined = obj(obj(n.financials)?.currentCombined);
    if (!combined) {
      throw new WsShapeError(OP_ACCOUNTS, `accounts[${i}].financials.currentCombined missing`);
    }
    out.push({
      id: n.id,
      label: accountLabel(type, n.nickname),
      type,
      currency: typeof n.currency === "string" ? n.currency : "CAD",
      valueCents: moneyCents(combined.netLiquidationValue, OP_ACCOUNTS, `accounts[${i}].netLiquidationValue`),
    });
  });
  return out;
}

export function mapPositions(nodes: unknown): PortfolioPosition[] {
  if (!Array.isArray(nodes)) throw new WsShapeError(OP_POSITIONS, "positions is not an array");
  return nodes.map((node, i) => {
    const n = obj(node);
    if (!n) throw new WsShapeError(OP_POSITIONS, `positions[${i}] is not an object`);

    const quantity = asNumber(n.quantity);
    if (quantity === null) throw new WsShapeError(OP_POSITIONS, `positions[${i}].quantity is not numeric`);

    const security = obj(n.security);
    if (!security || typeof security.id !== "string") {
      throw new WsShapeError(OP_POSITIONS, `positions[${i}].security missing`);
    }
    const stock = obj(security.stock);
    const quote = obj(security.quoteV2);

    const price = asNumber(quote?.price);
    const referenceClose = asNumber(quote?.referenceClose);
    const dayChangeCents =
      price !== null && referenceClose !== null
        ? Math.round((price - referenceClose) * quantity * 100)
        : null;

    if (n.totalValue === null || n.totalValue === undefined) {
      throw new WsShapeError(OP_POSITIONS, `positions[${i}].totalValue missing`);
    }

    const accounts = Array.isArray(n.accounts) ? n.accounts : [];
    const accountIds = accounts
      .map((a) => obj(a)?.id)
      .filter((id): id is string => typeof id === "string");

    return {
      symbol: typeof stock?.symbol === "string" ? stock.symbol : security.id,
      name: typeof stock?.name === "string" ? stock.name : security.id,
      exchange: typeof stock?.primaryExchange === "string" ? stock.primaryExchange : null,
      quantity,
      priceCents: price !== null ? Math.round(price * 100) : null,
      currency: typeof security.currency === "string" ? security.currency : "CAD",
      valueCadCents: moneyCents(n.totalValue, OP_POSITIONS, `positions[${i}].totalValue`),
      dayChangeCents,
      totalReturnCadCents: optMoneyCents(n.unrealizedReturns, OP_POSITIONS, `positions[${i}].unrealizedReturns`),
      accountIds,
    };
  });
}

// `allTime` = FetchIdentityCurrentFinancials without startDate;
// `today` = the same query with startDate = today's date in America/Toronto,
// whose simpleReturns is the return since today's open (the day P&L).
export function buildSummary(allTime: unknown, today: unknown): PortfolioSummary {
  const at = obj(allTime);
  if (!at || at.netLiquidationValueV2 === undefined) {
    throw new WsShapeError(OP_FINANCIALS, "netLiquidationValueV2 missing");
  }
  const atReturns = obj(at.simpleReturns);
  const todayReturns = obj(obj(today)?.simpleReturns);
  return {
    totalValueCents: moneyCents(at.netLiquidationValueV2, OP_FINANCIALS, "netLiquidationValueV2"),
    dayPnlCents: todayReturns
      ? optMoneyCents(todayReturns.amount, OP_FINANCIALS, "today simpleReturns.amount")
      : null,
    totalPnlCents: atReturns
      ? optMoneyCents(atReturns.amount, OP_FINANCIALS, "simpleReturns.amount")
      : null,
    totalPnlRate: atReturns && typeof atReturns.rate === "number" ? atReturns.rate : null,
  };
}
