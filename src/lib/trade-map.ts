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
  volume?: string | number;
  price: string | number;
  profit: string | number;
  commission?: string | number;
  swap?: string | number;
  dealtAt: string;
  imported?: boolean; // already imported into the journal (from the account API)
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

/** One neat row per closed trade — the MT5 "History" tab view. */
export interface RoundTrip {
  positionId: string;
  symbol: string;
  side: "BUY" | "SELL";
  volume: number;
  openTime: string;
  openPrice: number;
  closeTime: string;
  closePrice: number;
  commission: number;
  swap: number;
  profit: number; // as reported by the terminal (display-only; journal recomputes its own)
  win: boolean;
  inJournal: boolean; // any deal of this trip already imported into the journal
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
      const vol = d.volume !== undefined ? new Decimal(d.volume.toString()).toFixed(2).replace(/\.?0+$/, "") : "";
      const p = new Decimal(d.profit.toString() || "0");
      const pText = `${p.gte(0) ? "+" : ""}${p.toFixed(2)}`;
      // TradingView-style labels: entry shows side+volume, exit shows result.
      if (d.entry === "IN" || d.entry === "INOUT") {
        markers.push({
          time: t, position: "belowBar", shape: "arrowUp",
          color: isBuy ? "#22c55e" : "#ef4444",
          text: isBuy ? `BUY ${vol}` : `SELL ${vol}`,
        });
      } else if (d.entry === "OUT") {
        markers.push({
          time: t, position: "aboveBar", shape: "arrowDown",
          color: p.gte(0) ? "#22c55e" : "#ef4444",
          text: p.toFixed(2) === "0.00" || p.toFixed(2) === "-0.00" ? "EXIT" : `EXIT ${pText}`,
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

/** Deterministic 2dp trimming for the history table (1.50 → 1.5, 0.10 → 0.1). */
function trim2(d: Decimal): number {
  return Number(d.toFixed(2));
}

/**
 * MT5 "History" view: one clean row per CLOSED round-trip.
 * Open positions (no exit deal) are excluded — they live in the Trade tab.
 */
export function buildRoundTrips(deals: MapDeal[]): RoundTrip[] {
  const byPos = new Map<string, MapDeal[]>();
  for (const d of deals) {
    const list = byPos.get(d.positionId) ?? [];
    list.push(d);
    byPos.set(d.positionId, list);
  }
  const trips: RoundTrip[] = [];
  for (const [positionId, g] of byPos) {
    const sorted = [...g].sort((a, b) => Date.parse(a.dealtAt) - Date.parse(b.dealtAt));
    const inD = sorted.find((x) => x.entry === "IN" || x.entry === "INOUT");
    const outD = [...sorted].reverse().find((x) => x.entry === "OUT" || x.entry === "INOUT");
    if (!inD || !outD || inD.ticket === outD.ticket) continue;
    const openP = new Decimal(inD.price.toString());
    const closeP = new Decimal(outD.price.toString());
    if (!openP.isFinite() || !closeP.isFinite()) continue;
    const sum = (pick: (d: MapDeal) => string | number | undefined) =>
      g.reduce((acc, x) => acc.plus(new Decimal((pick(x) ?? 0).toString())), new Decimal(0));
    const profit = sum((d) => d.profit);
    const trip: RoundTrip = {
      positionId,
      symbol: inD.symbol,
      side: inD.side === "BUY" ? "BUY" : "SELL",
      volume: new Decimal(outD.volume?.toString() || inD.volume?.toString() || "0").toNumber(),
      openTime: inD.dealtAt,
      openPrice: openP.toNumber(),
      closeTime: outD.dealtAt,
      closePrice: closeP.toNumber(),
      commission: trim2(sum((d) => d.commission)),
      swap: trim2(sum((d) => d.swap)),
      profit: trim2(profit),
      win: profit.gte(0),
      inJournal: g.some((x) => x.imported),
    };
    trips.push(trip);
  }
  return trips.sort((a, b) => Date.parse(b.closeTime) - Date.parse(a.closeTime));
}
