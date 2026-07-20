import { useState } from "react";
import {
  CreditCard, Banknote, QrCode, Wallet, SplitSquareHorizontal,
  Gift, Users, Check, X, ArrowLeft, ChevronRight, Loader2,
  Shield, Lock, RefreshCw, Printer, Mail, MessageSquare,
  AlertTriangle, CheckCircle2, Receipt
} from "lucide-react";
import { useCart, type PaymentMethod } from "../context/CartContext";

type PaymentMethodDef = {
  id: string;
  label: string;
  icon: React.ReactNode;
  desc: string;
  color: string;
  badge?: string;
};

const METHODS: PaymentMethodDef[] = [
  { id: "credit",     label: "Credit Card",    icon: <CreditCard size={22} />,          desc: "Visa, Mastercard, Amex",  color: "blue",   badge: "Most Popular" },
  { id: "debit",      label: "Debit Card",     icon: <CreditCard size={22} />,          desc: "All major debit cards",   color: "indigo" },
  { id: "apple-pay",  label: "Apple Pay",      icon: <span className="text-xl">🍎</span>, desc: "Tap with Face ID",       color: "slate",  badge: "Instant" },
  { id: "google-pay", label: "Google Pay",     icon: <span className="text-xl">🟢</span>, desc: "Tap your Android",       color: "green",  badge: "Instant" },
  { id: "qr",         label: "QR Payment",     icon: <QrCode size={22} />,              desc: "Scan with your phone",    color: "violet" },
  { id: "wallet",     label: "Digital Wallet", icon: <Wallet size={22} />,              desc: "PayPal, Venmo, Zelle",    color: "teal" },
  { id: "split",      label: "Split Payment",  icon: <SplitSquareHorizontal size={22} />,desc: "Split between people",   color: "orange" },
  { id: "gift-card",  label: "Gift Card",      icon: <Gift size={22} />,                desc: "Redeem gift card",        color: "purple" },
  { id: "cash",       label: "Cash",           icon: <Banknote size={22} />,            desc: "Pay at cashier",          color: "emerald" },
  { id: "cashier",    label: "Pay at Cashier", icon: <Users size={22} />,               desc: "Staff will assist you",   color: "yellow" },
];

const colorMap: Record<string, string> = {
  blue:    "border-blue-500/30 bg-blue-500/5 hover:border-blue-500/60 hover:bg-blue-500/10",
  indigo:  "border-indigo-500/30 bg-indigo-500/5 hover:border-indigo-500/60 hover:bg-indigo-500/10",
  slate:   "border-slate-400/30 bg-slate-400/5 hover:border-slate-400/60 hover:bg-slate-400/10",
  green:   "border-green-500/30 bg-green-500/5 hover:border-green-500/60 hover:bg-green-500/10",
  violet:  "border-violet-500/30 bg-violet-500/5 hover:border-violet-500/60 hover:bg-violet-500/10",
  teal:    "border-teal-500/30 bg-teal-500/5 hover:border-teal-500/60 hover:bg-teal-500/10",
  orange:  "border-orange-500/30 bg-orange-500/5 hover:border-orange-500/60 hover:bg-orange-500/10",
  purple:  "border-purple-500/30 bg-purple-500/5 hover:border-purple-500/60 hover:bg-purple-500/10",
  emerald: "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/60 hover:bg-emerald-500/10",
  yellow:  "border-yellow-500/30 bg-yellow-500/5 hover:border-yellow-500/60 hover:bg-yellow-500/10",
};

const iconColorMap: Record<string, string> = {
  blue: "text-blue-400", indigo: "text-indigo-400", slate: "text-slate-300",
  green: "text-green-400", violet: "text-violet-400", teal: "text-teal-400",
  orange: "text-orange-400", purple: "text-purple-400", emerald: "text-emerald-400", yellow: "text-yellow-400",
};

