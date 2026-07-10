import { describe, expect, it } from "vitest";
import {
  buildSummary,
  mapAccounts,
  mapHistoryPoints,
  mapPositions,
  WsShapeError,
} from "./domain";

const accountNode = (over: Record<string, unknown> = {}) => ({
  id: "tfsa-abc123",
  status: "open",
  currency: "CAD",
  nickname: null,
  unifiedAccountType: "TFSA",
  financials: {
    currentCombined: {
      netLiquidationValue: { amount: 12345.67, cents: 1234567, currency: "CAD" },
    },
  },
  ...over,
});

const positionNode = (over: Record<string, unknown> = {}) => ({
  id: "pos-1",
  quantity: "10",
  accounts: [{ id: "tfsa-abc123" }],
  totalValue: { amount: 1500.5, currency: "CAD" },
  unrealizedReturns: { amount: "200.25", currency: "CAD" },
  security: {
    id: "sec-s-xeqt",
    currency: "CAD",
    stock: { symbol: "XEQT", name: "iShares Core Equity ETF", primaryExchange: "TSX" },
    quoteV2: { price: "150.05", referenceClose: 149.0, currency: "CAD" },
  },
  ...over,
});

describe("mapAccounts", () => {
  it("maps open accounts using Money.cents and labels from account type", () => {
    const accounts = mapAccounts([accountNode()]);
    expect(accounts).toEqual([
      {
        id: "tfsa-abc123",
        label: "TFSA",
        type: "TFSA",
        currency: "CAD",
        valueCents: 1234567,
      },
    ]);
  });

  it("filters out non-open accounts", () => {
    expect(mapAccounts([accountNode({ status: "closed" })])).toEqual([]);
  });

  it("prefers the nickname and prettifies unknown unified types", () => {
    const accounts = mapAccounts([
      accountNode({ nickname: "Fun money" }),
      accountNode({
        id: "nr-1",
        unifiedAccountType: "SELF_DIRECTED_NON_REGISTERED_MARGIN",
      }),
    ]);
    expect(accounts[0].label).toBe("Fun money");
    expect(accounts[1].label).toBe("Self directed non registered margin");
  });

  it("falls back to Money.amount (incl. string amounts) when cents is absent", () => {
    const accounts = mapAccounts([
      accountNode({
        financials: {
          currentCombined: { netLiquidationValue: { amount: "99.99", currency: "CAD" } },
        },
      }),
    ]);
    expect(accounts[0].valueCents).toBe(9999);
  });

  it("throws WsShapeError on non-array input and on a malformed node", () => {
    expect(() => mapAccounts({})).toThrow(WsShapeError);
    expect(() => mapAccounts([{ id: "x", status: "open" }])).toThrow(WsShapeError);
  });
});

describe("mapPositions", () => {
  it("maps a CAD equity position with day change from price vs referenceClose", () => {
    const positions = mapPositions([positionNode()]);
    expect(positions).toEqual([
      {
        symbol: "XEQT",
        name: "iShares Core Equity ETF",
        exchange: "TSX",
        quantity: 10,
        priceCents: 15005,
        currency: "CAD",
        valueCadCents: 150050,
        dayChangeCents: 1050, // (150.05 - 149.00) * 10 shares
        totalReturnCadCents: 20025,
        accountIds: ["tfsa-abc123"],
      },
    ]);
  });

  it("handles USD securities (native price currency, CAD value)", () => {
    const positions = mapPositions([
      positionNode({
        totalValue: { amount: 2000, currency: "CAD" },
        security: {
          id: "sec-s-voo",
          currency: "USD",
          stock: { symbol: "VOO", name: "Vanguard S&P 500", primaryExchange: "NYSE" },
          quoteV2: { price: 500, referenceClose: 495, currency: "USD" },
        },
      }),
    ]);
    expect(positions[0].currency).toBe("USD");
    expect(positions[0].valueCadCents).toBe(200000);
    expect(positions[0].dayChangeCents).toBe(5000);
  });

  it("returns null day change / price when the quote is missing, and falls back to the security id when stock is missing", () => {
    const positions = mapPositions([
      positionNode({
        security: { id: "sec-crypto-btc", currency: "CAD", stock: null, quoteV2: null },
      }),
    ]);
    expect(positions[0]).toMatchObject({
      symbol: "sec-crypto-btc",
      name: "sec-crypto-btc",
      exchange: null,
      priceCents: null,
      dayChangeCents: null,
    });
  });

  it("returns null total return when unrealizedReturns is null", () => {
    const positions = mapPositions([positionNode({ unrealizedReturns: null })]);
    expect(positions[0].totalReturnCadCents).toBeNull();
  });

  it("throws WsShapeError on malformed quantity or missing totalValue", () => {
    expect(() => mapPositions([positionNode({ quantity: "abc" })])).toThrow(WsShapeError);
    expect(() => mapPositions([positionNode({ totalValue: null })])).toThrow(WsShapeError);
  });
});

