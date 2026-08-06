import { useMemo, useRef, useState } from "react";
import {
  CreditCard, QrCode, Users, ArrowLeft, ChevronRight,
  Shield, Lock, Receipt, RefreshCw
} from "lucide-react";
import { useCart, type PaymentMethod } from "../context/CartContext";
import MorrowLogo from "../components/branding/MorrowLogo";
import { useBranch, useKiosk } from "../context/BootstrapContext";
import { useCurrentOrder, useOrderSubmission } from "../context/OrderContext";
import { savePayAtCashierConfirmation } from "../services/orders/payAtCashierConfirmation";
import { orderService } from "../services/orders/OrderService";
import { prepareQrPaymentAttempt, saveQrPaymentSession } from "../services/orders/qrPaymentSession";

type CustomerPaymentMethod = Extract<PaymentMethod, "credit" | "cashier" | "qr">;
type PaymentColor = "blue" | "yellow" | "violet";

type PaymentMethodDef = {
  id: CustomerPaymentMethod;
  label: string;
  icon: React.ReactNode;
  desc: string;
  color: PaymentColor;
};

const METHODS: PaymentMethodDef[] = [
  { id: "credit",  label: "Card Payment",   icon: <CreditCard size={28} />, desc: "Credit or debit card",        color: "blue" },
  { id: "cashier", label: "Pay at Cashier", icon: <Users size={28} />,      desc: "Cash or staff-assisted payment", color: "yellow" },
  { id: "qr",      label: "QR Payment",     icon: <QrCode size={28} />,     desc: "Scan to pay with your phone", color: "violet" },
];

const colorMap: Record<PaymentColor, string> = {
  blue:    "border-[#ECECEC] bg-white hover:border-[#C41E19]/30 hover:bg-white",
  violet:  "border-[#ECECEC] bg-white hover:border-[#C41E19]/30 hover:bg-white",
  yellow:  "border-[#ECECEC] bg-white hover:border-[#C41E19]/30 hover:bg-white",
};

const iconColorMap: Record<PaymentColor, string> = {
  blue: "text-[#C41E19]", violet: "text-[#C41E19]",
  yellow: "text-[#C41E19]",
};

type Props = {
  onNavigate: (route: string) => void;
  onPayAtCashierConfirmed: () => void;
  onQrPaymentStarted: () => void;
};

