import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  Check,
  ChefHat,
  Flame,
  GripVertical,
  PackageOpen,
  Search,
  Utensils,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast, Toaster } from "sonner";
import type { KitchenOrder, OrderStatus } from "../context/CartContext";
import MorrowLogo from "../components/branding/MorrowLogo";
import { useKitchenOrders } from "../hooks/useRealtimeOrders";
import { kitchenNotificationService } from "../services/orders/KitchenNotificationService";
import {
  ACTIVE_KITCHEN_COLUMNS,
  elapsedKitchenSeconds,
  formatKitchenElapsed,
  kitchenUrgency,
  kitchenUrgencyRank,
  matchesKitchenSearch,
  nextKitchenColumn,
  sortKitchenOrders,
  type KitchenUrgency,
} from "../services/orders/kitchenDisplayModel";
import { getKitchenAction } from "../services/supabase/orderStatusService";

type Props = { onNavigate: (route: string) => void };
type Column = {
  id: Extract<OrderStatus, "received" | "preparing" | "cooking" | "ready">;
  label: string;
  description: string;
  icon: ReactNode;
  accent: string;
  badge: string;
};

const NEW_ORDER_GLOW_MS = 5_000;
const SORT_RECONCILIATION_MS = 15_000;
const DRAG_TYPE = "application/x-morrow-kitchen-order";
const COLUMNS: Column[] = [
  { id: "received", label: "Incoming", description: "Awaiting acceptance", icon: <PackageOpen size={17} />, accent: "border-t-sky-400", badge: "border-sky-400/25 bg-sky-400/10 text-sky-200" },
  { id: "preparing", label: "Accepted", description: "Queued for preparation", icon: <Check size={17} />, accent: "border-t-violet-400", badge: "border-violet-400/25 bg-violet-400/10 text-violet-200" },
  { id: "cooking", label: "Preparing", description: "In active preparation", icon: <Flame size={17} />, accent: "border-t-orange-400", badge: "border-orange-400/25 bg-orange-400/10 text-orange-200" },
  { id: "ready", label: "Ready", description: "Awaiting handoff", icon: <ChefHat size={17} />, accent: "border-t-[#D7FB69]", badge: "border-[#D7FB69]/25 bg-[#D7FB69]/10 text-[#D7FB69]" },
];

const URGENCY_STYLE: Record<KitchenUrgency, { dot: string; border: string; text: string; label: string }> = {
  green: { dot: "bg-emerald-400", border: "border-emerald-400/25", text: "text-emerald-300", label: "On time" },
  yellow: { dot: "bg-yellow-300", border: "border-yellow-300/35", text: "text-yellow-200", label: "Watch" },
  orange: { dot: "bg-orange-400", border: "border-orange-400/45", text: "text-orange-300", label: "Urgent" },
  red: { dot: "bg-red-500", border: "border-red-500/65", text: "text-red-300", label: "Critical" },
};

