import { useMemo, useRef, useState } from "react";
import {
  CreditCard, QrCode, Users, Check, ArrowLeft, ChevronRight, Loader2,
  Shield, Lock, Receipt, RefreshCw
} from "lucide-react";
import { useCart, type PaymentMethod } from "../context/CartContext";
import MorrowLogo from "../components/branding/MorrowLogo";
import { useBranch, useKiosk } from "../context/BootstrapContext";
import { useCurrentOrder, useOrderSubmission } from "../context/OrderContext";

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
  blue:    "border-blue-500/30 bg-blue-500/5 hover:border-blue-500/60 hover:bg-blue-500/10",
  violet:  "border-violet-500/30 bg-violet-500/5 hover:border-violet-500/60 hover:bg-violet-500/10",
  yellow:  "border-yellow-500/30 bg-yellow-500/5 hover:border-yellow-500/60 hover:bg-yellow-500/10",
};

const iconColorMap: Record<PaymentColor, string> = {
  blue: "text-blue-400", violet: "text-violet-400",
  yellow: "text-yellow-400",
};

type Screen = "select" | "qr" | "processing";

type Props = { onNavigate: (route: string) => void };

export default function PaymentFlow({ onNavigate }: Props) {
  const {
    total, items, orderType, setPaymentMethod, placeOrder,
    transitionOrderLifecycle, currentOrderId, currentOrderNumber,
  } = useCart();
  const branch = useBranch();
  const kiosk = useKiosk();
  const production = useCurrentOrder();
  const submission = useOrderSubmission();
  const methodMap: Record<CustomerPaymentMethod, "card" | "pay_at_cashier" | "qr"> = { credit: "card", cashier: "pay_at_cashier", qr: "qr" };
  const availableMethods = METHODS.filter(method => method.id !== "qr" && kiosk?.payments.enabledMethods.includes(methodMap[method.id]));
  const currency = useMemo(() => new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: branch?.currency ?? "USD",
  }), [branch?.currency]);
  const [screen, setScreen] = useState<Screen>("select");
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [conflictMethod, setConflictMethod] = useState<CustomerPaymentMethod | null>(null);
  /** Ref-backed guard mirrors the inFlightRef inside OrderContext for the outer submitting UI state. */
  const submittingRef = useRef(false);

  // Processing
  const [processingStep, setProcessingStep] = useState(0);

  const processingSteps = ["Connecting to payment gateway...", "Verifying card details...", "Authorizing payment...", "Confirming order..."];

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
      let finalOrder = created;
      if (id === "cashier") {
        await submission.capturePayment("pay_at_cashier");
        finalOrder = await submission.submitOrder();
        if (finalOrder.status !== "submitted") {
          throw new Error("Order submission could not be verified.");
        }
      }
      setPaymentMethod(id);
      transitionOrderLifecycle({
        paymentStatus: id === "cashier" ? "completed" : "pending",
        paymentMethod: lifecycleMethod,
        orderStatus: finalOrder.status === "submitted" ? "submitted" : "awaiting_payment",
        orderId: finalOrder.id,
        orderNumber: finalOrder.orderNumber,
        source: "order_service",
        updatedAt: new Date().toISOString(),
      });

      if (id === "credit") {
        onNavigate("paymentCard");
        return;
      }

      if (id === "qr") {
        setScreen("qr");
        return;
      }

      placeOrder({ id: finalOrder.id, number: finalOrder.orderNumber, total: Number(finalOrder.total) });
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

  const startProcessing = () => {
    transitionOrderLifecycle({
      paymentStatus: "processing",
      paymentMethod: "qr",
      orderId: currentOrderId || undefined,
      orderNumber: currentOrderNumber || undefined,
      source: "qr_payment",
      updatedAt: new Date().toISOString(),
    });
    setScreen("processing");
    setProcessingStep(0);
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setProcessingStep(step);
      if (step >= processingSteps.length) {
        clearInterval(interval);
        setTimeout(() => {
          transitionOrderLifecycle({
            paymentStatus: "completed",
            paymentMethod: "qr",
            orderId: currentOrderId || undefined,
            orderNumber: currentOrderNumber || undefined,
            orderStatus: "paid",
            completedAt: new Date().toISOString(),
            source: "qr_payment",
            updatedAt: new Date().toISOString(),
          });
          placeOrder(); onNavigate("confirmation");
        }, 600);
      }
    }, 700);
  };

  // ─── Screens ──────────────────────────────────────────────────────────────

  if (screen === "select") return (
    <div className="min-h-[100dvh] bg-[#080b08] text-[#f0f0eb] font-['DM_Sans'] flex flex-col">
      <header className="sticky top-0 z-40 bg-[#080b08]/90 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <button onClick={() => onNavigate("cart")} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors group">
          <span className="size-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-[#d7ff7a]/30 transition-all"><ArrowLeft size={16} /></span>
          <span className="text-sm">Back to Cart</span>
        </button>
        <div className="flex items-center gap-2">
          <MorrowLogo variant="symbol" className="size-8 object-contain" alt="" />
          <Lock size={16} className="text-[#d7ff7a]" />
          <h1 className="font-bold text-lg">Secure Payment</h1>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-white/40">
          <Shield size={14} /> SSL Encrypted
        </div>
      </header>

      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6 lg:flex-row lg:gap-8">
        {/* Payment Methods Grid */}
        <div className="flex-1">
          <div className="mb-6">
            <h2 className="text-xl font-bold">Choose Payment Method</h2>
            <p className="text-white/40 text-sm mt-1">All transactions are secured and encrypted</p>
          </div>

          <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
            {availableMethods.map(m => (
              <button
                key={m.id}
                onClick={() => void handleMethodSelect(m.id)}
                disabled={submitting || production.isBusy}
                className={`relative flex min-h-32 items-center gap-4 rounded-2xl border p-5 text-left transition-all group active:scale-[0.98] focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#d7ff7a] min-[520px]:last:col-span-2 min-[520px]:last:w-[calc(50%-0.375rem)] min-[520px]:last:justify-self-center ${colorMap[m.color]}`}
              >
                <span className={`size-14 shrink-0 rounded-2xl bg-white/5 flex items-center justify-center ${iconColorMap[m.color]} group-hover:scale-110 transition-transform`}>
                  {m.icon}
                </span>
                <div>
                  <p className="font-semibold">{m.label}</p>
                  <p className="mt-1 text-sm text-white/40">{m.desc}</p>
                </div>
                <ChevronRight size={14} className="ml-auto text-white/20 group-hover:text-white/60 transition-colors" />
              </button>
            ))}
          </div>
          {orderError && !conflictMethod && (
            <div role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
              {orderError}
              <button type="button" onClick={() => setOrderError("")} className="ms-3 underline">Dismiss</button>
            </div>
          )}
          {conflictMethod && (
            <div role="alert" className="mt-4 rounded-xl border border-yellow-400/20 bg-yellow-500/10 p-4 text-sm text-yellow-200">
              <p className="font-semibold mb-1">A previous attempt conflicted</p>
              <p className="text-yellow-200/70 text-xs mb-3">{orderError}</p>
              <button
                type="button"
                onClick={() => {
                  submission.clearOrderSession();
                  setConflictMethod(null);
                  setOrderError("");
                  void handleMethodSelect(conflictMethod);
                }}
                className="flex items-center gap-2 rounded-lg bg-yellow-400/20 px-3 py-2 text-xs font-semibold hover:bg-yellow-400/30 transition-colors"
              >
                <RefreshCw size={12} /> Try again with new attempt
              </button>
            </div>
          )}
          {submitting && <p role="status" className="mt-4 text-sm text-[#d7ff7a]">Creating your order securely…</p>}
        </div>

        {/* Order Summary Sidebar */}
        <div className="w-full lg:w-[320px] flex-shrink-0">
          <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-5 sticky top-24">
            <h3 className="font-bold text-sm mb-4 text-white/70 flex items-center gap-2"><Receipt size={14} /> Order Summary</h3>
            <div className="flex flex-col gap-2.5 text-sm">
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-2.5">
                  <img src={item.image} alt={item.name} className="size-9 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{item.name}</p>
                    <p className="text-[10px] text-white/40">x{item.qty}</p>
                  </div>
                  <p className="text-xs font-bold">{currency.format(item.price * item.qty)}</p>
                </div>
              ))}
              <div className="border-t border-white/10 pt-3 mt-1">
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span className="text-[#d7ff7a] text-lg">{currency.format(Number(production.quote?.total ?? total))}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-white/30">
              <Shield size={12} /> <span>Secured by 256-bit SSL encryption</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (screen === "qr") return (
    <div className="min-h-[100dvh] bg-[#080b08] text-[#f0f0eb] font-['DM_Sans'] flex flex-col items-center justify-center gap-8">
      <button onClick={() => {
        transitionOrderLifecycle({
          paymentStatus: "cancelled",
          paymentMethod: "qr",
          orderId: currentOrderId || undefined,
          orderNumber: currentOrderNumber || undefined,
          source: "qr_payment",
          updatedAt: new Date().toISOString(),
        });
        setScreen("select");
      }} className="absolute top-6 left-6 size-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:border-[#d7ff7a]/30 transition-all"><ArrowLeft size={16} /></button>
      <div className="text-center">
        <h2 className="text-2xl font-bold">Scan to Pay</h2>
        <p className="text-white/40 mt-2">QR payment provider is not connected</p>
      </div>
      <div className="p-6 bg-white rounded-3xl shadow-2xl shadow-black/50">
        <div className="size-48 bg-[#0a0a0a] rounded-2xl flex items-center justify-center relative overflow-hidden">
          <QrCode size={120} className="text-white" />
          <div className="absolute inset-0 bg-gradient-to-br from-[#d7ff7a]/10 via-transparent to-[#d7ff7a]/5" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-3xl font-bold text-[#d7ff7a]">{currency.format(total)}</p>
        <p className="text-white/40 text-sm mt-2">Order #{currentOrderNumber}</p>
      </div>
      <button disabled={!import.meta.env.DEV} onClick={startProcessing} className="px-10 py-4 rounded-2xl bg-[#d7ff7a] text-[#17200f] font-bold flex items-center gap-3 hover:bg-[#c8f060] transition-all disabled:cursor-not-allowed disabled:opacity-40">
        <Check size={18} /> {import.meta.env.DEV ? "Simulate completed payment" : "Unavailable"}
      </button>
    </div>
  );

  if (screen === "processing") return (
    <div className="min-h-[100dvh] bg-[#080b08] text-[#f0f0eb] font-['DM_Sans'] flex flex-col items-center justify-center gap-8">
      <div className="relative">
        <div className="size-28 rounded-full border-4 border-white/10 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-t-[#d7ff7a] animate-spin" />
          <Lock size={28} className="text-white/40" />
        </div>
      </div>
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Processing Payment</h2>
        <p className="text-white/40 text-sm">Please do not close this page</p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-sm">
        {processingSteps.map((step, i) => (
          <div key={i} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${processingStep > i ? "bg-[#d7ff7a]/10 border border-[#d7ff7a]/20" : processingStep === i ? "bg-white/5 border border-white/10" : "opacity-30"}`}>
            <div className={`size-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${processingStep > i ? "bg-[#d7ff7a]" : processingStep === i ? "bg-white/20" : "bg-white/5"}`}>
              {processingStep > i ? <Check size={12} className="text-[#17200f]" /> : processingStep === i ? <Loader2 size={12} className="animate-spin" /> : <span className="text-[10px] text-white/40">{i + 1}</span>}
            </div>
            <span className="text-sm">{step}</span>
          </div>
        ))}
      </div>
      <p className="text-3xl font-bold text-[#d7ff7a]">{currency.format(total)}</p>
    </div>
  );

  return null;
}
