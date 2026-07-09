import { describe, expect, it } from "vitest";
import { linearProjection, nextMonthLabel, projectSpending } from "./insights";

describe("nextMonthLabel", () => {
  it("increments within a year", () => {
    expect(nextMonthLabel("2026-06")).toBe("2026-07");
  });
  it("rolls over the year", () => {
    expect(nextMonthLabel("2026-12")).toBe("2027-01");
  });
});

describe("linearProjection", () => {
  it("extrapolates a rising trend", () => {
    expect(linearProjection([100, 200, 300])).toBe(400);
  });
  it("returns the value for a flat series", () => {
    expect(linearProjection([250, 250, 250])).toBe(250);
  });
  it("clamps a falling trend at zero", () => {
    expect(linearProjection([300, 150, 0])).toBe(0);
  });
  it("handles two points", () => {
    expect(linearProjection([100, 150])).toBe(200);
  });
});

describe("projectSpending", () => {
  const monthly = [
    { month: "2026-04", category: "E-Transfer Sent", total: 1000 },
    { month: "2026-04", category: "Other", total: 100 },
    { month: "2026-05", category: "E-Transfer Sent", total: 500 },
    { month: "2026-05", category: "Dining & Takeout", total: 50 },
    { month: "2026-06", category: "E-Transfer Sent", total: 250 },
    { month: "2026-06", category: "Dining & Takeout", total: 100 },
  ];

  it("projects the next month from monthly totals", () => {
    const p = projectSpending(monthly);
    expect(p).not.toBeNull();
    expect(p!.month).toBe("2026-07");
    expect(p!.monthsUsed).toBe(3);
    // Totals: apr 1100, may 550, jun 350 -> falling trend, clamped >= 0.
    expect(p!.total).toBeGreaterThanOrEqual(0);
    // Missing months count as 0 for a category (Dining: 0, 50, 100 -> 150).
    const dining = p!.byCategory.find((c) => c.category === "Dining & Takeout");
    expect(dining?.projected).toBe(150);
  });

  it("needs at least two months", () => {
    expect(
      projectSpending([{ month: "2026-06", category: "Other", total: 10 }])
    ).toBeNull();
  });
});
