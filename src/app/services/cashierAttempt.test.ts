import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCashierCreatePayload,
  cashierCreateSignature,
  cashierPaymentSignature,
  newCashierAttempt,
  resolveCashierCreateAttempt,
  resolveCashierPaymentAttempt,
} from "./orders/cashierAttempt";

test("first cashier order uses K1 and an unchanged retry keeps K1", () => {
  const initial = newCashierAttempt(ids("K1", "P1", "W1"));
  const signature = createSignature(1);
  const first = resolveCashierCreateAttempt(initial, signature, ids("unused"));
  const retry = resolveCashierCreateAttempt(first, signature, ids("unused"));

  assert.equal(first.createKey, "K1");
  assert.equal(first.workflowAttemptId, "W1");
  assert.equal(retry, first);
});

test("a changed cart rotates create, payment, and workflow keys to K2", () => {
  const first = resolveCashierCreateAttempt(
    newCashierAttempt(ids("K1", "P1", "W1")),
    createSignature(1),
  );
  const changed = resolveCashierCreateAttempt(
    first,
    createSignature(2),
    ids("K2", "P2", "W2"),
  );

  assert.equal(changed.createKey, "K2");
  assert.equal(changed.paymentKey, "P2");
  assert.equal(changed.workflowAttemptId, "W2");
  assert.notEqual(changed.requestSignature, first.requestSignature);
});

test("manual clear and successful sale each replace the entire attempt", () => {
  const active = resolveCashierCreateAttempt(
    newCashierAttempt(ids("K1", "P1", "W1")),
    createSignature(1),
  );
  const afterClear = newCashierAttempt(ids("K2", "P2", "W2"));
  const afterSuccess = newCashierAttempt(ids("K3", "P3", "W3"));

  assert.equal(active.createKey, "K1");
  assert.deepEqual(afterClear, {
    requestSignature: "", createKey: "K2", paymentSignature: "",
    paymentKey: "P2", workflowAttemptId: "W2",
  });
  assert.deepEqual(afterSuccess, {
    requestSignature: "", createKey: "K3", paymentSignature: "",
    paymentKey: "P3", workflowAttemptId: "W3",
  });
});

test("failed payment keeps the create key while changed amount rotates only payment key", () => {
  const created = resolveCashierCreateAttempt(
    newCashierAttempt(ids("K1", "P1", "W1")),
    createSignature(1),
  );
  const firstPayment = resolveCashierPaymentAttempt(
    created,
    paymentSignature("20.00"),
  );
  const exactRetry = resolveCashierPaymentAttempt(
    firstPayment,
    paymentSignature("20"),
    ids("unused"),
  );
  const changedAmount = resolveCashierPaymentAttempt(
    exactRetry,
    paymentSignature("25.00"),
    ids("P2"),
  );

  assert.equal(exactRetry, firstPayment);
  assert.equal(changedAmount.createKey, "K1");
  assert.equal(changedAmount.workflowAttemptId, "W1");
  assert.equal(changedAmount.paymentKey, "P2");
});

test("create signatures normalize item order, modifier order, and absent notes", () => {
  const first = buildCashierCreatePayload({
    items: [
      { productId: "product-b", quantity: 1, modifierIds: ["m2", "m1"] },
      { productId: "product-a", quantity: 2, modifierIds: [] },
    ],
    serviceMode: "dine_in",
    language: "EN",
    notes: undefined,
  });
  const second = buildCashierCreatePayload({
    items: [
      { productId: "product-a", quantity: 2, modifierIds: [], notes: null },
      { productId: "product-b", quantity: 1, modifierIds: ["m1", "m2"] },
    ],
    serviceMode: "dine_in",
    language: "en",
    notes: null,
  });

  assert.deepEqual(first, second);
  assert.equal(cashierCreateSignature(first), cashierCreateSignature(second));
});

function createSignature(quantity: number) {
  return cashierCreateSignature(buildCashierCreatePayload({
    items: [{ productId: "product-a", quantity, modifierIds: ["m2", "m1"] }],
    serviceMode: "dine_in",
    language: "en",
    notes: null,
  }));
}

function paymentSignature(amountReceived: string) {
  return cashierPaymentSignature({
    orderId: "order-1",
    method: "cash",
    amountReceived,
    captured: true,
    currency: "eur",
  });
}

function ids(...values: string[]) {
  let index = 0;
  return () => {
    const value = values[index++];
    if (value === undefined) throw new Error("Test ID factory exhausted.");
    return value;
  };
}
