import type { QrPaymentSession } from "../../../shared/orders";

export const QR_PAYMENT_SESSION_KEY = "morrow:qr-payment-session:v1";

export type StoredQrPaymentSession = {
  version: 1;
  orderId: string;
  createKey: string;
  session: QrPaymentSession | null;
};

export function prepareQrPaymentAttempt(orderId: string, forceNew = false, storage: Storage = sessionStorage) {
  const current = readQrPaymentAttempt(storage);
  if (!forceNew && current?.orderId === orderId) return current;
  const next: StoredQrPaymentSession = { version: 1, orderId, createKey: crypto.randomUUID(), session: null };
  write(next, storage);
  return next;
}

export function saveQrPaymentSession(session: QrPaymentSession, createKey: string, storage: Storage = sessionStorage) {
  const value: StoredQrPaymentSession = { version: 1, orderId: session.orderId, createKey, session };
  write(value, storage);
  return value;
}

export function readQrPaymentAttempt(storage: Pick<Storage, "getItem"> = sessionStorage): StoredQrPaymentSession | null {
  try {
    const raw = storage.getItem(QR_PAYMENT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredQrPaymentSession>;
    if (parsed.version !== 1 || typeof parsed.orderId !== "string" || !parsed.orderId
      || typeof parsed.createKey !== "string" || !parsed.createKey) return null;
    if (parsed.session !== null && !isSession(parsed.session)) return null;
    return parsed as StoredQrPaymentSession;
  } catch { return null; }
}

export function clearQrPaymentSession(storage: Pick<Storage, "removeItem"> = sessionStorage) {
  try { storage.removeItem(QR_PAYMENT_SESSION_KEY); } catch { /* disabled storage */ }
}

function write(value: StoredQrPaymentSession, storage: Pick<Storage, "setItem">) {
  storage.setItem(QR_PAYMENT_SESSION_KEY, JSON.stringify(value));
}

function isSession(value: unknown): value is QrPaymentSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<QrPaymentSession>;
  return typeof session.paymentSessionId === "string" && Boolean(session.paymentSessionId)
    && typeof session.paymentReference === "string" && Boolean(session.paymentReference)
    && typeof session.orderId === "string" && Boolean(session.orderId)
    && typeof session.expiresAt === "string" && Number.isFinite(Date.parse(session.expiresAt))
    && ["pending", "processing", "paid", "expired", "cancelled", "failed"].includes(session.status ?? "");
}
