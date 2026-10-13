import { describe, it, expect } from "vitest";
import {
  readMyChartState,
  mergeIntoLayoutData,
  nextColor,
  EMPTY_STATE,
} from "@/lib/chart-drawings";

describe("chart drawings state", () => {
  it("returns empty state for junk input", () => {
    expect(readMyChartState(null)).toEqual(EMPTY_STATE);
    expect(readMyChartState("x")).toEqual(EMPTY_STATE);
    expect(readMyChartState({ mychart: { drawings: "nope" } })).toEqual(EMPTY_STATE);
  });

  it("parses valid trend + hline drawings", () => {
    const data = {
      mychart: {
        v: 1,
        drawings: [
          { id: "d1", type: "trend", a: { t: 1760000000, p: 83000 }, b: { t: 1760100000, p: 85000 }, color: "#f59e0b", createdAt: "2026-10-13T00:00:00.000Z" },
          { id: "d2", type: "hline", a: { t: 1760000000, p: 82000 }, color: "#22c55e", createdAt: "2026-10-13T00:00:00.000Z" },
        ],
      },
    };
    const s = readMyChartState(data);
    expect(s.drawings).toHaveLength(2);
    expect(s.drawings[0].b?.p).toBe(85000);
  });

  it("drops malformed drawings but keeps good ones", () => {
    const data = {
      mychart: {
        drawings: [
          { id: "ok", type: "hline", a: { t: 100, p: 5 } },
          { id: "bad-type", type: "circle", a: { t: 1, p: 1 } },
          { id: "bad-no-anchor", type: "trend" },
          { id: "bad-range", type: "hline", a: { t: 99999999999999, p: 1 } },
        ],
      },
    };
    const s = readMyChartState(data);
    expect(s.drawings.map((d) => d.id)).toEqual(["ok"]);
    expect(s.drawings[0].color).toMatch(/^#/); // defaulted
  });

  it("mergeIntoLayoutData preserves unrelated keys and replaces mychart", () => {
    const existing = { "tv-store-x": { foo: 1 }, mychart: { v: 1, drawings: [] } };
    const merged = mergeIntoLayoutData(existing, {
      v: 1,
      drawings: [{ id: "n1", type: "hline", a: { t: 5, p: 5 }, color: "#f59e0b", createdAt: "x" }],
    });
    expect(merged["tv-store-x"]).toEqual({ foo: 1 });
    expect((merged.mychart as { drawings: unknown[] }).drawings).toHaveLength(1);
  });

  it("cycles colors deterministically", () => {
    expect(nextColor([])).toBe("#f59e0b");
    expect(nextColor([{ id: "a", type: "hline", a: { t: 1, p: 1 }, color: "#f59e0b", createdAt: "x" }])).toBe("#22c55e");
  });
});