type Screen = "select" | "card" | "qr" | "split" | "wallet" | "processing" | "success" | "failed" | "receipt";

type Props = { onNavigate: (route: string) => void };

export default function PaymentFlow({ onNavigate }: Props) {
  const { total, items, setPaymentMethod, placeOrder, currentOrderId, queueNumber } = useCart();
  const [screen, setScreen] = useState<Screen>("select");
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);

  // Card Form
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardFlipped, setCardFlipped] = useState(false);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  // Split Payment
  const [splitPeople, setSplitPeople] = useState(2);
  const [splitPaid, setSplitPaid] = useState<number[]>([]);

  // Processing
  const [processingStep, setProcessingStep] = useState(0);

  // Receipt
  const [receiptMethod, setReceiptMethod] = useState<string | null>(null);

  const processingSteps = ["Connecting to payment gateway...", "Verifying card details...", "Authorizing payment...", "Confirming order..."];

  const formatCardNumber = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  };

  const formatExpiry = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 2) return digits.slice(0, 2) + "/" + digits.slice(2);
    return digits;
  };

  const validateCard = () => {
    const errs: Record<string, string> = {};
    if (cardNumber.replace(/\s/g, "").length < 16) errs.number = "Invalid card number";
    if (!cardName.trim()) errs.name = "Cardholder name is required";
    if (cardExpiry.length < 5) errs.expiry = "Invalid expiry date";
    if (cardCvv.length < 3) errs.cvv = "Invalid CVV";
    setCardErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleMethodSelect = (id: string) => {
    setSelectedMethod(id);
    setPaymentMethod(id as PaymentMethod);
    if (id === "credit" || id === "debit") { setScreen("card"); return; }
    if (id === "qr") { setScreen("qr"); return; }
    if (id === "split") { setScreen("split"); return; }
    if (id === "wallet") { setScreen("wallet"); return; }
    if (id === "cash" || id === "cashier") { startProcessing(false); return; }
    startProcessing(false);
  };

  const startProcessing = (simulateFail?: boolean) => {
    setScreen("processing");
    setProcessingStep(0);
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setProcessingStep(step);
      if (step >= processingSteps.length) {
        clearInterval(interval);
        setTimeout(() => {
          if (simulateFail) { setScreen("failed"); }
          else { placeOrder(); setScreen("success"); }
        }, 600);
      }
    }, 700);
  };

  const getCardType = () => {
    const n = cardNumber.replace(/\s/g, "");
    if (n.startsWith("4")) return "VISA";
    if (n.startsWith("5")) return "MC";
    if (n.startsWith("3")) return "AMEX";
    return "CARD";
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

          <div className="grid grid-cols-2 gap-3">
            {METHODS.map(m => (
              <button
                key={m.id}
                onClick={() => handleMethodSelect(m.id)}
                className={`relative flex items-center gap-3.5 p-4 rounded-2xl border text-left transition-all group ${colorMap[m.color]}`}
              >
                {m.badge && (
                  <span className="absolute top-3 right-3 text-[9px] font-bold bg-[#d7ff7a] text-[#17200f] px-2 py-0.5 rounded-full">
                    {m.badge}
                  </span>
                )}
                <span className={`size-10 rounded-xl bg-white/5 flex items-center justify-center ${iconColorMap[m.color]} group-hover:scale-110 transition-transform`}>
                  {m.icon}
                </span>
                <div>
                  <p className="font-semibold text-sm">{m.label}</p>
                  <p className="text-xs text-white/40">{m.desc}</p>
                </div>
                <ChevronRight size={14} className="ml-auto text-white/20 group-hover:text-white/60 transition-colors" />
              </button>
            ))}
          </div>
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
                  <p className="text-xs font-bold">${(item.price * item.qty).toFixed(2)}</p>
                </div>
              ))}
              <div className="border-t border-white/10 pt-3 mt-1">
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span className="text-[#d7ff7a] text-lg">${total.toFixed(2)}</span>
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

  if (screen === "card") return (
    <div className="min-h-[100dvh] bg-[#080b08] text-[#f0f0eb] font-['DM_Sans'] flex flex-col">
      <header className="sticky top-0 z-40 bg-[#080b08]/90 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center gap-4">
        <button onClick={() => setScreen("select")} className="size-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:border-[#d7ff7a]/30 transition-all"><ArrowLeft size={16} /></button>
        <h1 className="font-bold text-lg">{selectedMethod === "debit" ? "Debit" : "Credit"} Card Payment</h1>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-white/40"><Lock size={14} /> Secure</div>
      </header>

      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6 lg:flex-row lg:gap-8">
        <div className="flex-1 flex flex-col gap-6">
          {/* Card Visual */}
          <div
            className="relative h-48 rounded-3xl overflow-hidden cursor-pointer"
            style={{ perspective: "1000px" }}
            onClick={() => setCardFlipped(!cardFlipped)}
          >
            <div className={`relative w-full h-full transition-all duration-700 ${cardFlipped ? "[transform:rotateY(180deg)]" : ""}`} style={{ transformStyle: "preserve-3d" }}>
              {/* Front */}
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#1a1f2e] via-[#252a3d] to-[#0d1117] border border-white/15 p-6 flex flex-col justify-between" style={{ backfaceVisibility: "hidden" }}>
                <div className="flex items-start justify-between">
                  <div className="size-10 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-600 opacity-90" />
                  <span className="font-mono text-white/60 text-sm font-bold tracking-widest">{getCardType()}</span>
                </div>
                <div>
                  <p className="font-mono text-xl tracking-[0.2em] text-white">
                    {cardNumber || "•••• •••• •••• ••••"}
                  </p>
                  <div className="flex items-end justify-between mt-4">
                    <div>
                      <p className="text-[10px] text-white/40 uppercase tracking-wider">Cardholder</p>
                      <p className="font-medium text-sm mt-0.5">{cardName || "YOUR NAME"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-white/40 uppercase tracking-wider">Expires</p>
                      <p className="font-medium text-sm mt-0.5">{cardExpiry || "MM/YY"}</p>
                    </div>
                  </div>
                </div>
              </div>
              {/* Back */}
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#1a1f2e] via-[#252a3d] to-[#0d1117] border border-white/15 flex flex-col justify-center" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                <div className="h-10 bg-white/10 w-full my-4" />
                <div className="px-6 flex items-center justify-end gap-3">
                  <div className="flex-1 h-8 bg-white/5 rounded" />
                  <div className="bg-white/10 px-4 py-2 rounded font-mono text-sm tracking-wider">
                    {cardCvv || "•••"}
                  </div>
                </div>
                <p className="text-center text-[10px] text-white/30 mt-4">Click to flip back</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-white/30 text-center -mt-2">Click card to view back</p>

          {/* Form */}
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">Card Number</label>
              <input
                value={cardNumber}
                onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                placeholder="1234 5678 9012 3456"
                className={`w-full bg-white/5 border ${cardErrors.number ? "border-red-500/50" : "border-white/10"} rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:border-[#d7ff7a]/40 placeholder:text-white/20 transition-colors`}
              />
              {cardErrors.number && <p className="text-xs text-red-400 mt-1">{cardErrors.number}</p>}
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">Cardholder Name</label>
              <input
                value={cardName}
                onChange={e => setCardName(e.target.value.toUpperCase())}
                placeholder="NAME ON CARD"
                className={`w-full bg-white/5 border ${cardErrors.name ? "border-red-500/50" : "border-white/10"} rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#d7ff7a]/40 placeholder:text-white/20 uppercase transition-colors`}
              />
              {cardErrors.name && <p className="text-xs text-red-400 mt-1">{cardErrors.name}</p>}
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-white/50 mb-1.5 block">Expiry Date</label>
                <input
                  value={cardExpiry}
                  onChange={e => setCardExpiry(formatExpiry(e.target.value))}
                  onFocus={() => setCardFlipped(false)}
                  placeholder="MM/YY"
                  className={`w-full bg-white/5 border ${cardErrors.expiry ? "border-red-500/50" : "border-white/10"} rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:border-[#d7ff7a]/40 placeholder:text-white/20 transition-colors`}
                />
                {cardErrors.expiry && <p className="text-xs text-red-400 mt-1">{cardErrors.expiry}</p>}
              </div>
              <div className="flex-1">
                <label className="text-xs text-white/50 mb-1.5 block">CVV</label>
                <input
                  value={cardCvv}
                  onChange={e => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  onFocus={() => setCardFlipped(true)}
                  onBlur={() => setCardFlipped(false)}
                  placeholder="•••"
                  type="password"
                  className={`w-full bg-white/5 border ${cardErrors.cvv ? "border-red-500/50" : "border-white/10"} rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:border-[#d7ff7a]/40 placeholder:text-white/20 transition-colors`}
                />
                {cardErrors.cvv && <p className="text-xs text-red-400 mt-1">{cardErrors.cvv}</p>}
              </div>
            </div>
          </div>

          <button
            onClick={() => { if (validateCard()) startProcessing(false); }}
            className="w-full py-4 rounded-2xl bg-[#d7ff7a] text-[#17200f] font-bold text-lg flex items-center justify-center gap-3 hover:bg-[#c8f060] transition-all shadow-lg shadow-[#d7ff7a]/20 active:scale-[0.98]"
          >
            <Lock size={18} /> Pay ${total.toFixed(2)}
          </button>

          {/* Simulate fail for demo */}
          <button
            onClick={() => { if (validateCard()) startProcessing(true); }}
            className="w-full py-2.5 rounded-xl text-xs text-red-400/50 hover:text-red-400 transition-colors border border-red-500/10 hover:border-red-500/20"
          >
            [Demo] Simulate Payment Failure
          </button>
        </div>

        <div className="w-full lg:w-[260px] flex-shrink-0 flex flex-col gap-4">
          <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-4">
            <p className="text-xs text-white/40 mb-3 font-semibold uppercase tracking-wider">Amount Due</p>
            <p className="text-3xl font-bold text-[#d7ff7a]">${total.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-4 flex flex-col gap-2">
            {["256-bit SSL", "PCI DSS Compliant", "Fraud Protection", "3D Secure"].map(feat => (
              <div key={feat} className="flex items-center gap-2 text-xs text-white/50">
                <CheckCircle2 size={12} className="text-[#d7ff7a]" /> {feat}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  if (screen === "qr") return (
    <div className="min-h-[100dvh] bg-[#080b08] text-[#f0f0eb] font-['DM_Sans'] flex flex-col items-center justify-center gap-8">
      <button onClick={() => setScreen("select")} className="absolute top-6 left-6 size-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:border-[#d7ff7a]/30 transition-all"><ArrowLeft size={16} /></button>
      <div className="text-center">
        <h2 className="text-2xl font-bold">Scan to Pay</h2>
        <p className="text-white/40 mt-2">Open your banking app and scan the QR code</p>
      </div>
      <div className="p-6 bg-white rounded-3xl shadow-2xl shadow-black/50">
        <div className="size-48 bg-[#0a0a0a] rounded-2xl flex items-center justify-center relative overflow-hidden">
          <QrCode size={120} className="text-white" />
          <div className="absolute inset-0 bg-gradient-to-br from-[#d7ff7a]/10 via-transparent to-[#d7ff7a]/5" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-3xl font-bold text-[#d7ff7a]">${total.toFixed(2)}</p>
        <p className="text-white/40 text-sm mt-2">Order #{Math.floor(Math.random() * 9000 + 1000)}</p>
      </div>
      <button onClick={() => startProcessing(false)} className="px-10 py-4 rounded-2xl bg-[#d7ff7a] text-[#17200f] font-bold flex items-center gap-3 hover:bg-[#c8f060] transition-all">
        <Check size={18} /> I've Completed Payment
      </button>
    </div>
  );

  if (screen === "split") return (
    <div className="min-h-[100dvh] bg-[#080b08] text-[#f0f0eb] font-['DM_Sans'] flex flex-col">
      <header className="sticky top-0 z-40 bg-[#080b08]/90 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center gap-4">
        <button onClick={() => setScreen("select")} className="size-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:border-[#d7ff7a]/30 transition-all"><ArrowLeft size={16} /></button>
        <h1 className="font-bold text-lg">Split Payment</h1>
      </header>
      <div className="max-w-2xl mx-auto w-full px-6 py-8 flex flex-col gap-6">
        <div className="flex items-center gap-4 bg-white/[0.04] border border-white/8 rounded-2xl p-4">
          <span className="text-sm text-white/60">Split between</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSplitPeople(Math.max(2, splitPeople - 1))} className="size-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"><span>-</span></button>
            <span className="w-8 text-center font-bold text-lg">{splitPeople}</span>
            <button onClick={() => setSplitPeople(Math.min(8, splitPeople + 1))} className="size-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"><span>+</span></button>
          </div>
          <span className="text-sm text-white/60">people</span>
          <span className="ml-auto text-[#d7ff7a] font-bold">${(total / splitPeople).toFixed(2)} each</span>
        </div>

        <div className="flex flex-col gap-3">
          {Array.from({ length: splitPeople }, (_, i) => {
            const paid = splitPaid.includes(i);
            return (
              <div key={i} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${paid ? "border-[#d7ff7a]/30 bg-[#d7ff7a]/5" : "border-white/8 bg-white/[0.02]"}`}>
                <div className={`size-9 rounded-full flex items-center justify-center text-sm font-bold ${paid ? "bg-[#d7ff7a] text-[#17200f]" : "bg-white/10 text-white/60"}`}>
                  {paid ? <Check size={16} /> : `P${i + 1}`}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Person {i + 1}</p>
                  <p className="text-xs text-white/40">${(total / splitPeople).toFixed(2)}</p>
                </div>
                {!paid && (
                  <button onClick={() => setSplitPaid(prev => [...prev, i])} className="px-4 py-2 rounded-xl bg-[#d7ff7a]/10 hover:bg-[#d7ff7a]/20 text-[#d7ff7a] text-xs font-semibold transition-all border border-[#d7ff7a]/20">
                    Pay Now
                  </button>
                )}
                {paid && <span className="text-xs text-[#d7ff7a] font-semibold">Paid ✓</span>}
              </div>
            );
          })}
        </div>

        <div className="flex justify-between text-sm bg-white/[0.04] border border-white/8 rounded-xl p-3">
          <span className="text-white/50">Collected so far</span>
          <span className="font-bold text-[#d7ff7a]">${((total / splitPeople) * splitPaid.length).toFixed(2)} / ${total.toFixed(2)}</span>
        </div>

        {splitPaid.length === splitPeople && (
          <button onClick={() => startProcessing(false)} className="w-full py-4 rounded-2xl bg-[#d7ff7a] text-[#17200f] font-bold text-lg flex items-center justify-center gap-3 hover:bg-[#c8f060] transition-all">
            Confirm Order <ChevronRight size={20} />
          </button>
        )}
      </div>
    </div>
  );

  if (screen === "wallet") return (
    <div className="min-h-[100dvh] bg-[#080b08] text-[#f0f0eb] font-['DM_Sans'] flex flex-col items-center justify-center gap-6 p-6 sm:p-8">
      <button onClick={() => setScreen("select")} className="absolute top-6 left-6 size-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:border-[#d7ff7a]/30 transition-all"><ArrowLeft size={16} /></button>
      <h2 className="text-2xl font-bold">Digital Wallet</h2>
      <div className="grid grid-cols-3 gap-4 w-full max-w-lg">
        {["PayPal", "Venmo", "Zelle", "Cash App", "Samsung Pay", "WeChat Pay"].map(w => (
          <button key={w} onClick={() => startProcessing(false)} className="p-5 rounded-2xl bg-white/[0.04] border border-white/8 hover:border-[#d7ff7a]/30 hover:bg-white/[0.07] transition-all flex flex-col items-center gap-2 group">
            <div className="size-12 rounded-xl bg-white/10 group-hover:bg-[#d7ff7a]/10 flex items-center justify-center transition-colors"><Wallet size={20} className="text-white/60 group-hover:text-[#d7ff7a]" /></div>
            <span className="text-xs font-medium text-white/60 group-hover:text-white transition-colors">{w}</span>
          </button>
        ))}
      </div>
      <p className="text-white/40 text-sm">Total: <span className="text-[#d7ff7a] font-bold">${total.toFixed(2)}</span></p>
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
      <p className="text-3xl font-bold text-[#d7ff7a]">${total.toFixed(2)}</p>
    </div>
  );

  if (screen === "success") return (
    <div className="min-h-[100dvh] bg-[#080b08] text-[#f0f0eb] font-['DM_Sans'] flex flex-col items-center justify-center gap-8">
      <div className="relative">
        <div className="size-32 rounded-full bg-[#d7ff7a]/10 border border-[#d7ff7a]/30 flex items-center justify-center">
          <div className="size-20 rounded-full bg-[#d7ff7a] flex items-center justify-center animate-[bounce_0.5s_ease-in-out]">
            <Check size={36} className="text-[#17200f]" />
          </div>
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="absolute size-2 rounded-full bg-[#d7ff7a]" style={{ top: `${20 + Math.random() * 60}%`, left: `${10 + Math.random() * 80}%`, animation: `ping ${0.5 + Math.random()}s ease-out forwards`, opacity: 0 }} />
        ))}
      </div>
      <div className="text-center">
        <h2 className="text-3xl font-bold text-[#d7ff7a]">Payment Successful!</h2>
        <p className="text-white/50 mt-2">Your order has been confirmed</p>
        <p className="text-white/30 text-sm mt-1">Order ID: {currentOrderId}</p>
      </div>
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 w-full max-w-sm">
        <div className="flex justify-between text-sm mb-3">
          <span className="text-white/50">Amount Charged</span>
          <span className="font-bold text-[#d7ff7a]">${total.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm mb-3">
          <span className="text-white/50">Queue Number</span>
          <span className="font-bold text-2xl text-white">#{queueNumber}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-white/50">Points Earned</span>
          <span className="font-bold text-amber-400">+{Math.floor(total * 10)} pts ⭐</span>
        </div>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-sm">
        <p className="text-sm text-white/40 text-center">How would you like your receipt?</p>
        <div className="flex gap-3">
          {[
            { label: "Print", icon: <Printer size={16} />, id: "print" },
            { label: "Email", icon: <Mail size={16} />, id: "email" },
            { label: "SMS", icon: <MessageSquare size={16} />, id: "sms" },
            { label: "No Receipt", icon: <X size={16} />, id: "none" },
          ].map(opt => (
            <button key={opt.id} onClick={() => { setReceiptMethod(opt.id); setScreen("receipt"); }} className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all text-xs text-white/60 hover:text-white">
              {opt.icon} {opt.label}
            </button>
          ))}
        </div>
        <button onClick={() => onNavigate("tracking")} className="w-full py-3.5 rounded-2xl bg-[#d7ff7a] text-[#17200f] font-bold flex items-center justify-center gap-2 hover:bg-[#c8f060] transition-all">
          Track Your Order <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );

  if (screen === "failed") return (
    <div className="min-h-[100dvh] bg-[#080b08] text-[#f0f0eb] font-['DM_Sans'] flex flex-col items-center justify-center gap-8">
      <div className="size-32 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
        <div className="size-20 rounded-full bg-red-500 flex items-center justify-center">
          <X size={36} className="text-white" />
        </div>
      </div>
      <div className="text-center">
        <h2 className="text-3xl font-bold text-red-400">Payment Failed</h2>
        <p className="text-white/50 mt-2">Something went wrong with your payment</p>
      </div>
      <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 w-full max-w-sm flex items-start gap-3">
        <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-400">Transaction Declined</p>
          <p className="text-xs text-white/40 mt-1">Your card was declined. Please check your card details or try a different payment method.</p>
        </div>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-sm">
        <button onClick={() => setScreen("card")} className="w-full py-3.5 rounded-2xl bg-[#d7ff7a] text-[#17200f] font-bold flex items-center justify-center gap-2 hover:bg-[#c8f060] transition-all">
          <RefreshCw size={16} /> Try Again
        </button>
        <button onClick={() => setScreen("select")} className="w-full py-3.5 rounded-2xl border border-white/10 hover:border-white/20 font-semibold text-white/60 hover:text-white transition-all flex items-center justify-center gap-2">
          <CreditCard size={16} /> Try Different Method
        </button>
        <button onClick={() => onNavigate("cart")} className="w-full py-3 text-sm text-white/30 hover:text-white/60 transition-colors flex items-center justify-center gap-2">
          <ArrowLeft size={14} /> Back to Cart
        </button>
      </div>
    </div>
  );

  if (screen === "receipt") return (
    <div className="min-h-[100dvh] bg-[#080b08] text-[#f0f0eb] font-['DM_Sans'] flex flex-col items-center justify-center gap-6 p-6 sm:p-8">
      <div className="size-16 rounded-2xl bg-[#d7ff7a]/10 border border-[#d7ff7a]/20 flex items-center justify-center">
        <Receipt size={28} className="text-[#d7ff7a]" />
      </div>
      <div className="text-center">
        <h2 className="text-2xl font-bold">
          {receiptMethod === "print" ? "Printing Receipt..." : receiptMethod === "email" ? "Receipt Sent to Email" : receiptMethod === "sms" ? "Receipt Sent via SMS" : "No Receipt"}
        </h2>
        <p className={`text-sm mt-2`}>{receiptMethod === "print" ? "Please wait while we print your receipt." : receiptMethod === "email" ? "Sent to your registered email address." : receiptMethod === "sms" ? "Sent to your registered phone number." : "You chose not to receive a receipt."}
        </p>
      </div>
      <div className="w-full max-w-sm bg-white/[0.04] border border-white/8 rounded-2xl p-5 font-mono text-xs">
        <p className="text-center font-bold text-base mb-3 font-['DM_Sans']">MORROW KIOSK</p>
        <p className="text-white/40 text-center mb-4">Order {currentOrderId}</p>
        <div className="border-t border-dashed border-white/15 pt-3 flex flex-col gap-1.5">
          {items.map(i => <div key={i.id} className="flex justify-between text-white/60"><span>{i.qty}x {i.name}</span><span>${(i.price * i.qty).toFixed(2)}</span></div>)}
        </div>
        <div className="border-t border-dashed border-white/15 mt-3 pt-3">
          <div className="flex justify-between font-bold text-sm font-['DM_Sans']"><span>Total Paid</span><span className="text-[#d7ff7a]">${total.toFixed(2)}</span></div>
        </div>
        <p className="text-center text-white/30 mt-4">Thank you for your order! 🍔</p>
      </div>
      <button onClick={() => onNavigate("tracking")} className="px-8 py-3.5 rounded-2xl bg-[#d7ff7a] text-[#17200f] font-bold flex items-center gap-2 hover:bg-[#c8f060] transition-all">
        Track Order <ChevronRight size={18} />
      </button>
    </div>
  );

  return null;
}
