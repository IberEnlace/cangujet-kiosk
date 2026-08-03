import type { QrPaymentSession } from "../../../shared/orders";

export class MockQrPaymentClient {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  get(sessionId: string) {
    return this.request(sessionId, "");
  }

  success(sessionId: string) {
    return this.request(sessionId, "/mock-success", "POST");
  }

  fail(sessionId: string) {
    return this.request(sessionId, "/mock-fail", "POST");
  }

  cancel(sessionId: string) {
    return this.request(sessionId, "/cancel", "POST");
  }

  private async request(sessionId: string, action: string, method = "GET") {
    const response = await this.fetchImpl(`/api/v1/qr-payments/${encodeURIComponent(sessionId)}${action}`, {
      method,
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    const body = await response.json().catch(() => null) as QrPaymentSession | { message?: string } | null;
    if (!response.ok) {
      throw new Error(body && "message" in body && body.message ? body.message : `Mock payment request failed (${response.status}).`);
    }
    if (!body || !("paymentSessionId" in body)) throw new Error("The mock payment service returned an invalid response.");
    return body;
  }
}

export const mockQrPaymentClient = new MockQrPaymentClient();
