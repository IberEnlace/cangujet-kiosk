import { useState, useEffect } from "react";
import {
  ChefHat, Flame, Check, Clock, AlertTriangle, ArrowRight,
  Search, Filter, Bell, TrendingUp, Package, Star, RefreshCw,
  Timer, Users, Zap
} from "lucide-react";
import { useCart, type KitchenOrder, type OrderStatus } from "../context/CartContext";

type Props = { onNavigate: (route: string) => void };

type Column = { id: OrderStatus; label: string; color: string; icon: React.ReactNode };

const COLUMNS: Column[] = [
  { id: "received",  label: "Incoming",  color: "blue",   icon: <Package size={16} />   },
  { id: "preparing", label: "Preparing", color: "violet", icon: <Clock size={16} />      },
  { id: "cooking",   label: "Cooking",   color: "orange", icon: <Flame size={16} />      },
  { id: "ready",     label: "Ready",     color: "lime",   icon: <ChefHat size={16} />   },
  { id: "completed", label: "Completed", color: "green",  icon: <Check size={16} />     },
];

const colorBg: Record<string, string> = {
  blue:   "bg-blue-500/10 border-blue-500/20 text-blue-400",
  violet: "bg-violet-500/10 border-violet-500/20 text-violet-400",
  orange: "bg-orange-500/10 border-orange-500/20 text-orange-400",
  lime:   "bg-[#d7ff7a]/10 border-[#d7ff7a]/20 text-[#d7ff7a]",
  green:  "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
};

const colBorder: Record<string, string> = {
  blue:   "border-t-blue-500",
  violet: "border-t-violet-500",
  orange: "border-t-orange-500",
  lime:   "border-t-[#d7ff7a]",
  green:  "border-t-emerald-500",
};

function ElapsedTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(Math.floor((Date.now() - startTime) / 1000));
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startTime]);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  const isLate = m >= 12;
  return (
    <span className={`font-mono text-xs ${isLate ? "text-red-400 animate-pulse" : "text-white/40"}`}>
      {m}:{s.toString().padStart(2, "0")}
    </span>
  );
}