export default function PaymentFlow({ onNavigate, onPayAtCashierConfirmed, onQrPaymentStarted }: Props) {
  const {
    total, items, orderType, setPaymentMethod, placeOrder,
    transitionOrderLifecycle,
  } = useCart();
  const branch = useBranch();
  const kiosk = useKiosk();
  const production = useCurrentOrder();
  const submission = useOrderSubmission();
  const methodMap: Record<CustomerPaymentMethod, "card" | "pay_at_cashier" | "qr"> = { credit: "card", cashier: "pay_at_cashier", qr: "qr" };
  const availableMethods = METHODS.filter(method => kiosk?.payments.enabledMethods.includes(methodMap[method.id]));
  const currency = useMemo(() => new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: branch?.currency ?? "USD",
  }), [branch?.currency]);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [conflictMethod, setConflictMethod] = useState<CustomerPaymentMethod | null>(null);
  /** Ref-backed guard mirrors the inFlightRef inside OrderContext for the outer submitting UI state. */
  const submittingRef = useRef(false);

  const handleMethodSelect = async (id: CustomerPaymentMethod) => {
    if (submittingRef.current || production.isBusy || !orderType) return;
    submittingRef.current = true;
    setSubmitting(true);
    setOrderError("");
    setConflictMethod(null);
    const lifecycleMethod = id === "credit" ? "card" : id === "cashier" ? "pay_at_cashier" : "qr";
    transitionOrderLifecycle({
      paymentStatus: "pending",
      paymentMethod: lifecycleMethod,
      orderStatus: "awaiting_payment",
      source: "checkout",
      updatedAt: new Date().toISOString(),
    });

    try {
      let created = await submission.createOrder();
      if (id === "cashier") {
        const deferredOrder = await submission.capturePayment("pay_at_cashier");
        if (deferredOrder.status !== "awaiting_payment"
          || deferredOrder.paymentStatus !== "pending"
          || deferredOrder.paymentMethod !== "pay_at_cashier") {
          throw new Error("Deferred cashier order was not persisted correctly.");
        }
        setPaymentMethod("cashier");
        transitionOrderLifecycle({
          paymentStatus: "pending",
          paymentMethod: "pay_at_cashier",
          orderStatus: "awaiting_payment",
          orderId: deferredOrder.id,
          orderNumber: deferredOrder.orderNumber,
          source: "order_service",
          updatedAt: new Date().toISOString(),
        });
        savePayAtCashierConfirmation(deferredOrder);
        placeOrder({ id: deferredOrder.id, number: deferredOrder.orderNumber, total: Number(deferredOrder.total) }, "awaiting_payment");
        // Use the dedicated route callback before resetting the ordinary order
        // workflow. The callback commits the hash and React route together, so
        // this transition cannot fall through the generic customer route map.
        onPayAtCashierConfirmed();
        submission.clearOrderSession();
        return;
      }
      setPaymentMethod(id);
      transitionOrderLifecycle({
        paymentStatus: "pending",
        paymentMethod: lifecycleMethod,
        orderStatus: created.status === "submitted" ? "submitted" : "awaiting_payment",
        orderId: created.id,
        orderNumber: created.orderNumber,
        source: "order_service",
        updatedAt: new Date().toISOString(),
      });

      if (id === "credit") {
        onNavigate("paymentCard");
        return;
      }

      if (id === "qr") {
        const attempt = prepareQrPaymentAttempt(created.id);
        const session = attempt.session ?? await orderService.createQrPayment(created.id, {
          idempotencyKey: attempt.createKey,
        });
        saveQrPaymentSession(session, attempt.createKey);
        onQrPaymentStarted();
        return;
      }

      placeOrder({ id: created.id, number: created.orderNumber, total: Number(created.total) });
      onNavigate("confirmation");
    } catch (error) {
      const isConflict = error instanceof Error && (error as any).code === "idempotency_conflict";
      const message = error instanceof Error ? error.message : "Your order could not be created.";
      setOrderError(message);
      if (isConflict) setConflictMethod(id);
      transitionOrderLifecycle({
        paymentStatus: "failed",
        paymentMethod: lifecycleMethod,
        paymentErrorMessage: message,
        source: "order_service",
        updatedAt: new Date().toISOString(),
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // ─── Screens ──────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#F8F9FA] text-[#1F1F1F]">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[#ECECEC] bg-white/95 px-6 py-4 shadow-sm backdrop-blur-xl">
        <button onClick={() => onNavigate("cart")} className="group flex items-center gap-2 text-[#6B7280] transition-colors hover:text-[#1F1F1F]">
          <span className="flex size-9 items-center justify-center rounded-xl border border-[#ECECEC] bg-white shadow-sm transition-all group-hover:border-[#C41E19]/25 group-hover:bg-[#F8F9FA]"><ArrowLeft size={16} /></span>
          <span className="text-sm">Back to Cart</span>
        </button>
        <div className="flex items-center gap-2">
          <MorrowLogo variant="symbol" className="size-8 object-contain" alt="" />
          <Lock size={16} className="text-[#C41E19]" />
          <h1 className="font-bold text-lg">Secure Payment</h1>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[#6B7280]">
          <Shield size={14} /> SSL Encrypted
        </div>
      </header>

      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6 lg:flex-row lg:gap-8">
        {/* Payment Methods Grid */}
        <div className="flex-1">
          <div className="mb-6">
            <h2 className="text-xl font-bold">Choose Payment Method</h2>
            <p className="mt-1 text-sm text-[#6B7280]">All transactions are secured and encrypted</p>
          </div>

          <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
            {availableMethods.map(m => (
              <button
                key={m.id}
                onClick={() => void handleMethodSelect(m.id)}
                disabled={submitting || production.isBusy}
                className={`group relative flex min-h-32 items-center gap-4 rounded-2xl border p-5 text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-md active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C41E19]/10 min-[520px]:last:col-span-2 min-[520px]:last:w-[calc(50%-0.375rem)] min-[520px]:last:justify-self-center ${colorMap[m.color]}`}
              >
                <span className={`flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#C41E19]/8 ${iconColorMap[m.color]} transition-transform group-hover:scale-105`}>
                  {m.icon}
                </span>
                <div>
                  <p className="font-semibold">{m.label}</p>
                  <p className="mt-1 text-sm text-[#6B7280]">{m.desc}</p>
                </div>
                <ChevronRight size={14} className="ml-auto text-[#9CA3AF] transition-colors group-hover:text-[#C41E19]" />
              </button>
            ))}
          </div>
          {orderError && !conflictMethod && (
            <div role="alert" className="mt-4 rounded-xl border border-[#C41E19]/25 bg-white p-3 text-sm text-[#C41E19]">
              {orderError}
              <button type="button" onClick={() => setOrderError("")} className="ms-3 underline">Dismiss</button>
            </div>
          )}
          {conflictMethod && (
            <div role="alert" className="mt-4 rounded-xl border border-[#C41E19]/25 bg-white p-4 text-sm text-[#C41E19] shadow-sm">
              <p className="font-semibold mb-1">A previous attempt conflicted</p>
              <p className="mb-3 text-xs text-[#6B7280]">{orderError}</p>
              <button
                type="button"
                onClick={() => {
                  submission.clearOrderSession();
                  setConflictMethod(null);
                  setOrderError("");
                  void handleMethodSelect(conflictMethod);
                }}
                className="flex items-center gap-2 rounded-xl bg-[#C41E19] px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#A8161A]"
              >
                <RefreshCw size={12} /> Try again with new attempt
              </button>
            </div>
          )}
          {submitting && <p role="status" className="mt-4 text-sm font-medium text-[#C41E19]">Creating your order securely…</p>}
        </div>

        {/* Order Summary Sidebar */}
        <div className="w-full lg:w-[320px] flex-shrink-0">
          <div className="sticky top-24 rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-sm transition hover:shadow-md">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-[#1F1F1F]"><Receipt size={14} /> Order Summary</h3>
            <div className="flex flex-col gap-2.5 text-sm">
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-2.5">
                  <img src={item.image} alt={item.name} className="size-9 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{item.name}</p>
                    <p className="text-[10px] text-[#6B7280]">x{item.qty}</p>
                  </div>
                  <p className="text-xs font-bold">{currency.format(item.price * item.qty)}</p>
                </div>
              ))}
              <div className="mt-1 border-t border-[#ECECEC] pt-3">
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span className="text-lg text-[#C41E19]">{currency.format(Number(production.quote?.total ?? total))}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-[#9CA3AF]">
              <Shield size={12} /> <span>Secured by 256-bit SSL encryption</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
