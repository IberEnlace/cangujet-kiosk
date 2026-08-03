import type {
  OrderPaymentRequest,
  OrderPaymentResult,
  ProductionOrder,
  ProductionPaymentMethod,
} from "../../../shared/orders";
import {
  cashierPaymentSignature,
  resolveCashierPaymentAttempt,
  type CashierAttempt,
} from "./cashierAttempt";
import type { OrderRequestContext } from "./OrderService";

export type DeferredCashierMethod = Extract<ProductionPaymentMethod, "cash" | "card_terminal">;

type DeferredCashierClient = {
  pay: (
    orderId: string,
    request: OrderPaymentRequest,
    authentication: "staff",
    context: OrderRequestContext,
  ) => Promise<OrderPaymentResult & { duplicate?: boolean }>;
  submit: (
    orderId: string,
    expectedVersion: number,
    authentication: "staff",
    context: OrderRequestContext,
  ) => Promise<ProductionOrder>;
};

export async function completeDeferredCashierPayment(input: {
  client: DeferredCashierClient;
  order: ProductionOrder;
  method: DeferredCashierMethod;
  amountReceived?: string;
  externalReference?: string;
  attempt: CashierAttempt;
  onAttemptResolved?: (attempt: CashierAttempt) => void;
  onPaymentPersisted?: (payment: OrderPaymentResult & { duplicate?: boolean }) => void;
}) {
  const normalizedAmount = input.method === "cash"
    ? normalizeCashAmount(input.amountReceived)
    : null;
  if (input.order.status !== "paid") {
    if (input.order.status !== "awaiting_payment" || input.order.paymentMethod !== "pay_at_cashier") {
      throw new Error("This order is not an unpaid Pay at Cashier order.");
    }
    if (input.method === "cash" && Number(normalizedAmount) < Number(input.order.total)) {
      throw new Error("Amount received must cover the authoritative order total.");
    }
  }

  const paymentSignature = cashierPaymentSignature({
    orderId: input.order.id,
    method: input.method,
    amountReceived: normalizedAmount,
    captured: true,
    currency: input.order.currency,
  });
  const attempt = resolveCashierPaymentAttempt(input.attempt, paymentSignature);
  input.onAttemptResolved?.(attempt);
  const context = { workflowAttemptId: attempt.workflowAttemptId };

  let paidOrder = input.order;
  let payment: (OrderPaymentResult & { duplicate?: boolean }) | null = null;
  if (paidOrder.status !== "paid") {
    payment = await input.client.pay(paidOrder.id, {
      idempotencyKey: attempt.paymentKey,
      method: input.method,
      ...(normalizedAmount === null ? {} : { amountReceived: normalizedAmount }),
      ...(input.externalReference ? { externalReference: input.externalReference } : {}),
    }, "staff", context);
    paidOrder = payment.order;
    if (paidOrder.status !== "paid" || payment.paymentStatus !== "captured") {
      throw new Error("Payment was not persisted.");
    }
    input.onPaymentPersisted?.(payment);
  }

  const submitted = await input.client.submit(paidOrder.id, paidOrder.version, "staff", context);
  if (submitted.status !== "submitted") throw new Error("Order was not submitted.");
  return { attempt, payment, paidOrder, submitted, paymentSignature };
}

export function normalizeCashAmount(value: string | undefined) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid amount received.");
  return amount.toFixed(2);
}
