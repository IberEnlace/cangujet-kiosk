import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Clock3, Loader2, QrCode, RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
import type { QrPaymentSession } from "../../../shared/orders";
import CangujetLogo from "../../components/branding/CangujetLogo";
import { useCart } from "../../context/CartContext";
import { useOrderSubmission } from "../../context/OrderContext";
import { orderService } from "../../services/orders/OrderService";
import {
  clearQrPaymentSession,
  prepareQrPaymentAttempt,
  readQrPaymentAttempt,
  saveQrPaymentSession,
} from "../../services/orders/qrPaymentSession";
import { subscribeToQrPaymentSignal, type RealtimeConnectionStatus } from "../../services/supabase/realtimeOrderService";

const FALLBACK_POLL_MS = 2_000;
const SUCCESS_DELAY_MS = 2_000;

export default function QrPayment({ onComplete, onCancel, onInvalid }: {
  onComplete: () => void;
  onCancel: () => void;
  onInvalid: () => void;
}) {
  const initial = useMemo(() => readQrPaymentAttempt()?.session ?? null, []);
  const [session, setSession] = useState<QrPaymentSession | null>(initial);
  const [connection, setConnection] = useState<RealtimeConnectionStatus>("connecting");
  const [remaining, setRemaining] = useState(() => secondsRemaining(initial?.expiresAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const completionStartedRef = useRef(false);
  const mountedRef = useRef(true);
  const { placeOrder, setPaymentMethod, transitionOrderLifecycle } = useCart();
  const { clearOrderSession } = useOrderSubmission();

  const updateSession = useCallback((next: QrPaymentSession) => {
    if (!mountedRef.current) return;
    const attempt = readQrPaymentAttempt();
    if (attempt) saveQrPaymentSession(next, attempt.createKey);
    setSession(next);
    setRemaining(secondsRemaining(next.expiresAt));
    setError("");
  }, []);

  const refresh = useCallback(async () => {
    const current = readQrPaymentAttempt()?.session;
    if (!current) return;
    try { updateSession(await orderService.getQrPayment(current.orderId, current.paymentSessionId)); }
    catch (caught) {
      if (mountedRef.current) setError(caught instanceof Error ? caught.message : "Payment status is temporarily unavailable.");
    }
  }, [updateSession]);

  useEffect(() => {
    mountedRef.current = true;
    if (!initial) { onInvalid(); return () => { mountedRef.current = false; }; }
    void refresh();
    return () => { mountedRef.current = false; };
  }, [initial, onInvalid, refresh]);

  useEffect(() => {
    if (!session || terminal(session.status)) return;
    const subscription = subscribeToQrPaymentSignal({
      paymentSessionId: session.paymentSessionId,
      onSignal: () => void refresh(),
      onStatus: status => {
        setConnection(status);
        if (status === "connected" || status === "reconnecting") void refresh();
      },
    });
    return () => { void subscription.unsubscribe(); };
  }, [refresh, session?.paymentSessionId, session?.status]);

  useEffect(() => {
    if (!session || terminal(session.status) || connection === "connected") return;
    const timer = window.setInterval(() => void refresh(), FALLBACK_POLL_MS);
    return () => window.clearInterval(timer);
  }, [connection, refresh, session?.paymentSessionId, session?.status]);

  useEffect(() => {
    if (!session || terminal(session.status)) return;
    const timer = window.setInterval(() => {
      const seconds = secondsRemaining(session.expiresAt);
      setRemaining(seconds);
      if (seconds === 0) void refresh();
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [refresh, session?.expiresAt, session?.status]);

  useEffect(() => {
    if (!session || session.status !== "paid" || session.order.status !== "submitted" || completionStartedRef.current) return;
    completionStartedRef.current = true;
    setPaymentMethod("qr");
    transitionOrderLifecycle({
      paymentStatus: "completed", paymentMethod: "qr", orderStatus: "submitted",
      orderId: session.order.id, orderNumber: session.order.orderNumber,
      completedAt: new Date().toISOString(), source: "qr_payment", updatedAt: new Date().toISOString(),
    });
    placeOrder({ id: session.order.id, number: session.order.orderNumber, total: Number(session.order.total) });
    const timer = window.setTimeout(() => {
      clearQrPaymentSession();
      clearOrderSession();
      onComplete();
    }, SUCCESS_DELAY_MS);
    return () => window.clearTimeout(timer);
  // The completion timer is keyed only by the authoritative server state.
  // placeOrder changes cart callbacks while clearing items; including those
  // callbacks here would cancel the two-second continuation timer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.paymentSessionId, session?.status, session?.order.status]);

  const generateNew = async () => {
    if (!session || busy) return;
    setBusy(true); setError("");
    try {
      const attempt = prepareQrPaymentAttempt(session.orderId, true);
      const next = await orderService.createQrPayment(session.orderId, { idempotencyKey: attempt.createKey, replaceExpired: true });
      saveQrPaymentSession(next, attempt.createKey);
      completionStartedRef.current = false;
      setConnection("connecting");
      updateSession(next);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A new QR code could not be created."); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!session || busy) return;
    setBusy(true); setError("");
    try {
      const next = await orderService.cancelQrPayment(session.orderId, session.paymentSessionId);
      if (next.status === "paid") { updateSession(next); return; }
      clearQrPaymentSession();
      transitionOrderLifecycle({ paymentStatus: "cancelled", paymentMethod: "qr", source: "qr_payment", updatedAt: new Date().toISOString() });
      onCancel();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The payment could not be cancelled safely."); }
    finally { setBusy(false); }
  };

  if (!session) return null;
  const success = session.status === "paid";
  const expired = session.status === "expired" || session.status === "failed";
  const processing = session.status === "processing";
  const money = new Intl.NumberFormat(undefined, { style: "currency", currency: session.currency }).format(Number(session.amount));

  return <main className="min-h-[100dvh] bg-[#F8F9FA] px-5 py-6 text-[#1F1F1F]">
    <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-[780px] flex-col">
      <header className="flex items-center justify-between">
        <CangujetLogo variant="full" priority className="h-auto w-36" />
        <span className="flex items-center gap-2 rounded-full border border-[#C41E19]/20 bg-[#FFFFFF] px-4 py-2 text-xs font-bold text-[#C41E19] shadow-[0_3px_10px_rgba(31,31,31,.04)]"><ShieldCheck size={15} />Secure QR Payment</span>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center py-7 text-center" aria-live="polite">
        {success ? <>
          <div className="grid size-28 place-items-center rounded-full bg-[#C41E19] text-[#FFFFFF] shadow-[0_10px_26px_rgba(196,30,25,.18)]"><Check size={58} strokeWidth={3} /></div>
          <h1 className="mt-7 text-5xl font-black tracking-[-.05em]">Payment received</h1>
          <p className="mt-3 text-lg text-[#6B7280]">Your order is confirmed. Continuing automatically…</p>
        </> : <>
          <h1 className="text-[clamp(2.2rem,6vw,4.5rem)] font-black tracking-[-.05em]">{expired ? "QR code expired" : processing ? "Confirming payment" : "Scan to pay"}</h1>
          <p className="mt-3 max-w-xl text-lg text-[#6B7280]">{expired ? "Generate a fresh QR code to continue." : processing ? "Your payment is being securely confirmed." : "Open your bank, wallet, Apple Pay, or Google Pay app and scan the code."}</p>

          {!expired ? <div className="relative mt-7 overflow-hidden rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] p-6 shadow-[0_10px_30px_rgba(31,31,31,.08)]">
            <img src={session.qrCode} alt={`QR code for order ${session.orderNumber}`} className="size-[min(52vw,320px)] object-contain" />
            <div className="pointer-events-none absolute inset-x-5 top-5 h-1 animate-pulse bg-[#C41E19]/60" />
          </div> : <div className="mt-8 grid size-40 place-items-center rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] text-[#9CA3AF] shadow-[0_8px_24px_rgba(31,31,31,.06)]"><QrCode size={88} /></div>}

          <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#9CA3AF]">Total</p><p className="text-3xl font-black text-[#C41E19]">{money}</p></div>
            <div className="h-10 w-px bg-[#ECECEC]" />
            <div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#9CA3AF]">Order</p><p className="text-2xl font-black">{session.orderNumber}</p></div>
            <div className="h-10 w-px bg-[#ECECEC]" />
            <div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#9CA3AF]">Expires in</p><p className="flex items-center gap-2 text-2xl font-black"><Clock3 size={19} />{formatTime(remaining)}</p></div>
          </div>

          <div className="mt-5 flex items-center gap-2 text-sm font-bold text-[#6B7280]">
            {processing ? <Loader2 size={17} className="animate-spin text-[#C41E19]" /> : connection === "connected" ? <span className="size-2 animate-pulse rounded-full bg-[#C41E19]" /> : <WifiOff size={16} />}
            {processing ? "Processing payment…" : expired ? "Payment session ended" : "Waiting for payment…"}
          </div>
        </>}
        {error ? <p role="alert" className="mt-4 rounded-xl border border-[#C41E19]/25 bg-[#C41E19]/5 px-4 py-3 text-sm text-[#C41E19]">{error}</p> : null}
      </section>

      {!success ? <footer className="grid gap-3 border-t border-[#ECECEC] pt-5 sm:grid-cols-2">
        {expired ? <button type="button" disabled={busy} onClick={() => void generateNew()} className="min-h-16 rounded-2xl bg-[#C41E19] px-6 text-lg font-black text-[#FFFFFF] shadow-[0_8px_20px_rgba(196,30,25,.18)] transition hover:-translate-y-0.5 hover:bg-[#A8161A] active:scale-[.98] disabled:opacity-50"><RefreshCw size={19} className={`me-2 inline ${busy ? "animate-spin" : ""}`} />Generate New QR</button> : null}
        <button type="button" disabled={busy} onClick={() => void cancel()} className={`min-h-16 rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] px-6 text-lg font-black text-[#1F1F1F] transition hover:-translate-y-0.5 hover:bg-[#F8F9FA] active:scale-[.98] disabled:opacity-50 ${expired ? "" : "sm:col-span-2"}`}><ArrowLeft size={19} className="me-2 inline" />Cancel Payment</button>
      </footer> : null}
    </div>
  </main>;
}

function terminal(status: QrPaymentSession["status"]) { return status === "paid" || status === "expired" || status === "cancelled" || status === "failed"; }
function secondsRemaining(expiresAt?: string) { return expiresAt ? Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1_000)) : 0; }
function formatTime(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
