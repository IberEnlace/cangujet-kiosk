import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, X } from "lucide-react";
import { DotLottieReact, setWasmUrl, type DotLottie } from "@lottiefiles/dotlottie-react";
import { useCart } from "../../context/CartContext";
import { useLanguage } from "../../context/LanguageContext";
import { LANGUAGE_CONFIG } from "../../config/languages";
import { getCustomerTranslation } from "../../i18n/customerTranslations";
import { MockPaymentTerminalService } from "../../services/payment/MockPaymentTerminalService";
import type { CardPaymentStatus } from "../../types/payment";
import MorrowLogo from "../../components/branding/MorrowLogo";
import { useBranch } from "../../context/BootstrapContext";
import { useCurrentOrder, useOrderSubmission } from "../../context/OrderContext";

setWasmUrl("/animations/dotlottie-player.wasm");

type Props = { onBack: () => void; onApproved: () => void };

export default function CardTerminalPayment({ onBack, onApproved }: Props) {
  const {
    total, setPaymentMethod, placeOrder, transitionOrderLifecycle,
    currentOrderId, currentOrderNumber,
  } = useCart();
  const { language, direction } = useLanguage();
  const branch = useBranch();
  const production = useCurrentOrder();
  const submission = useOrderSubmission();
  const authoritativeTotal = Number(production.order?.total ?? production.quote?.total ?? total);
  const copy = getCustomerTranslation(language).cardTerminal;
  const currency = useMemo(() => new Intl.NumberFormat(LANGUAGE_CONFIG[language].locale, {
    style: "currency",
    currency: branch?.currency ?? "USD",
  }), [branch?.currency, language]);
  const terminal = useMemo(() => new MockPaymentTerminalService(), []);
  const [status, setStatus] = useState<CardPaymentStatus>("waiting");
  const [animation, setAnimation] = useState<DotLottie | null>(null);
  const finalizedRef = useRef(false);
  const navigationTimerRef = useRef<number>();

  const statusLabels = useMemo<Record<CardPaymentStatus, string>>(() => ({
    waiting: copy.waiting, reading: copy.reading, processing: copy.processing,
    approved: copy.approved, declined: copy.declined, timeout: copy.timeout,
    terminal_unavailable: copy.unavailable, cancelled: copy.cancelled,
  }), [copy.approved, copy.cancelled, copy.declined, copy.processing, copy.reading, copy.timeout, copy.unavailable, copy.waiting]);

  const startTerminalPayment = useCallback(() => {
    setStatus("waiting");
    setPaymentMethod("credit");
    transitionOrderLifecycle({
      paymentStatus: "pending",
      paymentMethod: "card",
      orderId: currentOrderId || undefined,
      orderNumber: currentOrderNumber || undefined,
      source: "card_terminal",
      updatedAt: new Date().toISOString(),
    });
    void terminal.startPayment({
      orderId: currentOrderId || `pending-${Date.now()}`,
      amount: authoritativeTotal,
      currency: branch?.currency ?? "USD",
      timeoutMs: 75_000,
      onStatusChange: nextStatus => {
        setStatus(nextStatus);
        if (nextStatus === "processing") {
          transitionOrderLifecycle({
            paymentStatus: "processing",
            paymentMethod: "card",
            orderId: currentOrderId || undefined,
            orderNumber: currentOrderNumber || undefined,
            source: "card_terminal",
            updatedAt: new Date().toISOString(),
          });
        } else if (nextStatus === "declined" || nextStatus === "timeout" || nextStatus === "terminal_unavailable") {
          transitionOrderLifecycle({
            paymentStatus: "failed",
            paymentMethod: "card",
            orderId: currentOrderId || undefined,
            orderNumber: currentOrderNumber || undefined,
            paymentErrorCode: nextStatus,
            paymentErrorMessage: statusLabels[nextStatus],
            source: "card_terminal",
            updatedAt: new Date().toISOString(),
          });
        } else if (nextStatus === "cancelled") {
          transitionOrderLifecycle({
            paymentStatus: "cancelled",
            paymentMethod: "card",
            orderId: currentOrderId || undefined,
            orderNumber: currentOrderNumber || undefined,
            source: "card_terminal",
            updatedAt: new Date().toISOString(),
          });
        }
      },
    }).then(async result => {
      if (result.status !== "approved" || finalizedRef.current) return;
      finalizedRef.current = true;
      try {
        const paid = await submission.capturePayment("card_terminal", result.transactionId);
        if (paid.status !== "paid" && paid.status !== "submitted") {
          throw new Error(`Payment did not persist paid status. Current status: ${paid.status}`);
        }
        const submitted = await submission.submitOrder();
        if (submitted.status !== "submitted") {
          throw new Error(`Submit did not persist submitted status. Current status: ${submitted.status}`);
        }
        const completedAt = new Date().toISOString();
        transitionOrderLifecycle({
          paymentStatus: "completed",
          paymentMethod: "card",
          orderStatus: "submitted",
          orderId: submitted.id,
          orderNumber: submitted.orderNumber,
          completedAt,
          source: "card_terminal",
          updatedAt: completedAt,
        });
        placeOrder({ id: submitted.id, number: submitted.orderNumber, total: Number(paid.total) });
        navigationTimerRef.current = window.setTimeout(onApproved, 1_800);
      } catch (error) {
        finalizedRef.current = false;
        // OrderContext reconciles the authoritative order before rotating a
        // payment key. Keep the correlated order here so a retry cannot create
        // a second order or lose evidence of a committed terminal payment.
        setStatus("terminal_unavailable");
      }
    });
  }, [
    currentOrderId, currentOrderNumber, onApproved, placeOrder, setPaymentMethod,
    authoritativeTotal, branch?.currency, statusLabels, submission, terminal, transitionOrderLifecycle,
  ]);

  useEffect(() => {
    startTerminalPayment();
    return () => {
      window.clearTimeout(navigationTimerRef.current);
      void terminal.cancelPayment();
    };
    // The terminal session must start exactly once per mounted payment screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal]);

  const cancel = async () => {
    await terminal.cancelPayment();
    setStatus("cancelled");
    transitionOrderLifecycle({
      paymentStatus: "cancelled",
      paymentMethod: "card",
      orderId: currentOrderId || undefined,
      orderNumber: currentOrderNumber || undefined,
      source: "card_terminal",
      updatedAt: new Date().toISOString(),
    });
    onBack();
  };

  const isActive = status === "waiting" || status === "reading" || status === "processing";
  const canRetry = status === "declined" || status === "timeout" || status === "terminal_unavailable";
  const statusIcon = status === "approved" ? <Check size={36} /> : canRetry ? <X size={32} /> : <span className="size-4 animate-pulse rounded-full bg-[#C41E19]" />;

  useEffect(() => {
    if (!animation) return;
    if (status === "approved") animation.stop();
    else if (isActive) animation.play();
  }, [animation, isActive, status]);

  return (
    <main dir={direction} className="min-h-[100dvh] bg-[#F8F9FA] text-[#1F1F1F]">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[900px] flex-col px-5 py-6 sm:px-10 sm:py-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3"><MorrowLogo variant="symbol" priority className="size-12 object-contain" /><p className="text-xs text-[#6B7280]">Secure terminal payment</p></div>
          <p className="text-xl font-bold text-[#C41E19] sm:text-2xl">{currency.format(authoritativeTotal)}</p>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <div className="grid size-[min(330px,78vw)] place-items-center overflow-visible" aria-hidden="true">
            <DotLottieReact
              src="/animations/bancard-pos.lottie"
              autoplay
              loop={status !== "approved"}
              dotLottieRefCallback={setAnimation}
              className="size-full"
              style={{ width: "100%", height: "100%", objectFit: "contain", background: "transparent" }}
            />
          </div>
          <h1 className="mt-7 max-w-2xl text-4xl font-bold leading-[1.05] tracking-[-.045em] text-[#1F1F1F] sm:text-6xl">{copy.instruction}</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#6B7280] sm:text-xl">{copy.helper}</p>

          <div role="status" aria-live="polite" className={`mt-7 flex min-h-20 w-full max-w-2xl items-center justify-center gap-4 rounded-2xl border bg-[#FFFFFF] px-5 shadow-[0_8px_24px_rgba(31,31,31,.06)] ${status === "approved" ? "border-[#C41E19]/30 text-[#C41E19]" : canRetry ? "border-[#C41E19]/30 text-[#C41E19]" : "border-[#ECECEC] text-[#1F1F1F]"}`}>
            {statusIcon}<div className="text-start"><p className="text-lg font-bold">{statusLabels[status]}</p>{status === "approved" && <p className="text-sm opacity-70">{copy.paid}: {currency.format(authoritativeTotal)}</p>}{status === "declined" && <p className="max-w-md text-xs opacity-70">{copy.declinedHelp}</p>}{status === "timeout" && <p className="max-w-md text-xs opacity-70">{copy.timeoutHelp}</p>}</div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          {canRetry && <button type="button" onClick={startTerminalPayment} className="min-h-16 rounded-2xl bg-[#C41E19] px-6 text-lg font-bold text-[#FFFFFF] shadow-[0_8px_20px_rgba(196,30,25,.18)] transition hover:-translate-y-0.5 hover:bg-[#A8161A] active:scale-[.98]">{copy.tryAgain}</button>}
          <button type="button" onClick={cancel} disabled={status === "approved"} className={`min-h-16 rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] px-6 text-lg font-bold text-[#1F1F1F] transition hover:-translate-y-0.5 hover:bg-[#F8F9FA] active:scale-[.98] disabled:opacity-30 ${canRetry ? "" : "sm:col-span-2"}`}><ArrowLeft className="me-2 inline" size={20} />{isActive ? copy.cancel : copy.backToPaymentMethods}</button>
        </div>

        {import.meta.env.DEV && isActive && <div className="mt-4 flex justify-center gap-2 opacity-60"><button type="button" onClick={() => terminal.simulate("approved")} className="rounded-xl border border-[#ECECEC] bg-[#FFFFFF] px-3 py-2 text-xs text-[#6B7280] transition hover:-translate-y-0.5 hover:bg-[#F8F9FA] hover:text-[#1F1F1F] active:scale-[.98]">Approve</button><button type="button" onClick={() => terminal.simulate("declined")} className="rounded-xl border border-[#ECECEC] bg-[#FFFFFF] px-3 py-2 text-xs text-[#6B7280] transition hover:-translate-y-0.5 hover:bg-[#F8F9FA] hover:text-[#1F1F1F] active:scale-[.98]">Decline</button><button type="button" onClick={() => terminal.simulate("terminal_unavailable")} className="rounded-xl border border-[#ECECEC] bg-[#FFFFFF] px-3 py-2 text-xs text-[#6B7280] transition hover:-translate-y-0.5 hover:bg-[#F8F9FA] hover:text-[#1F1F1F] active:scale-[.98]">Unavailable</button></div>}
      </div>
    </main>
  );
}
