import type { ProductionOrder } from "../../../shared/orders";

export const PAY_AT_CASHIER_CONFIRMATION_KEY = "morrow:pay-at-cashier-confirmation:v1";

export type ConfirmationPrintState = "pending" | "printing" | "printed" | "failed";

export type PayAtCashierConfirmationSnapshot = {
  version: 1;
  orderId: string;
  orderNumber: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  currency: string;
  createdAt: string;
  serviceMode: "dine_in" | "take_away";
  paymentMethod: "pay_at_cashier";
  paymentStatus: "pending";
  orderStatus: "awaiting_payment";
  items: Array<{
    name: string;
    quantity: number;
    modifiers: string[];
  }>;
  printState: ConfirmationPrintState;
  printAttempts: number;
};

export function savePayAtCashierConfirmation(
  order: ProductionOrder,
  storage: Pick<Storage, "setItem"> = sessionStorage,
) {
  if (order.status !== "awaiting_payment"
    || order.paymentStatus !== "pending"
    || order.paymentMethod !== "pay_at_cashier") {
    throw new Error("Pay at cashier intent was not persisted.");
  }
  const snapshot: PayAtCashierConfirmationSnapshot = {
    version: 1,
    orderId: order.id,
    orderNumber: order.orderNumber,
    subtotal: order.subtotal,
    taxTotal: order.taxTotal,
    total: order.total,
    currency: order.currency,
    createdAt: order.createdAt,
    serviceMode: order.serviceMode,
    paymentMethod: "pay_at_cashier",
    paymentStatus: "pending",
    orderStatus: "awaiting_payment",
    items: order.items.map(item => ({
      name: item.productName,
      quantity: item.quantity,
      modifiers: item.modifiers.map(modifier => modifier.name),
    })),
    printState: "pending",
    printAttempts: 0,
  };
  write(snapshot, storage);
  return snapshot;
}

export function readPayAtCashierConfirmation(
  storage: Pick<Storage, "getItem"> = sessionStorage,
): PayAtCashierConfirmationSnapshot | null {
  try {
    const value = storage.getItem(PAY_AT_CASHIER_CONFIRMATION_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as unknown;
    return isValidPayAtCashierConfirmation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Atomically claims the one automatic print attempt across rerenders/refreshes. */
export function claimPayAtCashierAutomaticPrint(storage: Storage = sessionStorage) {
  const snapshot = readPayAtCashierConfirmation(storage);
  if (!snapshot || snapshot.printState !== "pending") return null;
  const claimed = { ...snapshot, printState: "printing" as const, printAttempts: snapshot.printAttempts + 1 };
  write(claimed, storage);
  return claimed;
}

export function beginPayAtCashierPrintRetry(storage: Storage = sessionStorage) {
  const snapshot = readPayAtCashierConfirmation(storage);
  if (!snapshot || (snapshot.printState !== "failed" && snapshot.printState !== "printing")) return null;
  const retry = { ...snapshot, printState: "printing" as const, printAttempts: snapshot.printAttempts + 1 };
  write(retry, storage);
  return retry;
}

export function completePayAtCashierPrint(success: boolean, storage: Storage = sessionStorage) {
  const snapshot = readPayAtCashierConfirmation(storage);
  if (!snapshot) return null;
  const completed = { ...snapshot, printState: success ? "printed" as const : "failed" as const };
  write(completed, storage);
  return completed;
}

export function clearPayAtCashierConfirmation(storage: Pick<Storage, "removeItem"> = sessionStorage) {
  try { storage.removeItem(PAY_AT_CASHIER_CONFIRMATION_KEY); } catch { /* Storage may be disabled. */ }
}

export function isValidPayAtCashierConfirmation(value: unknown): value is PayAtCashierConfirmationSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<PayAtCashierConfirmationSnapshot>;
  return candidate.version === 1
    && typeof candidate.orderId === "string" && candidate.orderId.length > 0
    && typeof candidate.orderNumber === "string" && candidate.orderNumber.length > 0
    && typeof candidate.total === "string" && Number.isFinite(Number(candidate.total))
    && typeof candidate.subtotal === "string" && Number.isFinite(Number(candidate.subtotal))
    && typeof candidate.taxTotal === "string" && Number.isFinite(Number(candidate.taxTotal))
    && typeof candidate.currency === "string" && /^[A-Z]{3}$/.test(candidate.currency)
    && typeof candidate.createdAt === "string" && Number.isFinite(Date.parse(candidate.createdAt))
    && (candidate.serviceMode === "dine_in" || candidate.serviceMode === "take_away")
    && candidate.paymentMethod === "pay_at_cashier"
    && candidate.paymentStatus === "pending"
    && candidate.orderStatus === "awaiting_payment"
    && Array.isArray(candidate.items)
    && candidate.items.every(item => Boolean(item)
      && typeof item.name === "string"
      && Number.isInteger(item.quantity) && item.quantity > 0
      && Array.isArray(item.modifiers) && item.modifiers.every(modifier => typeof modifier === "string"))
    && ["pending", "printing", "printed", "failed"].includes(candidate.printState ?? "")
    && Number.isInteger(candidate.printAttempts) && Number(candidate.printAttempts) >= 0;
}

function write(snapshot: PayAtCashierConfirmationSnapshot, storage: Pick<Storage, "setItem">) {
  storage.setItem(PAY_AT_CASHIER_CONFIRMATION_KEY, JSON.stringify(snapshot));
}
