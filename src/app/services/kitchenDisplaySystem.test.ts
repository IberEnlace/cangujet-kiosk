import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { KitchenOrder } from "../context/CartContext";
import {
  ACTIVE_KITCHEN_COLUMNS,
  formatKitchenElapsed,
  kitchenUrgency,
  matchesKitchenSearch,
  nextKitchenColumn,
  sortKitchenOrders,
} from "./orders/kitchenDisplayModel";

const NOW = Date.parse("2026-08-03T12:20:00.000Z");

test("KDS exposes only the four active production columns", () => {
  assert.deepEqual(ACTIVE_KITCHEN_COLUMNS, ["received", "preparing", "cooking", "ready"]);
  assert.equal(ACTIVE_KITCHEN_COLUMNS.includes("completed"), false);
  assert.deepEqual(["submitted", "accepted", "preparing", "ready"].map(status => nextKitchenColumn({ databaseStatus: status as KitchenOrder["databaseStatus"] })), ["preparing", "cooking", "ready", "completed"]);
});

test("live preparation time formats seconds and hours without rounding to minutes", () => {
  assert.equal(formatKitchenElapsed(134), "02:14");
  assert.equal(formatKitchenElapsed(591), "09:51");
  assert.equal(formatKitchenElapsed(1_056), "17:36");
  assert.equal(formatKitchenElapsed(3_661), "01:01:01");
});

test("urgency changes at the exact 5, 10, and 15 minute boundaries", () => {
  assert.equal(kitchenUrgency(order({ ageSeconds: 299 }), NOW), "green");
  assert.equal(kitchenUrgency(order({ ageSeconds: 300 }), NOW), "yellow");
  assert.equal(kitchenUrgency(order({ ageSeconds: 600 }), NOW), "orange");
  assert.equal(kitchenUrgency(order({ ageSeconds: 900 }), NOW), "red");
});

test("search covers order number, product, and customer reference", () => {
  const value = order({ orderNumber: "M110", customer: "customer-reference-abc", product: "Truffle Burger" });
  assert.equal(matchesKitchenSearch(value, "m110"), true);
  assert.equal(matchesKitchenSearch(value, "truffle"), true);
  assert.equal(matchesKitchenSearch(value, "reference-abc"), true);
  assert.equal(matchesKitchenSearch(value, "pizza"), false);
});

test("automatic sorting keeps urgent orders first and then oldest first", () => {
  const kiosk = order({ id: "kiosk", source: "kiosk", type: "dine_in", ageSeconds: 60 });
  const cashier = order({ id: "cashier", source: "cashier", type: "take_away", ageSeconds: 700 });
  assert.equal(sortKitchenOrders([kiosk, cashier], NOW)[0].id, "cashier", "urgent orders remain above newer non-urgent orders");
  const equallyUrgentOld = order({ id: "old", ageSeconds: 720 });
  const equallyUrgentNew = order({ id: "new", ageSeconds: 610 });
  assert.deepEqual(sortKitchenOrders([equallyUrgentNew, equallyUrgentOld], NOW).map(value => value.id), ["old", "new"]);
});

test("KDS UI keeps REST authoritative realtime signals, one-shot notification, rollback, motion, and accessibility", () => {
  const page = readFileSync("src/app/pages/KitchenDisplay.tsx", "utf8");
  const hook = readFileSync("src/app/hooks/useRealtimeOrders.ts", "utf8");
  assert.match(hook, /kitchenOrderService\.list/);
  assert.match(hook, /subscribeToBranchOrders/);
  assert.match(page, /previousIds = useRef<Set<string> \| null>\(null\)/);
  assert.match(page, /announcedIds\.current\.has/);
  assert.match(page, /kitchenNotificationService\.notifyNewOrders/);
  assert.match(page, /delete next\[order\.id\]/);
  assert.match(page, /returned to its previous column/);
  assert.match(page, /AnimatePresence/);
  assert.match(page, /useReducedMotion/);
  assert.match(page, /min-w-\[1240px\] grid-cols-4/);
  assert.match(page, /event\.key === "\/"/);
  assert.match(page, /Enter to advance/);
  assert.doesNotMatch(page, /label: "Completed"/);
  assert.doesNotMatch(page, /All sources|All service|Oldest first|Newest first|Urgent only|Refresh orders/);
  assert.doesNotMatch(page, /FilterSelect/);
  assert.match(page, /<Metric label="Active" value=\{activeOrders\.length\}/);
  assert.match(page, /<Metric label="Incoming" value=\{activeOrders\.filter\(order => order\.status === "received"\)\.length\}/);
  assert.match(page, /<Metric label="Urgent" value=\{urgentCount\}/);
  assert.match(page, /<Metric label="Done today" value=\{liveOrders\.doneToday\}/);
  assert.match(hook, /branchTodayRange\(timezone\)/);
  assert.match(hook, /completedAt >= businessDayStart && completedAt < businessDayEnd/);
  assert.match(page, /matchesKitchenSearch\(order, query\)/);
  assert.match(page, /sortKitchenOrders\([\s\S]*sortNow/);
});

function order(input: {
  id?: string;
  orderNumber?: string;
  customer?: string;
  product?: string;
  source?: KitchenOrder["source"];
  type?: KitchenOrder["type"];
  ageSeconds?: number;
} = {}): KitchenOrder {
  return {
    id: input.id ?? "order-1", number: 110, orderNumber: input.orderNumber ?? "M110", customer: input.customer,
    items: [{ name: input.product ?? "Burger", qty: 1 }], status: "received", databaseStatus: "submitted",
    priority: false, delayed: false, startTime: NOW - (input.ageSeconds ?? 60) * 1_000, estimatedMinutes: 12,
    type: input.type ?? "dine_in", source: input.source ?? "kiosk", paymentMethod: "card_terminal", paymentStatus: "captured",
  };
}
