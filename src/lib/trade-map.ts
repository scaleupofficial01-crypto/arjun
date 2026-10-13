import Decimal from "decimal.js";

/**
 * Trade Map model — builds chart-ready series from synced MT5 deals.
 * Plotted from the deals' OWN prices only (honest: no external market feed
 * is used; forex/metals OHLC needs a paid plan). Pure + unit-tested.
 */

export interface MapDeal {
  ticket: string;
  positionId: string;
  symbol: string;
  side: string; // BUY | SELL
  entry: string; // IN | OUT | INOUT
  price: string | number;
  profit: string | number;
  dealtAt: string;
}

export interface MapPoint {
  time: number; // unix seconds
  value: number; // price
  deal: MapDeal;
}

export interface MapSegment {
  positionId: string;
  from: { time: number; value: number };
  to: { time: number; value: number };
  profit: number; // exit deal profit + commission + swap already priced in (reported)
  win: boolean | null; // null when profit unknown
}

export interface MapMarker {
  time: number;
  position: "aboveBar" | "belowBar";
  shape: "arrowUp" | "arrowDown";
  color: string;
  text: string;
}

export interface SymbolMap {
  symbol: string;
  points: MapPoint[];
  segments: MapSegment[];
  markers: MapMarker[];
}

export function buildTradeMap(deals: MapDeal[]): SymbolMap[] {
  const bySymbol = new Map<string, MapDeal[]>();
  for (const d of deals) {
    const list = bySymbol.get(d.symbol) ?? [];
    list.push(d);
    bySymbol.set(d.symbol, list);
  }

  const maps: SymbolMap[] = [];
  for (const [symbol, list] of [...bySymbol.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const sorted = [...list].sort((x, y) => Date.parse(x.dealtAt) - Date.parse(y.dealtAt));

    const points: MapPoint[] = [];
    const markers: MapMarker[] = [];
    for (const d of sorted) {
      const price = new Decimal(d.price.toString());
      if (!price.isFinite() || price.lte(0)) continue;
      const t = Math.floor(Date.parse(d.dealtAt) / 1000);
      points.push({ time: t, value: price.toNumber(), deal: d });
      const isBuy = d.side === "BUY";
      // Entry arrow sits BELOW the bar pointing at the price; exit ABOVE.
      if (d.entry === "IN" || d.entry === "INOUT") {
        markers.push({
          time: t, position: "belowBar", shape: "arrowUp",
          color: isBuy ? "#22c55e" : "#ef4444",
          text: isBuy ? "BUY" : "SELL",
        });
      } else if (d.entry === "OUT") {
        markers.push({
          time: t, position: "aboveBar", shape: "arrowDown",
          color: isBuy ? "#f59e0b" : "#f59e0b",
          text: "EXIT",
        });
      }
    }

    // Round-trip segments per positionId (IN → OUT)
    const byPos = new Map<string, MapDeal[]>();
    for (const d of sorted) {
      const l = byPos.get(d.positionId) ?? [];
      l.push(d);
      byPos.set(d.positionId, l);
    }
    const segments: MapSegment[] = [];
    for (const [positionId, g] of byPos) {
      const inD = g.find((x) => x.entry === "IN" || x.entry === "INOUT");
      const outD = [...g].reverse().find((x) => x.entry === "OUT" || x.entry === "INOUT");
      if (!inD || !outD || inD.ticket === outD.ticket) continue;
      const p1 = new Decimal(inD.price.toString());
      const p2 = new Decimal(outD.price.toString());
      if (!p1.isFinite() || !p2.isFinite()) continue;
      const totalProfit = g
        .filter((x) => x.entry === "OUT")
        .reduce((acc, x) => acc.plus(new Decimal(x.profit.toString() || "0")), new Decimal(0))
        .toNumber();
      segments.push({
        positionId,
        from: { time: Math.floor(Date.parse(inD.dealtAt) / 1000), value: p1.toNumber() },
        to: { time: Math.floor(Date.parse(outD.dealtAt) / 1000), value: p2.toNumber() },
        profit: totalProfit,
        win: Number.isFinite(totalProfit) ? totalProfit >= 0 : null,
      });
    }
    maps.push({ symbol, points, segments, markers });
  }
  return maps;
}
