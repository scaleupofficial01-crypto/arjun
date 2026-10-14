import { describe, expect, it } from "vitest";
import { buildEquityCurve } from "@/lib/equity";

const d = (over: Partial<Record<string, string | number>>) => ({
  ticket: "x", positionId: "p", symbol: "XAUUSD", side: "BUY", entry: "IN",
  price: "100", profit: "0", dealtAt: "2026-10-01T00:00:00.000Z", ...over,
});

describe("buildEquityCurve", () => {
  it("accumulates profit+commission+swap per deal in time order", () => {
    const c = buildEquityCurve([
      d({ ticket: "1", profit: "0", commission: "-0.70", dealtAt: "2026-10-01T01:00:00.000Z" }),
      d({ ticket: "2", entry: "OUT", profit: "2.25", commission: "-0.70", swap: "-0.35", dealtAt: "2026-10-02T01:00:00.000Z" }),
      d({ ticket: "3", entry: "OUT", profit: "-6.30", commission: "-1.40", dealtAt: "2026-10-03T01:00:00.000Z" }),
    ]);
    expect(c.points.map((p) => p.value)).toEqual([-0.7, 0.5, -7.2]);
    expect(c.net).toBeCloseTo(-7.2, 6);
  });
  it("counts exits as closed legs and computes win stats", () => {
    const c = buildEquityCurve([
      d({ ticket: "1" }),
      d({ ticket: "2", entry: "OUT", profit: "2", dealtAt: "2026-10-02T00:00:00.000Z" }),
      d({ ticket: "3", entry: "OUT", profit: "-1", dealtAt: "2026-10-03T00:00:00.000Z" }),
      d({ ticket: "4", entry: "OUT", profit: "0", dealtAt: "2026-10-04T00:00:00.000Z" }), // breakeven: neither
    ]);
    expect(c.closed).toBe(3);
    expect(c.wins).toBe(1);
    expect(c.losses).toBe(1);
    expect(c.winRate).toBeCloseTo(1 / 3, 6);
  });
  it("merges deals sharing the same second into one curve point", () => {
    const c = buildEquityCurve([
      d({ ticket: "1", commission: "-1" }),
      d({ ticket: "2", entry: "OUT", profit: "3" }),
    ]);
    expect(c.points).toHaveLength(1);
    expect(c.points[0].value).toBe(2);
    expect(c.points[0].time).toBeLessThanOrEqual(c.points[0].time); // exists
  });
  it("handles empty and junk input gracefully", () => {
    expect(buildEquityCurve([])).toMatchObject({ points: [], net: 0, closed: 0, winRate: 0 });
    const c = buildEquityCurve([d({ dealtAt: "not-a-date" })]);
    expect(c.points).toHaveLength(0);
  });
});