export default function KitchenDisplay({ onNavigate: _onNavigate }: Props) {
  const liveOrders = useKitchenOrders();
  const reducedMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [sortNow, setSortNow] = useState(Date.now());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<OrderStatus | null>(null);
  const [optimisticColumns, setOptimisticColumns] = useState<Record<string, OrderStatus>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const previousIds = useRef<Set<string> | null>(null);
  const announcedIds = useRef(new Set<string>());
  const glowTimers = useRef<number[]>([]);

  useEffect(() => {
    const timer = window.setInterval(() => setSortNow(Date.now()), SORT_RECONCILIATION_MS);
    return () => {
      window.clearInterval(timer);
      glowTimers.current.forEach(value => window.clearTimeout(value));
    };
  }, []);

  useEffect(() => {
    if (liveOrders.error) toast.error(liveOrders.error);
  }, [liveOrders.error]);

  useEffect(() => {
    const ids = new Set(liveOrders.orders.map(order => order.id));
    if (previousIds.current) {
      const incoming = liveOrders.orders.filter(order =>
        order.status === "received"
        && !previousIds.current?.has(order.id)
        && !announcedIds.current.has(order.id));
      if (incoming.length > 0) {
        incoming.forEach(order => announcedIds.current.add(order.id));
        const incomingIds = incoming.map(order => order.id);
        setNewIds(current => new Set([...current, ...incomingIds]));
        kitchenNotificationService.notifyNewOrders(incoming.length);
        toast.info(`${incoming.length} new kitchen order${incoming.length === 1 ? "" : "s"}.`);
        const timer = window.setTimeout(() => setNewIds(current => {
          const next = new Set(current);
          incomingIds.forEach(id => next.delete(id));
          return next;
        }), NEW_ORDER_GLOW_MS);
        glowTimers.current.push(timer);
        previousIds.current = ids;
        return;
      }
    }
    previousIds.current = ids;
  }, [liveOrders.orders]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.matches("input,select,textarea,[contenteditable=true]");
      if (event.key === "Escape") { setQuery(""); searchRef.current?.blur(); return; }
      if (editing) return;
      if (event.key === "/") { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);

  const activeOrders = useMemo(() => liveOrders.orders.filter(order =>
    ACTIVE_KITCHEN_COLUMNS.includes(order.status)), [liveOrders.orders]);

  const visibleOrders = useMemo(() => activeOrders.filter(order =>
    matchesKitchenSearch(order, query)), [activeOrders, query]);

  const getColumnOrders = useCallback((status: Column["id"]) => sortKitchenOrders(
    visibleOrders.filter(order => (optimisticColumns[order.id] ?? order.status) === status),
    sortNow,
  ), [optimisticColumns, sortNow, visibleOrders]);

  const moveOrder = useCallback(async (order: KitchenOrder, target: OrderStatus) => {
    const validTarget = nextKitchenColumn(order);
    if (!validTarget || validTarget !== target) {
      toast.error(`Order ${displayNumber(order)} cannot move to that column yet.`);
      return;
    }
    if (liveOrders.pendingId === order.id) return;
    setOptimisticColumns(current => ({ ...current, [order.id]: target }));
    const ok = await liveOrders.transition(order.id);
    setOptimisticColumns(current => {
      const next = { ...current };
      delete next[order.id];
      return next;
    });
    if (ok) toast.success(`${displayNumber(order)} moved to ${columnLabel(target)}.`);
    else toast.error(`${displayNumber(order)} was returned to its previous column. Refresh and try again.`);
  }, [liveOrders.pendingId, liveOrders.transition]);

  const withReason = useCallback((action: "reject" | "cancel", order: KitchenOrder) => {
    const reason = window.prompt(`${action === "reject" ? "Reject" : "Cancel"} ${displayNumber(order)}. Enter a reason:`)?.trim();
    if (!reason) return;
    void liveOrders[action](order.id, reason).then(ok => {
      if (ok) toast.success(`${displayNumber(order)} ${action === "reject" ? "rejected" : "cancelled"}.`);
      else toast.error(`${displayNumber(order)} could not be updated.`);
    });
  }, [liveOrders.cancel, liveOrders.reject]);

  const dropped = useCallback((event: DragEvent<HTMLElement>, target: Column["id"]) => {
    event.preventDefault();
    const id = event.dataTransfer.getData(DRAG_TYPE) || draggingId;
    setDragOverColumn(null);
    setDraggingId(null);
    const order = activeOrders.find(value => value.id === id);
    if (order) void moveOrder(order, target);
  }, [activeOrders, draggingId, moveOrder]);

  const urgentCount = activeOrders.filter(order => kitchenUrgencyRank(order, sortNow) >= 2).length;

  return <main className="flex min-h-screen flex-col bg-[#070907] font-['DM_Sans'] text-[#F4F5EF]">
    <Toaster theme="dark" position="top-right" richColors />
    <header className="border-b border-white/8 bg-[#090c09]/95 px-4 py-3 backdrop-blur-xl lg:px-6">
      <div className="flex flex-wrap items-center gap-3 lg:gap-4">
        <div className="flex items-center gap-3">
          <MorrowLogo variant="symbol" priority className="size-11 object-contain" />
          <h1 className="text-lg font-black tracking-[-.02em]">Kitchen Display</h1>
        </div>
        <div className="ms-auto flex max-w-full min-w-0 items-center justify-end gap-2 max-sm:w-full">
          <div className="flex min-w-0 flex-1 overflow-x-auto rounded-2xl border border-white/8 bg-white/[.035] sm:flex-none">
            <Metric label="Active" value={activeOrders.length} color="text-white" />
            <Metric label="Incoming" value={activeOrders.filter(order => order.status === "received").length} color="text-sky-300" />
            <Metric label="Urgent" value={urgentCount} color="text-orange-300" />
            <Metric label="Done today" value={liveOrders.doneToday} color="text-[#D7FB69]" />
          </div>
          <ConnectionBadge status={liveOrders.connection} />
        </div>
      </div>
    </header>

    <section className="border-b border-white/8 bg-[#080a08] px-4 py-3 lg:px-6" aria-label="Kitchen search">
      <div className="mx-auto max-w-3xl">
        <label className="flex min-h-12 w-full items-center gap-2 rounded-2xl border border-white/10 bg-white/[.045] px-4 focus-within:border-[#D7FB69]/45">
          <Search size={17} className="shrink-0 text-white/35" />
          <input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search order, product, or reference…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/25" aria-label="Search kitchen orders" />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid size-8 place-items-center rounded-lg hover:bg-white/10"><X size={15} /></button> : <kbd className="hidden rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/25 sm:block">/</kbd>}
        </label>
      </div>
    </section>

    <div className="flex-1 overflow-x-auto p-3 lg:p-4">
      <div className="grid min-h-[calc(100vh-190px)] min-w-[1240px] grid-cols-4 gap-3 2xl:gap-4">
        {COLUMNS.map(column => <KitchenColumn
          key={column.id}
          column={column}
          orders={getColumnOrders(column.id)}
          reducedMotion={Boolean(reducedMotion)}
          pendingId={liveOrders.pendingId}
          newIds={newIds}
          draggingId={draggingId}
          dragActive={dragOverColumn === column.id}
          onDragEnter={() => setDragOverColumn(column.id)}
          onDrop={event => dropped(event, column.id)}
          onDragStart={(event, order) => { event.dataTransfer.setData(DRAG_TYPE, order.id); event.dataTransfer.effectAllowed = "move"; setDraggingId(order.id); }}
          onDragEnd={() => { setDraggingId(null); setDragOverColumn(null); }}
          onAdvance={order => { const target = nextKitchenColumn(order); if (target) void moveOrder(order, target); }}
          onReject={order => withReason("reject", order)}
          onCancel={order => withReason("cancel", order)}
        />)}
      </div>
    </div>
    <p className="sr-only" aria-live="polite">{activeOrders.length} active kitchen orders. {urgentCount} urgent.</p>
  </main>;
}

