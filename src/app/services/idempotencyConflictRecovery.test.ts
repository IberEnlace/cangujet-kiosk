import assert from "node:assert/strict";
import test from "node:test";
import { OrderClientError } from "./orders/OrderService";
import { executeWithIdempotencyRecovery } from "./orders/idempotencyConflictRecovery";

const conflict = (requestId: string) => new OrderClientError(
  "idempotency_conflict",
  "The key conflicts with an earlier request.",
  409,
  requestId,
);

test("an ordinary request is executed once with its stable idempotency key", async () => {
  const keys: string[] = [];
  const result = await executeWithIdempotencyRecovery({
    initialKey: "stable-key",
    execute: async key => { keys.push(key); return "created"; },
    repeatedConflictMessage: "Repeated conflict.",
  });

  assert.deepEqual(keys, ["stable-key"]);
  assert.equal(result.value, "created");
  assert.equal(result.disposition, "initial");
});

test("a stale key is rotated once and the request succeeds without surfacing 409", async () => {
  const keys: string[] = [];
  let persistedKey = "stable-key";
  const result = await executeWithIdempotencyRecovery({
    initialKey: persistedKey,
    execute: async key => {
      keys.push(key);
      if (key === "stable-key") throw conflict("request-first");
      return "created";
    },
    createKey: () => "fresh-key",
    onKeyRotated: key => { persistedKey = key; },
    repeatedConflictMessage: "Repeated conflict.",
  });

  assert.deepEqual(keys, ["stable-key", "fresh-key"]);
  assert.equal(persistedKey, "fresh-key");
  assert.equal(result.disposition, "rotated");
});

test("a committed payment is reconciled before any retry that could duplicate a charge", async () => {
  let calls = 0;
  const result = await executeWithIdempotencyRecovery({
    initialKey: "payment-key",
    execute: async () => { calls += 1; throw conflict("payment-request"); },
    reconcile: async () => "already-paid",
    repeatedConflictMessage: "Repeated payment conflict.",
  });

  assert.equal(calls, 1);
  assert.equal(result.value, "already-paid");
  assert.equal(result.disposition, "reconciled");
});

test("a second conflict is bounded and returns a clear recoverable error", async () => {
  await assert.rejects(
    executeWithIdempotencyRecovery({
      initialKey: "old-key",
      execute: async key => { throw conflict(key); },
      createKey: () => "fresh-key",
      repeatedConflictMessage: "Refresh the order before trying again.",
    }),
    (error: unknown) => error instanceof OrderClientError
      && error.code === "idempotency_conflict"
      && error.status === 409
      && error.message === "Refresh the order before trying again."
      && error.details?.recoveryAttempted === true,
  );
});
