import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { useCart } from "../context/CartContext";

type Props = { onNavigate: (route: string) => void };

type DisplayOrder = {
  number: number;
  status: "preparing" | "ready" | "completed";
  eta: number;
};

function AnimatedNumber({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDisplayed(value), 200);
    return () => clearTimeout(t);
  }, [value]);
  return <span className="tabular-nums">{displayed}</span>;
}

export default function OrderDisplay({ onNavigate: _onNavigate }: Props) {
  const { kitchenOrders } = useCart();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [flash, setFlash] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Generate display orders from kitchen
  const displayOrders: DisplayOrder[] = [
    ...kitchenOrders.filter(o => o.status === "ready").map(o => ({
      number: o.number,
      status: "ready" as const,
      eta: 0,
    })),
    ...kitchenOrders.filter(o => o.status === "preparing" || o.status === "cooking").map(o => ({
      number: o.number,
      status: "preparing" as const,
      eta: o.estimatedMinutes,
    })),
    // Pad with demo numbers if empty
    ...(kitchenOrders.length === 0 ? [
      { number: 41, status: "completed" as const, eta: 0 },
      { number: 42, status: "ready" as const, eta: 0 },
      { number: 43, status: "ready" as const, eta: 0 },
      { number: 44, status: "preparing" as const, eta: 8 },
      { number: 45, status: "preparing" as const, eta: 12 },
      { number: 46, status: "preparing" as const, eta: 15 },
    ] : []),
    ...kitchenOrders.filter(o => o.status === "completed").map(o => ({
      number: o.number,
      status: "completed" as const,
      eta: 0,
    })),
  ];

  const readyOrders = displayOrders.filter(o => o.status === "ready");
  const preparingOrders = displayOrders.filter(o => o.status === "preparing");
  const completedOrders = displayOrders.filter(o => o.status === "completed").slice(0, 8);

  // Flash effect for new ready orders
  useEffect(() => {
    if (readyOrders.length > 0) {
      const interval = setInterval(() => {
        setFlash(readyOrders[Math.floor(Math.random() * readyOrders.length)]?.number);
        setTimeout(() => setFlash(null), 800);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [readyOrders.length]);

  return (
    <div className="min-h-screen bg-[#05070a] text-[#f0f0eb] font-['DM_Sans'] flex flex-col select-none">

      {/* Header Brand Bar */}
      <div className="bg-[#0a0d0f] border-b border-white/5 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-[#d7ff7a]/20 border border-[#d7ff7a]/30 flex items-center justify-center text-[#d7ff7a] text-lg font-black">M</div>
          <div>
            <h1 className="font-black text-xl tracking-tight text-white">MORROW</h1>
            <p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">Order Status Display</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-white/40">
          <Clock size={16} />
          <span className="font-mono text-lg tracking-wider">{currentTime.toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Main Display */}
      <div className="flex-1 flex gap-0">

        {/* READY - Left Column (largest) */}
        <div className="flex-[2] border-r border-white/5 flex flex-col">
          <div className="bg-[#d7ff7a]/10 border-b border-[#d7ff7a]/20 px-8 py-4 flex items-center gap-3">
            <div className="size-3 rounded-full bg-[#d7ff7a] animate-pulse" />
            <h2 className="font-black text-xl text-[#d7ff7a] uppercase tracking-[0.15em]">Ready for Pickup</h2>
            <span className="ml-auto text-[#d7ff7a]/60 font-bold text-sm">{readyOrders.length} orders</span>
          </div>

          <div className="flex-1 p-6 grid grid-cols-3 content-start gap-4 overflow-hidden">
            {readyOrders.length === 0 && (
              <div className="col-span-3 flex flex-col items-center justify-center py-16 text-center">
                <div className="size-16 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
                  <Clock size={28} className="text-white/15" />
                </div>
                <p className="text-white/20 text-lg">Orders are being prepared</p>
                <p className="text-white/10 text-sm mt-1">Ready orders will appear here</p>
              </div>
            )}
            {readyOrders.map(order => (
              <div
                key={order.number}
                className={`relative flex items-center justify-center rounded-3xl border-2 aspect-square transition-all duration-300 ${
                  flash === order.number
                    ? "bg-[#d7ff7a] border-[#d7ff7a] scale-105"
                    : "bg-[#d7ff7a]/10 border-[#d7ff7a]/40"
                }`}
              >
                <div className="text-center">
                  <p className={`text-7xl font-black leading-none ${flash === order.number ? "text-[#17200f]" : "text-[#d7ff7a]"}`}>
                    <AnimatedNumber value={order.number} />
                  </p>
                  <p className={`text-xs font-bold mt-2 uppercase tracking-wider ${flash === order.number ? "text-[#17200f]/60" : "text-[#d7ff7a]/60"}`}>
                    Collect Now
                  </p>
                </div>
                {flash === order.number && (
                  <div className="absolute -top-1 -right-1 size-4 rounded-full bg-[#d7ff7a] animate-ping" />
                )}
              </div>
            ))}

            {/* Demo ready orders if empty */}
            {readyOrders.length === 0 && displayOrders.filter(o => o.status === "ready").length > 0 &&
              displayOrders.filter(o => o.status === "ready").map(order => (
                <div key={order.number} className="flex items-center justify-center rounded-3xl border-2 bg-[#d7ff7a]/10 border-[#d7ff7a]/40 aspect-square">
                  <p className="text-6xl font-black text-[#d7ff7a]">
                    <AnimatedNumber value={order.number} />
                  </p>
                </div>
              ))
            }
          </div>
        </div>

        {/* PREPARING - Middle + Completed - Right */}
        <div className="flex-[1] flex flex-col border-r border-white/5">
          {/* Preparing section */}
          <div className="flex-1 border-b border-white/5 flex flex-col">
            <div className="bg-orange-500/10 border-b border-orange-500/20 px-6 py-4 flex items-center gap-2">
              <div className="size-3 rounded-full bg-orange-400 animate-pulse" />
              <h2 className="font-bold text-base text-orange-400 uppercase tracking-widest">Preparing</h2>
              <span className="ml-auto text-orange-400/50 text-sm">{preparingOrders.length}</span>
            </div>
            <div className="flex-1 p-4 flex flex-col gap-2 overflow-hidden">
              {preparingOrders.map(order => (
                <div key={order.number} className="flex items-center justify-between px-4 py-3 rounded-2xl bg-orange-500/5 border border-orange-500/15 hover:border-orange-500/30 transition-all">
                  <span className="text-3xl font-black text-orange-300"><AnimatedNumber value={order.number} /></span>
                  <div className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <Clock size={10} className="text-orange-400/60" />
                      <span className="text-sm font-bold text-orange-400">~{order.eta}m</span>
                    </div>
                    <p className="text-[9px] text-orange-400/40 uppercase tracking-wider">est. time</p>
                  </div>
                </div>
              ))}
              {preparingOrders.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-white/15 text-sm">No orders preparing</p>
                </div>
              )}
            </div>
          </div>

          {/* Completed section */}
          <div className="flex flex-col" style={{ height: "35%" }}>
            <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-6 py-3 flex items-center gap-2">
              <div className="size-2.5 rounded-full bg-emerald-400" />
              <h2 className="font-bold text-sm text-emerald-400 uppercase tracking-widest">Completed</h2>
            </div>
            <div className="flex-1 p-4 flex flex-wrap gap-2 content-start overflow-hidden">
              {completedOrders.map(order => (
                <div key={order.number} className="flex items-center justify-center rounded-xl bg-emerald-500/5 border border-emerald-500/15 px-4 py-2">
                  <span className="text-xl font-bold text-emerald-400/60"><AnimatedNumber value={order.number} /></span>
                </div>
              ))}
              {completedOrders.length === 0 && <p className="text-white/15 text-sm w-full text-center pt-4">—</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Footer ticker */}
      <div className="bg-[#0a0d0f] border-t border-white/5 px-8 py-3 flex items-center justify-between overflow-hidden">
        <div className="overflow-hidden flex-1">
          <p className="text-white/30 text-sm animate-[marquee_20s_linear_infinite] whitespace-nowrap">
            🍔 Welcome to Morrow Restaurant — Please collect your order at counter when your number is called — Thank you for dining with us — &nbsp;&nbsp;&nbsp;
            🍔 Welcome to Morrow Restaurant — Please collect your order at counter when your number is called — Thank you for dining with us
          </p>
        </div>
        <div className="ml-8 flex items-center gap-2 text-xs text-white/20 flex-shrink-0">
          <div className="size-2 rounded-full bg-[#d7ff7a] animate-pulse" />
          Live
        </div>
      </div>
    </div>
  );
}