function OrderCard({ order, onAdvance }: { order: KitchenOrder; onAdvance: (id: string, status: OrderStatus) => void }) {
  const stageIds: OrderStatus[] = ["received", "preparing", "cooking", "ready", "completed"];
  const currentIdx = stageIds.indexOf(order.status);
  const nextStage = currentIdx < stageIds.length - 1 ? stageIds[currentIdx + 1] : null;
  const elapsed = Math.floor((Date.now() - order.startTime) / 1000 / 60);
  const isOverdue = elapsed > order.estimatedMinutes;

  return (
    <div className={`rounded-2xl border bg-white/[0.03] p-4 flex flex-col gap-3 transition-all ${
      order.priority ? "border-[#d7ff7a]/30 shadow-lg shadow-[#d7ff7a]/5" :
      order.delayed ? "border-red-500/30" :
      "border-white/8"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {order.priority && (
            <span className="bg-[#d7ff7a] text-[#17200f] text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wide flex items-center gap-0.5">
              <Zap size={8} /> Priority
            </span>
          )}
          {order.delayed && (
            <span className="bg-red-500/20 text-red-400 text-[9px] font-bold px-1.5 py-0.5 rounded-md border border-red-500/20 flex items-center gap-0.5">
              <AlertTriangle size={8} /> Delayed
            </span>
          )}
          <span className="font-black text-xl text-white">#{order.number}</span>
        </div>
        <div className="flex items-center gap-1.5 text-right">
          <ElapsedTimer startTime={order.startTime} />
          <span className="text-white/20">·</span>
          <span className={`text-xs ${isOverdue ? "text-red-400" : "text-white/30"}`}>
            {order.type === "eat-here" ? "🍽" : "🛍"}
          </span>
        </div>
      </div>

      {/* Customer */}
      {order.customer && (
        <p className="text-xs text-white/40 flex items-center gap-1">
          <Users size={10} /> {order.customer}
        </p>
      )}

      {/* Items */}
      <div className="flex flex-col gap-1.5">
        {order.items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="size-5 rounded-lg bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/60 flex-shrink-0">{item.qty}</span>
            <span className="text-sm font-medium truncate">{item.name}</span>
            {item.notes && <span className="text-[10px] text-amber-400 truncate">· {item.notes}</span>}
          </div>
        ))}
      </div>

      {/* Timer bar */}
      <div className="flex flex-col gap-1">
        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${isOverdue ? "bg-red-500" : "bg-gradient-to-r from-[#d7ff7a] to-[#a9cc50]"}`}
            style={{ width: `${Math.min(100, (elapsed / order.estimatedMinutes) * 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-white/25">
          <span>Est. {order.estimatedMinutes}m</span>
          {isOverdue && <span className="text-red-400">+{elapsed - order.estimatedMinutes}m late</span>}
        </div>
      </div>

      {/* Advance Button */}
      {nextStage && order.status !== "completed" && (
        <button
          onClick={() => onAdvance(order.id, nextStage)}
          className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            nextStage === "ready"
              ? "bg-[#d7ff7a]/15 hover:bg-[#d7ff7a]/25 text-[#d7ff7a] border border-[#d7ff7a]/20"
              : "bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/8"
          }`}
        >
          Mark as {COLUMNS.find(c => c.id === nextStage)?.label} <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
}

export default function KitchenDisplay({ onNavigate: _onNavigate }: Props) {
  const { kitchenOrders, updateKitchenOrderStatus } = useCart();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "priority" | "delayed">("all");
  const [view, setView] = useState<"board" | "analytics">("board");
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const filteredOrders = kitchenOrders.filter(o => {
    const matchSearch = !search || o.items.some(i => i.name.toLowerCase().includes(search.toLowerCase())) || String(o.number).includes(search) || (o.customer || "").toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || (filter === "priority" && o.priority) || (filter === "delayed" && o.delayed);
    return matchSearch && matchFilter;
  });

  const getColumnOrders = (status: OrderStatus) => filteredOrders.filter(o => o.status === status);

  // Analytics data
  const completedToday = kitchenOrders.filter(o => o.status === "completed").length;
  const avgTime = 9.4;
  const pending = kitchenOrders.filter(o => o.status !== "completed").length;
  const delayed = kitchenOrders.filter(o => o.delayed).length;

  return (
    <div className="min-h-screen bg-[#07090a] text-[#f0f0eb] font-['DM_Sans'] flex flex-col">
      {/* Header */}
      <header className="bg-[#07090a]/95 backdrop-blur-xl border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
            <ChefHat size={18} className="text-orange-400" />
          </div>
          <div>
            <h1 className="font-bold text-base">Kitchen Display</h1>
            <p className="text-xs text-white/40">Morrow Restaurant · {currentTime.toLocaleTimeString()}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Stats row */}
          {[
            { label: "Active", val: pending, color: "text-orange-400" },
            { label: "Done Today", val: completedToday, color: "text-emerald-400" },
            { label: "Delayed", val: delayed, color: delayed > 0 ? "text-red-400" : "text-white/30" },
            { label: "Avg Time", val: `${avgTime}m`, color: "text-[#d7ff7a]" },
          ].map(s => (
            <div key={s.label} className="text-center px-4 border-l border-white/5 first:border-l-0">
              <p className={`text-lg font-black ${s.color}`}>{s.val}</p>
              <p className="text-[10px] text-white/30">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setView(view === "board" ? "analytics" : "board")} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-white/60 hover:text-white transition-all">
            {view === "board" ? <><TrendingUp size={14} /> Analytics</> : <><Filter size={14} /> Board</>}
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="bg-[#09090b] border-b border-white/5 px-6 py-2.5 flex items-center gap-3">
        <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2 flex-1 max-w-xs">
          <Search size={14} className="text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders, items, customer..." className="bg-transparent text-sm flex-1 focus:outline-none placeholder:text-white/25" />
        </div>
        <div className="flex gap-1.5">
          {(["all", "priority", "delayed"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all capitalize ${filter === f ? "bg-[#d7ff7a] text-[#17200f]" : "bg-white/5 text-white/50 hover:text-white border border-white/8"}`}
            >
              {f === "priority" && <Zap size={10} className="inline mr-1" />}
              {f === "delayed" && <AlertTriangle size={10} className="inline mr-1" />}
              {f}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-white/30">
          <RefreshCw size={12} className="animate-spin" style={{ animationDuration: "3s" }} />
          Live
        </div>
      </div>

      {view === "analytics" ? (
        <div className="flex-1 p-6 grid grid-cols-4 gap-4">
          {[
            { label: "Orders Today",       val: "47",   sub: "+12% vs yesterday",    color: "text-[#d7ff7a]",  icon: <Package size={20} /> },
            { label: "Avg Prep Time",      val: "9.4m", sub: "Target: 10m ✓",        color: "text-emerald-400", icon: <Timer size={20} /> },
            { label: "Delayed Orders",     val: "3",    sub: "6.4% of total",        color: "text-red-400",    icon: <AlertTriangle size={20} /> },
            { label: "Customer Rating",    val: "4.8★", sub: "Based on 32 reviews",  color: "text-amber-400",  icon: <Star size={20} /> },
            { label: "Peak Hour",          val: "12:30",sub: "Last 30 days avg",     color: "text-blue-400",   icon: <TrendingUp size={20} /> },
            { label: "Items Per Order",    val: "2.8",  sub: "Avg item count",       color: "text-violet-400", icon: <Users size={20} /> },
            { label: "Burger Count",       val: "28",   sub: "Most popular today",   color: "text-orange-400", icon: <Flame size={20} /> },
            { label: "Revenue Today",      val: "$842", sub: "Est. from orders",     color: "text-[#d7ff7a]",  icon: <TrendingUp size={20} /> },
          ].map(s => (
            <div key={s.label} className="rounded-2xl bg-white/[0.04] border border-white/8 p-5 flex flex-col gap-3">
              <div className={`size-10 rounded-xl bg-white/5 flex items-center justify-center ${s.color}`}>{s.icon}</div>
              <div>
                <p className={`text-2xl font-black ${s.color}`}>{s.val}</p>
                <p className="text-sm text-white/70 font-semibold mt-0.5">{s.label}</p>
                <p className="text-xs text-white/30 mt-0.5">{s.sub}</p>
              </div>
            </div>
          ))}

          {/* Hourly chart */}
          <div className="col-span-4 rounded-2xl bg-white/[0.04] border border-white/8 p-5">
            <h3 className="font-semibold text-sm text-white/70 mb-4">Orders per Hour Today</h3>
            <div className="flex items-end gap-2 h-32">
              {[2, 1, 3, 5, 8, 12, 15, 18, 14, 11, 9, 7].map((val, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-[#d7ff7a]/30 to-[#d7ff7a]/70 hover:from-[#d7ff7a]/50 hover:to-[#d7ff7a] transition-all cursor-pointer"
                    style={{ height: `${(val / 18) * 100}%` }}
                  />
                  <span className="text-[9px] text-white/25">{8 + i}h</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Kanban Board */
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-3 p-4 min-w-max h-full">
            {COLUMNS.map(col => {
              const orders = getColumnOrders(col.id);
              return (
                <div key={col.id} className={`flex flex-col w-[280px] rounded-2xl bg-white/[0.02] border-t-2 border border-white/6 ${colBorder[col.color]} overflow-hidden flex-shrink-0`}>
                  {/* Column Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold ${colorBg[col.color]}`}>
                        {col.icon} {col.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="size-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">{orders.length}</span>
                      {orders.some(o => o.priority) && <Bell size={12} className="text-[#d7ff7a]" />}
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 max-h-[calc(100vh-200px)]">
                    {orders.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="size-10 rounded-xl bg-white/5 flex items-center justify-center mb-2">
                          {col.icon}
                        </div>
                        <p className="text-xs text-white/20">No orders</p>
                      </div>
                    ) : (
                      orders.map(order => (
                        <OrderCard
                          key={order.id}
                          order={order}
                          onAdvance={updateKitchenOrderStatus}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
