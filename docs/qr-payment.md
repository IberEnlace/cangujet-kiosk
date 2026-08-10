# cangujet QR payment provider contract

## Local mock provider

Local development uses the same persisted payment sessions, order transitions,
Realtime signal, and polling recovery as a real provider:

```env
QR_PAYMENT_PROVIDER=mock
QR_PAYMENT_MOCK_BASE_URL=http://localhost:5173
QR_PAYMENT_SESSION_TTL_SECONDS=600
```

Mock mode generates the QR image locally and never makes an external HTTP
request. Its payload opens `#/mock-qr-payment/:sessionId`, where development
success, failure, and cancellation can be simulated. The mock endpoints return
404 for every other provider mode, and the server refuses to start mock mode
when `NODE_ENV=production`.

Apply `2026080300025_add_qr_payment_method.sql` before
`202608030003_qr_payment_workflow.sql`. The first migration commits the `qr`
enum value before the second migration creates QR indexes and functions.

## External provider extension

To connect a real provider later, set `QR_PAYMENT_PROVIDER=external` and
configure the server-only provider variables below. Provider secrets must never
use a `VITE_` prefix.

## Create session

cangujet sends an authenticated `POST` to `QR_PAYMENT_PROVIDER_CREATE_URL` with
an `Idempotency-Key` header and this body:

```json
{
  "amount": "13.50",
  "currency": "EUR",
  "reference": "M110",
  "expiresAt": "2026-08-03T12:10:00.000Z",
  "webhookUrl": "https://api.example.com/webhooks/payment",
  "metadata": { "orderId": "..." }
}
```

The provider must return `providerSessionId`, `paymentReference`, `qrPayload`,
`qrCode`, and `expiresAt`. `qrCode` may be an HTTPS image URL, a PNG/SVG data
URL, or raw SVG. Raw SVG is converted to an image data URL before it reaches
the browser.

Session creation at the provider must honor `Idempotency-Key`. Cancellation is
an authenticated `POST` to
`{QR_PAYMENT_PROVIDER_CREATE_URL}/{paymentReference}/cancel`.

## Signed webhook

The provider sends `POST /webhooks/payment` with `X-Payment-Signature`:

```text
t=unix_timestamp,v1=hex_hmac_sha256(timestamp + "." + raw_request_body)
```

The default replay window is 300 seconds. Supported event types are
`payment.pending`, `payment.processing`, `payment.paid`, `payment.expired`,
`payment.cancelled`, and `payment.failed`.

```json
{
  "eventId": "evt_unique",
  "type": "payment.paid",
  "createdAt": "2026-08-03T12:02:00.000Z",
  "data": {
    "providerSessionId": "provider_session",
    "paymentReference": "provider_reference",
    "providerTransactionId": "transaction_id",
    "amount": "13.50",
    "currency": "EUR"
  }
}
```

The database verifies amount, currency, expiry, terminal state, and processed
event IDs. A valid paid event captures and submits the order atomically. The
kiosk cannot mark a payment paid, and an expired QR cannot be captured.

Realtime publishes only a data-free session refresh signal. The kiosk then
loads the authoritative session through its authenticated REST endpoint. If
Realtime is unavailable, it polls every two seconds.
