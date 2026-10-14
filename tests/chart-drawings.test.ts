import { describe, expect, it } from "vitest";
import { makeDrawing, normalizeChartData, drawingToSegments, DRAWING_COLORS } from "@/lib/chart-drawings";

const p = (t: number, price: number) => ({ time: t, price });
const BARS = { minTime: 1_700_000_000, maxTime: 1_700_500_000, minPrice: 100, maxPrice: 200 };

describe("makeDrawing", () => {
  it("creates a trendline with two anchors and validates fields", () => {
    const d = makeDrawing("trendline", [p(1000, 10), p(2000, 20)])!;
    expect(d.type).toBe("trendline");
    expect(d.anchors).toHaveLength(2);
    expect(d.id).toMatch(/^drw_/);
    expect(d.color).toBe(DRAWING_COLORS[0]);
  });
  it("rejects wrong anchor counts and junk values", () => {
    expect(makeDrawing("trendline", [p(1, 2)])).toBeNull();
    expect(makeDrawing("hline", [])).toBeNull();
    expect(makeDrawing("hline", [{ time: NaN, price: 5 }])).toBeNull();
    expect(makeDrawing("vline", [p(1, 2), p(3, 4)])).toBeNull();
  });
  it("falls back to a safe color for bad hex", () => {
    expect(makeDrawing("hline", [p(1, 2)], "red")!.color).toBe(DRAWING_COLORS[0]);
    expect(makeDrawing("hline", [p(1, 2)], "#a855f7")!.color).toBe("#a855f7");
  });
});

describe("normalizeChartData (untrusted DB payload)", () => {
  it("round-trips a valid payload", () => {
    const src = {
      drawings: [
        { id: "drw_ok_1", type: "hline", anchors: [{ time: 5000, price: 4010.5 }], color: "#22c55e" },
        { id: "drw_ok_2", type: "trendline", anchors: [{ time: 1, price: 2 }, { time: 3, price: 4 }], color: "#f59e0b" },
        { id: "drw_ok_3", type: "rect", anchors: [{ time: 1, price: 2 }, { time: 3, price: 4 }], color: "#f59e0b" },
        { id: "drw_ok_4", type: "ray", anchors: [{ time: 1, price: 2 }, { time: 3, price: 4 }], color: "#f59e0b" },
      ],
      state: { visibleRange: { from: 10, to: 20 } },
    };
    const out = normalizeChartData(src);
    expect(out.drawings).toHaveLength(4);
    expect(out.drawings[0].color).toBe("#22c55e");
    expect(out.drawings.map((x) => x.type)).toEqual(["hline", "trendline", "rect", "ray"]);
    expect(out.state.visibleRange).toEqual({ from: 10, to: 20 });
  });
  it("drops garbage instead of throwing", () => {
    const src = {
      drawings: [
        "junk", null, 42,
        { id: "x", type: "ray", anchors: [] }, // unknown type
        { id: "y", type: "hline", anchors: [] }, // wrong count
        { id: "z", type: "hline", anchors: [{ time: "abc" }] },
        { id: "keep_1", type: "vline", anchors: [{ time: 9, price: 9 }], color: "oops" },
      ],
      state: { visibleRange: { from: 10, to: 5 } }, // inverted → dropped
    };
    const out = normalizeChartData(src);
    expect(out.drawings).toHaveLength(1);
    expect(out.drawings[0].type).toBe("vline");
    expect(out.state.visibleRange).toBeUndefined();
  });
  it("tolerates null / non-object input", () => {
    expect(normalizeChartData(null)).toEqual({ drawings: [], state: {} });
    expect(normalizeChartData("whatever")).toEqual({ drawings: [], state: {} });
  });
});

describe("drawingToSegments (renderable lines)", () => {
  it("keeps trendline as one segment, ordered forward in time", () => {
    const d = makeDrawing("trendline", [p(2000, 20), p(1000, 10)])!;
    const segs = drawingToSegments(d, BARS);
    expect(segs).toEqual([{ from: p(1000, 10), to: p(2000, 20) }]);
  });
  it("stretches horizontal lines past the candle window on both sides", () => {
    const d = makeDrawing("hline", [p(1_700_250_000, 4010.5)])!;
    const [seg] = drawingToSegments(d, BARS);
    expect(seg.from.price).toBe(4010.5);
    expect(seg.to.price).toBe(4010.5);
    expect(seg.from.time).toBeLessThan(BARS.minTime);
    expect(seg.to.time).toBeGreaterThan(BARS.maxTime);
  });
  it("stretches vertical lines past the price window with a tiny time offset", () => {
    const d = makeDrawing("vline", [p(1_700_250_000, 123)])!;
    const [seg] = drawingToSegments(d, BARS);
    expect(seg.to.time).toBeGreaterThan(seg.from.time);
    expect(seg.from.price).toBeLessThan(BARS.minPrice);
    expect(seg.to.price).toBeGreaterThan(BARS.maxPrice);
  });
  it("renders a rectangle as its four edges from opposite corners", () => {
    const d = makeDrawing("rect", [p(2000, 20), p(1000, 10)])!;
    const segs = drawingToSegments(d, BARS);
    expect(segs).toHaveLength(4);
    const prices = segs.flatMap((s) => [s.from.price, s.to.price]);
    expect(Math.min(...prices)).toBe(10);
    expect(Math.max(...prices)).toBe(20);
    const times = segs.flatMap((s) => [s.from.time, s.to.time]);
    expect(Math.min(...times)).toBe(1000);
    expect(Math.max(...times)).toBeGreaterThanOrEqual(2000);
  });
  it("extends a ray past the second anchor in the drawn direction", () => {
    const d = makeDrawing("ray", [p(1000, 10), p(2000, 20)])!; // slope +10/ks, drawn forward
    const [seg] = drawingToSegments(d, BARS);
    expect(seg.from.time).toBeLessThanOrEqual(1000);
    expect(seg.to.time).toBeGreaterThan(BARS.maxTime); // extended beyond window
    // slope preserved: price rises in the same direction as drawn
    expect(seg.to.price).toBeGreaterThan(seg.from.price);
    expect(makeDrawing("ray", [p(2000, 20), p(1000, 10)])).not.toBeNull(); // backward-drawn ok
  });
  it("keeps a degenerate vertical ray renderable", () => {
    const d = makeDrawing("ray", [p(5000, 10), p(5000, 20)])!;
    const [seg] = drawingToSegments(d, BARS);
    expect(seg.to.time).toBeGreaterThan(seg.from.time);
    expect(seg.to.price).toBeGreaterThan(seg.from.price);
  });
});
