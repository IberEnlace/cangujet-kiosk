import { useState, useEffect } from "react";
import {
  CheckCircle2, Clock, ChefHat, Flame, Package, Check,
  QrCode, ArrowLeft, Bell, Star, Share2, Phone, RefreshCw
} from "lucide-react";
import { useCart, type OrderStatus } from "../context/CartContext";

type Props = { onNavigate: (route: string) => void };

const STAGES = [
  { id: "received",  label: "Order Received",  icon: <CheckCircle2 size={22} />, color: "#60a5fa", desc: "We got your order!"           },
  { id: "preparing", label: "Preparing",       icon: <Package size={22} />,      color: "#a78bfa", desc: "Gathering ingredients"         },
  { id: "cooking",   label: "Cooking",         icon: <Flame size={22} />,        color: "#fb923c", desc: "Your food is being cooked"     },
  { id: "ready",     label: "Ready!",          icon: <ChefHat size={22} />,      color: "#d7ff7a", desc: "Please collect your order"     },
  { id: "completed", label: "Completed",       icon: <Check size={22} />,        color: "#34d399", desc: "Enjoy your meal!"             },
];

export default function OrderTracking({ onNavigate }: Props) {
  const { orderStatus, setOrderStatus, queueNumber, currentOrderId, estimatedMinutes, items, total } = useCart();
  const [elapsed, setElapsed] = useState(0);
  const [showQR, setShowQR] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [showNotif, setShowNotif] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const currentStageIndex = STAGES.findIndex(s => s.id === orderStatus);
  const isCompleted = orderStatus === "completed";
  const isReady = orderStatus === "ready";

  // Auto-advance demo
  useEffect(() => {
    if (orderStatus === "idle" || isCompleted) return;
    const stageIds = ["received", "preparing", "cooking", "ready", "completed"];
    const currentIdx = stageIds.indexOf(orderStatus);
    if (currentIdx < stageIds.length - 1) {
      const t = setTimeout(() => {
        setOrderStatus(stageIds[currentIdx + 1] as OrderStatus);
        if (stageIds[currentIdx + 1] === "ready") setShowNotif(true);
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [orderStatus, setOrderStatus, isCompleted]);

  // Elapsed timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(prev => prev + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = Math.max(0, estimatedMinutes * 60 - elapsed);
  const remainingMin = Math.floor(remaining / 60);
  const remainingSec = remaining % 60;
  const progress = Math.min(100, (elapsed / (estimatedMinutes * 60)) * 100);
  const submitRating = () => {
    localStorage.setItem(`morrow_rating_${currentOrderId || queueNumber}`, String(rating));
    setRatingSubmitted(true);
  };
  const shareOrder = async () => {
    const text = `Morrow order #${queueNumber || currentOrderId}: ${orderStatus}.`;
    if (navigator.share) await navigator.share({ title: "Morrow Order", text }).catch(() => undefined);
    else { await navigator.clipboard.writeText(text).catch(() => undefined); setActionMessage("Order details copied to clipboard."); }
  };

  return (
    <div className="min-h-[100dvh] bg-[#080b08] text-[#f0f0eb] font-['DM_Sans'] flex flex-col">
      {/* Notification Toast */}
      {showNotif && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#d7ff7a] text-[#17200f] px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-3 shadow-2xl animate-bounce">
          <Bell size={16} /> 🎉 Your order is ready! Please collect at the counter.
          <button onClick={() => setShowNotif(false)} className="ml-2 text-[#17200f]/60 hover:text-[#17200f]">✕</button>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#080b08]/90 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <button onClick={() => onNavigate("portal")} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors group">
          <span className="size-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-[#d7ff7a]/30 transition-all"><ArrowLeft size={16} /></span>
        </button>
        <div className="text-center">
          <h1 className="font-bold text-lg">Order Tracking</h1>
          <p className="text-xs text-white/40">{currentOrderId || "ORD-DEMO123"}</p>
        </div>
        <button onClick={() => setShowQR(!showQR)} className="size-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:border-[#d7ff7a]/30 transition-all">
          <QrCode size={16} className="text-white/60" />
        </button>
      </header>

      <div className="flex-1 max-w-4xl mx-auto w-full px-6 py-8 flex flex-col gap-8">

        {/* Queue Number Hero */}
        <div className="relative rounded-3xl bg-gradient-to-br from-[#1a2010] via-[#141a0f] to-[#0d1109] border border-[#d7ff7a]/15 p-8 flex flex-col items-center gap-4 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 bg-[#d7ff7a]/5 rounded-full blur-3xl" />
          <p className="text-xs text-white/40 uppercase tracking-[0.2em] font-semibold">Queue Number</p>
          <div className="relative">
            <span className="text-[120px] font-black leading-none text-[#d7ff7a] tabular-nums drop-shadow-2xl">
              {queueNumber || 47}
            </span>
            {(isReady) && (
              <div className="absolute -top-2 -right-2 size-8 rounded-full bg-[#d7ff7a] flex items-center justify-center animate-ping" />
            )}
          </div>

          {/* Status Badge */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold ${
            isCompleted ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400" :
            isReady ? "border-[#d7ff7a]/30 bg-[#d7ff7a]/10 text-[#d7ff7a] animate-pulse" :
            "border-orange-400/30 bg-orange-400/10 text-orange-400"
          }`}>
            {STAGES[Math.max(0, currentStageIndex)]?.icon}
            {STAGES[Math.max(0, currentStageIndex)]?.label || "Processing..."}
          </div>

          {/* Timer */}
          {!isCompleted && !isReady && (
            <div className="flex items-center gap-2 text-white/50">
              <Clock size={14} />
              <span className="text-sm">
                {remaining > 0 ? `~${remainingMin}m ${remainingSec.toString().padStart(2, "0")}s remaining` : "Almost ready!"}
              </span>
            </div>
          )}
          {isReady && <p className="text-[#d7ff7a] font-semibold text-sm animate-bounce">🎉 Your order is ready for pickup!</p>}
          {isCompleted && <p className="text-emerald-400 font-semibold text-sm">✓ Order completed — Enjoy your meal!</p>}
        </div>

        {/* Progress Bar */}
        {!isCompleted && (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs text-white/40">
              <span>Preparing</span>
              <span>{Math.round(progress)}%</span>
              <span>Ready</span>
            </div>
            <div className="h-2 rounded-full bg-white/5 border border-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#d7ff7a] to-[#a9cc50] rounded-full transition-all duration-1000"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="flex flex-col gap-0">
          {STAGES.map((stage, i) => {
            const done = currentStageIndex > i;
            const active = currentStageIndex === i;
            return (
              <div key={stage.id} className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  <div className={`size-11 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                    done ? "bg-[#d7ff7a] text-[#17200f]" :
                    active ? "bg-white/10 border-2 border-[#d7ff7a] text-[#d7ff7a]" :
                    "bg-white/[0.03] border border-white/8 text-white/20"
                  } ${active ? "shadow-lg shadow-[#d7ff7a]/20" : ""}`}>
                    {done ? <Check size={18} /> : stage.icon}
                  </div>
                  {i < STAGES.length - 1 && (
                    <div className={`w-0.5 h-10 my-1 transition-all duration-500 ${done ? "bg-[#d7ff7a]/40" : "bg-white/8"}`} />
                  )}
                </div>
                <div className="flex-1 pt-2 pb-6">
                  <div className="flex items-center gap-2">
                    <p className={`font-semibold text-sm ${done ? "text-white" : active ? "text-[#d7ff7a]" : "text-white/25"}`}>
                      {stage.label}
                    </p>
                    {active && <span className="text-[10px] bg-[#d7ff7a]/20 text-[#d7ff7a] px-2 py-0.5 rounded-full font-mono animate-pulse">LIVE</span>}
                    {done && <span className="text-[10px] text-white/30">✓ Done</span>}
                  </div>
                  <p className={`text-xs mt-0.5 ${done || active ? "text-white/40" : "text-white/15"}`}>{stage.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* QR Tracking */}
        {showQR && (
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-6 flex flex-col items-center gap-4">
            <p className="text-sm text-white/60 font-semibold">Scan to track on your phone</p>
            <div className="p-4 bg-white rounded-2xl">
              <QrCode size={100} className="text-black" />
            </div>
            <p className="text-xs text-white/30 font-mono">{currentOrderId || "ORD-DEMO123"}</p>
          </div>
        )}

        {/* Order Items Summary */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-5">
          <h3 className="text-sm font-semibold text-white/60 mb-3 flex items-center gap-2">
            <Package size={14} /> Your Order
          </h3>
          <div className="flex flex-col gap-2">
            {(items.length > 0 ? items : [
              { id: "demo1", name: "Spicy Nori Burger", qty: 2, price: 8.90, image: "https://images.unsplash.com/photo-1606149059549-6042addafc5a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=400" },
              { id: "demo2", name: "Rosemary Fries", qty: 1, price: 3.50, image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=400" },
            ]).map(item => (
              <div key={item.id} className="flex items-center gap-3">
                <img src={item.image} alt={item.name} className="size-10 rounded-xl object-cover" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-white/40">x{item.qty}</p>
                </div>
                <p className="text-sm text-[#d7ff7a] font-bold">${(item.price * item.qty).toFixed(2)}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-white/8 mt-3 pt-3 flex justify-between">
            <span className="text-sm text-white/50">Total</span>
            <span className="font-bold text-[#d7ff7a]">${(total || 25.80).toFixed(2)}</span>
          </div>
        </div>

        {/* Rating (show when completed) */}
        {isCompleted && !showRating && (
          <button
            onClick={() => setShowRating(true)}
            className="w-full py-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-semibold flex items-center justify-center gap-2 hover:bg-amber-500/20 transition-all"
          >
            <Star size={16} /> Rate your experience
          </button>
        )}
        {showRating && (
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-6 flex flex-col items-center gap-4">
            <h3 className="font-bold">How was your meal?</h3>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(s => (
                <button
                  key={s}
                  onMouseEnter={() => setRatingHover(s)}
                  onMouseLeave={() => setRatingHover(0)}
                  onClick={() => setRating(s)}
                  className="transition-transform hover:scale-125"
                >
                  <Star size={36} className={`transition-colors ${s <= (ratingHover || rating) ? "text-amber-400 fill-amber-400" : "text-white/20"}`} />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <button onClick={submitRating} disabled={ratingSubmitted} className="px-8 py-2.5 rounded-xl bg-[#d7ff7a] text-[#17200f] font-bold text-sm hover:bg-[#c8f060] transition-all disabled:opacity-60">
                {ratingSubmitted ? "Rating Submitted" : "Submit Rating"}
              </button>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <a href="tel:+15550006776" className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white/60 hover:text-white hover:border-white/20 transition-all flex items-center justify-center gap-2">
            <Phone size={14} /> Call Support
          </a>
          <button onClick={shareOrder} className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white/60 hover:text-white hover:border-white/20 transition-all flex items-center justify-center gap-2">
            <Share2 size={14} /> Share Order
          </button>
          <button onClick={() => onNavigate("main")} className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white/60 hover:text-white hover:border-white/20 transition-all flex items-center justify-center gap-2">
            <RefreshCw size={14} /> Reorder
          </button>
        </div>
        {actionMessage && <p className="text-center text-xs text-[#d7ff7a]">{actionMessage}</p>}
      </div>
    </div>
  );
}
