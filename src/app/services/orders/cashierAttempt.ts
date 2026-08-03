import type {
  OrderCreateRequest,
  ProductionPaymentMethod,
  ProductionServiceMode,
} from "../../../shared/orders";

export type CashierAttempt = {
  requestSignature: string;
  createKey: string;
  paymentSignature: string;
  paymentKey: string;
  workflowAttemptId: string;
};

export type CashierCreateItem = {
  productId: string;
  quantity: number;
  modifierIds: string[];
  notes?: string | null;
};

export type CashierCreatePayload = Omit<OrderCreateRequest, "idempotencyKey" | "source"> & {
  source: "cashier";
};

export type CashierPaymentSignatureInput = {
  orderId: string;
  method: ProductionPaymentMethod;
  amountReceived: string | number | null | undefined;
  captured: boolean;
  currency: string;
};

type IdFactory = () => string;

export function newCashierAttempt(createId: IdFactory = () => crypto.randomUUID()): CashierAttempt {
  return {
    requestSignature: "",
    createKey: createId(),
    paymentSignature: "",
    paymentKey: createId(),
    workflowAttemptId: createId(),
  };
}

export function buildCashierCreatePayload(input: {
  items: CashierCreateItem[];
  serviceMode: ProductionServiceMode;
  language: string;
  notes?: string | null;
}): CashierCreatePayload {
  const notes = normalizeText(input.notes);
  const items = input.items
    .map(item => ({
      productId: item.productId.trim(),
      quantity: item.quantity,
      modifierIds: [...item.modifierIds].sort(compareText),
      ...(normalizeText(item.notes) ? { notes: normalizeText(item.notes)! } : {}),
    }))
    .sort((left, right) => compareText(stableJson(left), stableJson(right)));

  return {
    items,
    serviceMode: input.serviceMode,
    language: input.language.trim().toLowerCase(),
    ...(notes ? { notes } : {}),
    source: "cashier",
  };
}

export function cashierCreateSignature(payload: CashierCreatePayload): string {
  return stableJson({
    items: payload.items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      modifierIds: [...item.modifierIds].sort(compareText),
      notes: normalizeText(item.notes),
    })),
    serviceMode: payload.serviceMode,
    language: payload.language,
    notes: normalizeText(payload.notes),
    source: "cashier",
  });
}

export function cashierPaymentSignature(input: CashierPaymentSignatureInput): string {
  return stableJson({
    orderId: input.orderId,
    method: input.method,
    amountReceived: normalizeMoney(input.amountReceived),
    captured: input.captured,
    currency: input.currency.trim().toUpperCase(),
  });
}

/** Bind a new cart to unused keys, preserve an exact retry, or rotate the
 * complete attempt when the logical create request changes. */
export function resolveCashierCreateAttempt(
  current: CashierAttempt,
  requestSignature: string,
  createId: IdFactory = () => crypto.randomUUID(),
): CashierAttempt {
  if (!current.requestSignature) return { ...current, requestSignature };
  if (current.requestSignature === requestSignature) return current;
  return { ...newCashierAttempt(createId), requestSignature };
}

/** Payment changes rotate only the payment key. The create key remains bound
 * to the current cart so an order-create retry stays idempotent. */
export function resolveCashierPaymentAttempt(
  current: CashierAttempt,
  paymentSignature: string,
  createId: IdFactory = () => crypto.randomUUID(),
): CashierAttempt {
  if (!current.paymentSignature) return { ...current, paymentSignature };
  if (current.paymentSignature === paymentSignature) return current;
  return { ...current, paymentSignature, paymentKey: createId() };
}

function normalizeText(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.trim() || null;
}

function normalizeMoney(value: string | number | null | undefined): string | null {
  if (value == null || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(amount) ? amount.toFixed(2) : String(value);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested ?? null)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
