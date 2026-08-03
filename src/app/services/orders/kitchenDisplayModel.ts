import type { KitchenOrder, OrderStatus } from "../../context/CartContext";

export type KitchenUrgency = "green" | "yellow" | "orange" | "red";
export const ACTIVE_KITCHEN_COLUMNS: OrderStatus[] = ["received", "preparing", "cooking", "ready"];

export function elapsedKitchenSeconds(order: Pick<KitchenOrder, "startTime">, now = Date.now()) {
  return Math.max(0, Math.floor((now - order.startTime) / 1_000));
}

export function formatKitchenElapsed(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const remainder = safe % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function kitchenUrgency(order: Pick<KitchenOrder, "startTime">, now = Date.now()): KitchenUrgency {
  const minutes = elapsedKitchenSeconds(order, now) / 60;
  if (minutes >= 15) return "red";
  if (minutes >= 10) return "orange";
  if (minutes >= 5) return "yellow";
  return "green";
}

export function kitchenUrgencyRank(order: Pick<KitchenOrder, "startTime">, now = Date.now()) {
  return ({ green: 0, yellow: 1, orange: 2, red: 3 } as const)[kitchenUrgency(order, now)];
}

export function matchesKitchenSearch(order: KitchenOrder, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  return !normalizedQuery
    || (order.orderNumber ?? String(order.number)).toLowerCase().includes(normalizedQuery)
    || (order.customer ?? "").toLowerCase().includes(normalizedQuery)
    || order.items.some(item => item.name.toLowerCase().includes(normalizedQuery));
}

export function sortKitchenOrders(orders: KitchenOrder[], now = Date.now()) {
  return [...orders].sort((left, right) => {
    const urgent = kitchenUrgencyRank(right, now) - kitchenUrgencyRank(left, now);
    if (urgent !== 0) return urgent;
    return left.startTime - right.startTime;
  });
}

export function nextKitchenColumn(order: Pick<KitchenOrder, "databaseStatus">): OrderStatus | null {
  switch (order.databaseStatus) {
    case "submitted": return "preparing";
    case "accepted": return "cooking";
    case "preparing": return "ready";
    case "ready": return "completed";
    default: return null;
  }
}