const KitchenColumn = memo(function KitchenColumn({ column, orders, reducedMotion, pendingId, newIds, draggingId, dragActive, onDragEnter, onDrop, onDragStart, onDragEnd, onAdvance, onReject, onCancel }: {
  column: Column;
  orders: KitchenOrder[];
  reducedMotion: boolean;
  pendingId: string | null;
  newIds: Set<string>;
  draggingId: string | null;
  dragActive: boolean;
  onDragEnter: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragStart: (event: DragEvent<HTMLElement>, order: KitchenOrder) => void;
  onDragEnd: () => void;
  onAdvance: (order: KitchenOrder) => void;
  onReject: (order: KitchenOrder) => void;
  onCancel: (order: KitchenOrder) => void;
}) {
  return <section aria-labelledby={`kitchen-column-${column.id}`} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; onDragEnter(); }} onDrop={onDrop} className={`flex min-w-0 flex-col overflow-hidden rounded-[22px] border border-t-2 bg-white/[.025] transition-colors ${column.accent} ${dragActive ? "border-[#D7FB69]/45 bg-[#D7FB69]/[.045]" : "border-x-white/8 border-b-white/8"}`}>
    <header className="flex min-h-[68px] items-center gap-3 border-b border-white/8 bg-[#0B0E0B] px-4 py-3">
      <span className={`grid size-9 place-items-center rounded-xl border ${column.badge}`}>{column.icon}</span>
      <div><h2 id={`kitchen-column-${column.id}`} className="font-black">{column.label}</h2><p className="text-[11px] text-white/35">{column.description}</p></div>
      <span className="ms-auto grid size-8 place-items-center rounded-full bg-white/8 text-sm font-black">{orders.length}</span>
    </header>
    <div className="flex max-h-[calc(100vh-270px)] min-h-[280px] flex-1 flex-col gap-3 overflow-y-auto p-3" role="list">
      <AnimatePresence initial={false} mode="popLayout">
        {orders.map(order => <motion.div key={order.id} layout={!reducedMotion} layoutId={reducedMotion ? undefined : `kitchen-order-${order.id}`} initial={reducedMotion ? false : { opacity: 0, y: 12, scale: .985 }} animate={reducedMotion ? undefined : { opacity: draggingId === order.id ? .45 : 1, y: 0, scale: 1, boxShadow: newIds.has(order.id) ? ["0 0 0 rgba(215,251,105,0)", "0 0 30px rgba(215,251,105,.28)", "0 0 0 rgba(215,251,105,0)"] : "0 0 0 rgba(215,251,105,0)" }} exit={reducedMotion ? undefined : { opacity: 0, scale: .98 }} transition={{ duration: reducedMotion ? 0 : .18, boxShadow: { duration: 1.4, repeat: newIds.has(order.id) ? 1 : 0 } }} role="listitem">
          <OrderCard order={order} isNew={newIds.has(order.id)} reducedMotion={reducedMotion} pending={pendingId === order.id} onDragStart={onDragStart} onDragEnd={onDragEnd} onAdvance={onAdvance} onReject={onReject} onCancel={onCancel} />
        </motion.div>)}
      </AnimatePresence>
      {orders.length === 0 ? <div className={`grid flex-1 place-items-center rounded-2xl border border-dashed px-6 text-center ${dragActive ? "border-[#D7FB69]/40 text-[#D7FB69]" : "border-white/8 text-white/25"}`}><div><Utensils size={30} className="mx-auto mb-3 opacity-45" /><p className="text-sm font-bold">{dragActive ? `Move to ${column.label}` : `No ${column.label.toLowerCase()} orders`}</p></div></div> : null}
    </div>
  </section>;
});