describe("buildSummary", () => {
  const financials = (nlvCents: number, returnsCents: number | null, rate: number | null) => ({
    netLiquidationValueV2: { amount: nlvCents / 100, cents: nlvCents, currency: "CAD" },
    simpleReturns:
      returnsCents === null
        ? null
        : { amount: { amount: returnsCents / 100, cents: returnsCents, currency: "CAD" }, rate },
  });

  it("combines all-time and today financials", () => {
    const summary = buildSummary(financials(5000000, 750000, 0.15), financials(5000000, 12300, 0.002));
    expect(summary).toEqual({
      totalValueCents: 5000000,
      dayPnlCents: 12300,
      totalPnlCents: 750000,
      totalPnlRate: 0.15,
    });
  });

  it("tolerates missing simpleReturns but requires net liquidation value", () => {
    const summary = buildSummary(financials(100, null, null), financials(100, null, null));
    expect(summary.totalPnlCents).toBeNull();
    expect(summary.dayPnlCents).toBeNull();
    expect(() => buildSummary({}, financials(100, null, null))).toThrow(WsShapeError);
  });
});

describe("mapHistoryPoints", () => {
  const node = (date: string, cents: number) => ({
    date,
    netLiquidationValueV2: { amount: cents / 100, cents, currency: "CAD" },
  });

  it("maps and sorts points by date ascending", () => {
    expect(mapHistoryPoints([node("2026-07-02", 200), node("2026-07-01", 100)])).toEqual([
      { date: "2026-07-01", valueCents: 100 },
      { date: "2026-07-02", valueCents: 200 },
    ]);
  });

  it("accepts string amounts without cents", () => {
    expect(
      mapHistoryPoints([{ date: "2026-07-01", netLiquidationValueV2: { amount: "12.34", currency: "CAD" } }])
    ).toEqual([{ date: "2026-07-01", valueCents: 1234 }]);
  });

  it("throws WsShapeError on non-array input and malformed nodes", () => {
    expect(() => mapHistoryPoints({})).toThrow(WsShapeError);
    expect(() => mapHistoryPoints([{ date: "2026-07-01" }])).toThrow(WsShapeError);
    expect(() => mapHistoryPoints([{ netLiquidationValueV2: { cents: 1 } }])).toThrow(WsShapeError);
  });
});

describe("TFSA account labels", () => {
  it("labels self-directed and managed TFSAs per the owner's naming", () => {
    const accounts = mapAccounts([
      accountNode({ id: "t1", unifiedAccountType: "SELF_DIRECTED_TFSA" }),
      accountNode({ id: "t2", unifiedAccountType: "MANAGED_TFSA" }),
    ]);
    expect(accounts.map((a) => a.label)).toEqual(["Self TFSA", "Auto TFSA"]);
  });
});
