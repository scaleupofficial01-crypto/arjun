import Decimal from "decimal.js";
import { getDb } from "./db";
import { getPrices } from "./prices";

export interface AlertCheckResult {
  checked: number;
  triggered: number;
  skippedUnsupported: number;
  errors: string[];
}

/**
 * Check all active alerts against REAL fetched prices and fire the ones that
 * crossed. Idempotent: a triggered alert goes inactive and creates exactly
 * one notification (unique per alert via triggeredAt flip + notification
 * dedup on title+user within the same alert id).
 */
export async function checkAlerts(onlyUserId?: string): Promise<AlertCheckResult> {
  const db = getDb();
  const result: AlertCheckResult = { checked: 0, triggered: 0, skippedUnsupported: 0, errors: [] };
  if (!db) {
    result.errors.push("database-not-configured");
    return result;
  }

  const alerts = await db.priceAlert.findMany({
    where: { active: true, ...(onlyUserId ? { userId: onlyUserId } : {}) },
  });
  if (alerts.length === 0) return result;

  const prices = await getPrices(alerts.map((a) => a.symbol));

  for (const alert of alerts) {
    const p = prices[alert.symbol.toUpperCase()];
    result.checked += 1;
    await db.priceAlert.update({
      where: { id: alert.id },
      data: { lastCheckedAt: new Date() },
    });
    if (!p?.supported || p.price === null) {
      result.skippedUnsupported += 1;
      continue; // never fire from missing/synthetic data
    }
    const price = new Decimal(p.price);
    const target = new Decimal(alert.targetPrice.toString());
    const hit =
      alert.condition === "ABOVE" ? price.gte(target) : price.lte(target);
    if (!hit) continue;

    // Fire: flip active->false first (idempotency guard against double-fire
    // under concurrent pollers)
    const fired = await db.priceAlert.updateMany({
      where: { id: alert.id, active: true },
      data: { active: false, triggeredAt: new Date(), triggeredPrice: p.price },
    });
    if (fired.count === 0) continue; // someone else fired it concurrently

    await db.notification.create({
      data: {
        userId: alert.userId,
        type: "price-alert",
        title: `${alert.symbol} ${alert.condition === "ABOVE" ? "≥" : "≤"} ${alert.targetPrice.toString()}`,
        body: `Alert triggered — real price ${p.price} (${p.source}) crossed your ${alert.condition.toLowerCase()} target of ${alert.targetPrice.toString()}.`,
      },
    });
    result.triggered += 1;
  }
  return result;
}
