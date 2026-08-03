# HTTP 409 conflict recovery

## Incident summary

The checkout flow could return `409 idempotency_conflict` when a key stored in
`sessionStorage` was reused with a different request fingerprint. The most
visible case was a card-terminal retry: a new terminal `externalReference` was
sent with the previous payment idempotency key. A stale create-order key from a
changed cart could produce the same symptom.

The conflict was therefore a request-data conflict, not an HTTP cache problem.
Optimistic order-version conflicts (`order_conflict`) and invalid lifecycle
transitions remain valid 409 responses and continue to trigger a server refresh
instead of an unsafe blind retry.

## Root cause

- Create and payment keys were persisted correctly for transport retries, but
  the client did not distinguish a transport retry from a new logical attempt.
- Payment recovery rotated or cleared state before reconciling the authoritative
  order. If the server had already committed the payment, this could lose the
  correlated order and make the next action ambiguous.
- `capturePayment` could call the public, guarded `createOrder` operation while
  another guarded operation was active.
- The API returned useful conflict metadata, but `OrderClientError` discarded
  the top-level `existingOrderId`.
- The server's preflight lookup did not return the existing order ID or apply the
  same device scope as the database uniqueness constraint.

## Implemented fix

1. The server checks the actor-scoped existing key and fingerprint before the
   RPC. A mismatch returns structured HTTP 409 metadata:
   `existingOrderId`, `conflictReason: fingerprint_mismatch`, `retryable: true`,
   and the request correlation ID.
2. The browser preserves that metadata in `OrderClientError`.
3. A stale create key is replaced and retried exactly once. The replacement is
   persisted before the retry, so later network retries remain idempotent.
4. Payment recovery reads the authoritative order first. If payment is already
   committed, it resumes from that order and never charges again. Otherwise it
   rotates only the payment key and retries exactly once.
5. A repeated conflict stops automatically and displays an actionable message;
   payment failures explicitly instruct staff to verify the order before
   another charge.
6. The raw create operation is separate from the UI in-flight guard, allowing a
   payment operation to create its missing correlated order without a re-entrant
   request race.

## Expected response behavior

- Same key and same payload: return the existing resource (`200`), not `409`.
- Same key and different payload: recover once with a fresh key; if conflict
  repeats, return structured `409 idempotency_conflict`.
- Concurrent identical creates: converge on one order; one response may be the
  idempotent duplicate.
- Stale optimistic version: return `409 order_conflict`; reload the order before
  any new transition.
- Payment already committed but its response was lost: reconcile the order and
  continue without sending another payment capture.

## Verification

Automated coverage includes ordinary success, identical retry, concurrent
identical requests, stale-key rotation, committed-payment reconciliation,
bounded repeated conflict, structured API metadata, and production TypeScript /
Vite build validation.
