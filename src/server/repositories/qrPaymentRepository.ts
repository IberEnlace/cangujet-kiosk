import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type { ProductionOrder, QrPaymentSession, QrPaymentWebhookEvent } from "../../shared/orders";

export type QrPaymentScope = {
  restaurantId: string;
  branchId: string;
  deviceId: string;
};

export type PersistQrSessionInput = QrPaymentScope & {
  orderId: string;
  paymentSessionId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  providerName: string;
  providerSessionId: string;
  paymentReference: string;
  qrPayload: string;
  qrCode: string;
  expiresAt: string;
  replaceExpired: boolean;
};

export interface QrPaymentRepository {
  getOrder(scope: QrPaymentScope, orderId: string): Promise<ProductionOrder | null>;
  findReusable(scope: QrPaymentScope, orderId: string): Promise<QrPaymentSession | null>;
  create(input: PersistQrSessionInput): Promise<QrPaymentSession>;
  get(scope: QrPaymentScope, orderId: string, sessionId: string): Promise<QrPaymentSession | null>;
  cancel(scope: QrPaymentScope, orderId: string, sessionId: string): Promise<QrPaymentSession>;
  applyWebhook(event: QrPaymentWebhookEvent, providerPayload: Record<string, unknown>): Promise<QrPaymentSession | null>;
  getMock(sessionId: string): Promise<QrPaymentSession | null>;
  applyMockOutcome(sessionId: string, outcome: "success" | "failed" | "cancelled"): Promise<QrPaymentSession | null>;
}

export class SupabaseQrPaymentRepository implements QrPaymentRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getOrder(scope: QrPaymentScope, orderId: string) {
    const result = await (this.client as any).rpc("get_production_order", {
      p_order_id: orderId,
      p_restaurant_id: scope.restaurantId,
      p_branch_id: scope.branchId,
    });
    if (result.error) throw new Error(result.error.message || "get_production_order_failed");
    return result.data && typeof result.data === "object" ? result.data as ProductionOrder : null;
  }

  async findReusable(scope: QrPaymentScope, orderId: string) {
    return nullable(await (this.client as any).rpc("find_reusable_qr_payment_session", {
      p_order_id: orderId,
      p_restaurant_id: scope.restaurantId,
      p_branch_id: scope.branchId,
      p_device_id: scope.deviceId,
    }), "find_reusable_qr_payment_session");
  }

  async create(input: PersistQrSessionInput) {
    return required(await (this.client as any).rpc("create_qr_payment_session", {
      p_order_id: input.orderId,
      p_payment_session_id: input.paymentSessionId,
      p_restaurant_id: input.restaurantId,
      p_branch_id: input.branchId,
      p_device_id: input.deviceId,
      p_idempotency_key: input.idempotencyKey,
      p_request_fingerprint: input.requestFingerprint,
      p_provider: input.providerName,
      p_provider_session_id: input.providerSessionId,
      p_payment_reference: input.paymentReference,
      p_qr_payload: input.qrPayload,
      p_qr_code: input.qrCode,
      p_expires_at: input.expiresAt,
      p_replace_expired: input.replaceExpired,
    }), "create_qr_payment_session");
  }

  async get(scope: QrPaymentScope, orderId: string, sessionId: string) {
    return nullable(await (this.client as any).rpc("get_qr_payment_session", {
      p_order_id: orderId,
      p_session_id: sessionId,
      p_restaurant_id: scope.restaurantId,
      p_branch_id: scope.branchId,
      p_device_id: scope.deviceId,
    }), "get_qr_payment_session");
  }

  async cancel(scope: QrPaymentScope, orderId: string, sessionId: string) {
    return required(await (this.client as any).rpc("cancel_qr_payment_session", {
      p_order_id: orderId,
      p_session_id: sessionId,
      p_restaurant_id: scope.restaurantId,
      p_branch_id: scope.branchId,
      p_device_id: scope.deviceId,
    }), "cancel_qr_payment_session");
  }

  async applyWebhook(event: QrPaymentWebhookEvent, providerPayload: Record<string, unknown>) {
    return nullable(await (this.client as any).rpc("apply_qr_payment_webhook", {
      p_event_id: event.eventId,
      p_event_type: event.type,
      p_provider_session_id: event.data.providerSessionId ?? null,
      p_payment_reference: event.data.paymentReference,
      p_provider_transaction_id: event.data.providerTransactionId ?? null,
      p_amount: event.data.amount,
      p_currency: event.data.currency,
      p_failure_code: event.data.failureCode ?? null,
      p_provider_payload: providerPayload,
    }), "apply_qr_payment_webhook");
  }

  async getMock(sessionId: string) {
    return nullable(await (this.client as any).rpc("get_mock_qr_payment_session", {
      p_session_id: sessionId,
    }), "get_mock_qr_payment_session");
  }

  async applyMockOutcome(sessionId: string, outcome: "success" | "failed" | "cancelled") {
    return nullable(await (this.client as any).rpc("apply_mock_qr_payment_outcome", {
      p_session_id: sessionId,
      p_outcome: outcome,
    }), "apply_mock_qr_payment_outcome");
  }
}

export function createQrPaymentRepositoryFromEnvironment() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !secret) throw new Error("Server-side Supabase QR payment configuration is missing.");
  return new SupabaseQrPaymentRepository(createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

function required(result: { data: unknown; error: { message?: string } | null }, operation: string) {
  const value = unwrap(result, operation);
  if (!value) throw new Error(`${operation}_empty`);
  return value;
}

function nullable(result: { data: unknown; error: { message?: string } | null }, operation: string) {
  return unwrap(result, operation);
}

function unwrap(result: { data: unknown; error: { message?: string } | null }, operation: string): QrPaymentSession | null {
  if (result.error) throw new Error(result.error.message || `${operation}_failed`);
  const value = Array.isArray(result.data) && result.data.length === 1 && result.data[0]?.result
    ? result.data[0].result
    : result.data;
  return value && typeof value === "object" ? value as QrPaymentSession : null;
}