const OrderCard = memo(function OrderCard({ order, isNew, reducedMotion, pending, onDragStart, onDragEnd, onAdvance, onReject, onCancel }: {
  order: KitchenOrder;
  isNew: boolean;
  reducedMotion: boolean;
  pending: boolean;
  onDragStart: (event: DragEvent<HTMLElement>, order: KitchenOrder) => void;
  onDragEnd: () => void;
  onAdvance: (order: KitchenOrder) => void;
  onReject: (order: KitchenOrder) => void;
  onCancel: (order: KitchenOrder) => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const urgency = kitchenUrgency(order, now);
  const style = URGENCY_STYLE[urgency];
  const action = order.databaseStatus ? getKitchenAction(order.databaseStatus) : null;
  const totalItems = order.items.reduce((sum, item) => sum + item.qty, 0);
  const canDrag = Boolean(action) && !pending;
  const keyboardAdvance = (event: React.KeyboardEvent<HTMLElement>) => {
    if ((event.key === "Enter" || event.key === " ") && action && !pending) { event.preventDefault(); onAdvance(order); }
  };

  return <article
    draggable={canDrag}
    onDragStart={event => onDragStart(event, order)}
    onDragEnd={onDragEnd}
    onKeyDown={keyboardAdvance}
    tabIndex={0}
    aria-label={`${displayNumber(order)}, ${columnLabel(order.status)}, ${totalItems} items`}
    className={`group rounded-[20px] border bg-[#101410] p-4 shadow-lg shadow-black/20 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#D7FB69] ${style.border} ${canDrag ? "cursor-grab active:cursor-grabbing" : ""} ${isNew ? "ring-1 ring-[#D7FB69]/55" : ""}`}
  >
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-[28px] font-black leading-none tracking-[-.04em]">{displayNumber(order)}</strong>
          {isNew ? <span className="rounded-md bg-[#D7FB69] px-2 py-1 text-[9px] font-black uppercase text-[#17200F]">New</span> : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-wide">
          <Tag>{sourceLabel(order)}</Tag><Tag>{serviceLabel(order.type)}</Tag><Tag>{paymentLabel(order.paymentMethod)}</Tag>
        </div>
      </div>
      <div className="text-end">
        <div className={`flex items-center justify-end gap-1.5 font-mono text-lg font-black tabular-nums ${style.text}`}><span className={`size-2.5 rounded-full ${style.dot} ${urgency === "red" && !reducedMotion ? "animate-pulse" : ""}`} />{formatKitchenElapsed(elapsedKitchenSeconds(order, now))}</div>
        <p className={`mt-1 text-[10px] font-black uppercase tracking-[.12em] ${style.text}`}>{style.label}</p>
      </div>
    </div>

    <div className="my-3 h-px bg-white/8" />
    <div className="space-y-3">
      {order.items.map((item, index) => <div key={`${item.name}-${index}`}>
        <div className="flex items-start gap-2.5"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/10 text-xs font-black">{item.qty}</span><p className="pt-1 text-sm font-bold leading-tight">{item.name}</p></div>
        {item.customizations?.map(modifier => <p key={modifier} className="ms-9 mt-1 text-xs font-semibold text-[#D7FB69]">+ {modifier}</p>)}
        {item.notes ? <p className="ms-9 mt-1 rounded-lg border border-amber-300/15 bg-amber-300/8 px-2 py-1.5 text-xs font-bold text-amber-200">Note: {item.notes}</p> : null}
        {item.allergenWarnings?.map(allergen => <p key={allergen} className="ms-9 mt-1 rounded-lg border border-red-400/20 bg-red-500/10 px-2 py-1.5 text-xs font-black text-red-200">Allergy: {allergen}</p>)}
      </div>)}
    </div>
    {order.notes ? <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/8 p-2.5 text-xs font-bold text-amber-100"><span className="text-amber-300">Order note:</span> {order.notes}</div> : null}

    <div className="mt-4 flex items-center justify-between border-t border-white/8 pt-3 text-xs"><span className="font-bold text-white/45">{totalItems} total item{totalItems === 1 ? "" : "s"}</span>{order.customer ? <span title={order.customer} className="max-w-[140px] truncate text-white/30">Ref · {shortReference(order.customer)}</span> : null}</div>

    {action ? <button type="button" disabled={pending} onClick={() => onAdvance(order)} className={`mt-3 min-h-12 w-full rounded-xl border px-4 text-sm font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7FB69] disabled:cursor-wait disabled:opacity-45 ${order.databaseStatus === "ready" ? "border-[#D7FB69]/25 bg-[#D7FB69] text-[#17200F]" : "border-white/10 bg-white/[.07] text-white hover:bg-white/[.12]"}`}>{pending ? "Updating…" : action.label}</button> : null}
    {!pending && order.databaseStatus === "submitted" ? <button type="button" onClick={() => onReject(order)} className="mt-2 min-h-10 w-full rounded-xl text-xs font-bold text-red-300/75 hover:bg-red-500/8 hover:text-red-200">Reject order</button> : null}
    {!pending && (order.databaseStatus === "accepted" || order.databaseStatus === "preparing") ? <button type="button" onClick={() => onCancel(order)} className="mt-2 min-h-10 w-full rounded-xl text-xs font-bold text-red-300/75 hover:bg-red-500/8 hover:text-red-200">Cancel order</button> : null}
    {canDrag ? <p className="mt-2 flex items-center justify-center gap-1 text-[10px] text-white/20"><GripVertical size={12} />Drag to the next column · Enter to advance</p> : null}
  </article>;
});

function ConnectionBadge({ status }: { status: string }) {
  const connected = status === "connected";
  return <span className={`flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-bold ${connected ? "border-emerald-400/15 bg-emerald-400/8 text-emerald-300" : "border-amber-300/15 bg-amber-300/8 text-amber-200"}`}><span className={`size-2 rounded-full ${connected ? "bg-emerald-400" : "animate-pulse bg-amber-300"}`} />{connected ? "Live" : status}</span>;
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="min-w-[66px] border-s border-white/8 px-2.5 py-2 text-center first:border-0 sm:min-w-[76px] sm:px-3"><p className={`text-lg font-black leading-none tabular-nums ${color}`}>{value}</p><p className="mt-1 whitespace-nowrap text-[8px] font-black uppercase tracking-[.1em] text-white/30 sm:text-[9px]">{label}</p></div>;
}

function Tag({ children }: { children: ReactNode }) { return <span className="rounded-md border border-white/8 bg-white/[.05] px-2 py-1 text-white/50">{children}</span>; }
function displayNumber(order: KitchenOrder) { return order.orderNumber ?? `#${order.number}`; }
function sourceLabel(order: KitchenOrder) { return order.source === "cashier" ? "Cashier" : "Kiosk"; }
function serviceLabel(type: KitchenOrder["type"]) { return type === "take_away" ? "Take Away" : "Dine In"; }
function paymentLabel(method: KitchenOrder["paymentMethod"]) {
  if (method === "pay_at_cashier") return "Pay at Cashier";
  if (method === "card_terminal") return "Card";
  if (method === "qr") return "QR";
  if (method === "cash") return "Cash";
  return "Payment pending";
}
function shortReference(reference: string) { return reference.length > 10 ? `…${reference.slice(-8)}` : reference; }
function columnLabel(status: OrderStatus) { return COLUMNS.find(column => column.id === status)?.label ?? "Completed"; }
