import { useState } from "react";
import {
  BarChart2, Users, ShoppingCart, DollarSign, TrendingUp,
  Package, MapPin, UserCheck, Tag, Megaphone, Award, CreditCard,
  FileText, Sparkles, Settings, ChevronRight, Search, Bell, ArrowUpRight,
  ArrowDownRight, Download, MoreHorizontal, AlertTriangle,
  ArrowLeft, Coffee
} from "lucide-react";
import MorrowLogo from "../components/branding/MorrowLogo";

type Props = { onNavigate: (route: string) => void };

type NavItem = { id: string; label: string; icon: React.ReactNode; badge?: number };

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard",  label: "Dashboard",   icon: <BarChart2 size={16} /> },
  { id: "analytics",  label: "Analytics",   icon: <TrendingUp size={16} /> },
  { id: "revenue",    label: "Revenue",     icon: <DollarSign size={16} /> },
  { id: "orders",     label: "Orders",      icon: <ShoppingCart size={16} />, badge: 12 },
  { id: "customers",  label: "Customers",   icon: <Users size={16} /> },
  { id: "menu",       label: "Menu",        icon: <Coffee size={16} /> },
  { id: "categories", label: "Categories",  icon: <Tag size={16} /> },
  { id: "inventory",  label: "Inventory",   icon: <Package size={16} />, badge: 3 },
  { id: "branches",   label: "Branches",    icon: <MapPin size={16} /> },
  { id: "employees",  label: "Employees",   icon: <UserCheck size={16} /> },
  { id: "coupons",    label: "Coupons",     icon: <Tag size={16} /> },
  { id: "campaigns",  label: "Campaigns",   icon: <Megaphone size={16} /> },
  { id: "loyalty",    label: "Loyalty",     icon: <Award size={16} /> },
  { id: "payments",   label: "Payments",    icon: <CreditCard size={16} /> },
  { id: "reports",    label: "Reports",     icon: <FileText size={16} /> },
  { id: "ai",         label: "AI Insights", icon: <Sparkles size={16} /> },
  { id: "settings",   label: "Settings",    icon: <Settings size={16} /> },
];

const KPI_CARDS = [
  { label: "Total Revenue",     val: "$48,290",  sub: "+18.2% this month",  icon: <DollarSign size={20} />,  up: true,  color: "text-[#d7ff7a]",  bg: "bg-[#d7ff7a]/10 border-[#d7ff7a]/20" },
  { label: "Total Orders",      val: "1,847",    sub: "+12.4% this week",   icon: <ShoppingCart size={20} />, up: true,  color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20" },
  { label: "Active Customers",  val: "6,312",    sub: "+5.8% this month",   icon: <Users size={20} />,        up: true,  color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  { label: "Avg Order Value",   val: "$26.14",   sub: "-2.1% this week",    icon: <TrendingUp size={20} />,   up: false, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
];

const ORDERS_DATA = [
  { id: "#1847", customer: "Ahmed Ali",   items: 3, total: "$32.40", status: "completed", time: "2m ago",    method: "Apple Pay" },
  { id: "#1846", customer: "Sara Johnson",items: 1, total: "$10.50", status: "cooking",   time: "5m ago",    method: "Credit" },
  { id: "#1845", customer: "Mike Chen",   items: 4, total: "$47.20", status: "preparing", time: "8m ago",    method: "Google Pay" },
  { id: "#1844", customer: "Lena Park",   items: 2, total: "$18.90", status: "ready",     time: "12m ago",   method: "Cash" },
  { id: "#1843", customer: "Omar Hassan", items: 3, total: "$28.70", status: "completed", time: "15m ago",   method: "Debit" },
  { id: "#1842", customer: "Nora White",  items: 1, total: "$8.90",  status: "completed", time: "18m ago",   method: "QR" },
];

const statusColor: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  cooking:   "bg-orange-500/15 text-orange-400 border-orange-500/20",
  preparing: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  ready:     "bg-[#d7ff7a]/15 text-[#d7ff7a] border-[#d7ff7a]/20",
};

const MENU_ITEMS = [
  { name: "Spicy Nori Burger",  price: "$8.90",  orders: 284, stock: 45, status: "active",  img: "https://images.unsplash.com/photo-1606149059549-6042addafc5a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=100" },
  { name: "Smoky Truffle Beef", price: "$10.50", orders: 196, stock: 12, status: "low",     img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=100" },
  { name: "Zen Garden Bowl",    price: "$7.20",  orders: 143, stock: 78, status: "active",  img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=100" },
  { name: "Rosemary Fries",     price: "$3.50",  orders: 412, stock: 0,  status: "out",     img: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=100" },
  { name: "Iced Matcha Latte",  price: "$4.50",  orders: 298, stock: 34, status: "active",  img: "https://images.unsplash.com/photo-1543007630-9710e4a00a20?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=100" },
];

const INVENTORY_ALERTS = [
  { item: "Smoky Truffle Beef Patty", stock: 12, min: 20, unit: "pcs" },
  { item: "Brioche Buns",             stock: 8,  min: 50, unit: "pcs" },
  { item: "Truffle Oil",              stock: 0,  min: 5,  unit: "bottles" },
];

const BRANCHES = [
  { name: "Downtown Branch",  revenue: "$18,420", orders: 712, rating: 4.8, status: "open" },
  { name: "Mall Branch",      revenue: "$14,860", orders: 581, rating: 4.6, status: "open" },
  { name: "Airport Branch",   revenue: "$9,200",  orders: 389, rating: 4.7, status: "open" },
  { name: "Beach Branch",     revenue: "$5,810",  orders: 165, rating: 4.4, status: "closed" },
];

const AI_INSIGHTS = [
  { type: "revenue",   msg: "Revenue up 18% this month — Peak hours are 12–2PM and 6–8PM.",      icon: <TrendingUp size={16} />,   color: "text-[#d7ff7a]", bg: "bg-[#d7ff7a]/10 border-[#d7ff7a]/20" },
  { type: "inventory", msg: "Truffle Oil stock is critical. Recommend reorder of 10 units.",        icon: <AlertTriangle size={16} />, color: "text-red-400",    bg: "bg-red-500/10 border-red-500/20" },
  { type: "menu",      msg: "Spicy Nori Burger has 284 orders — Consider adding combo offer.",     icon: <Sparkles size={16} />,     color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  { type: "loyalty",   msg: "220 customers are near Gold tier — Targeted push could boost visits.", icon: <Award size={16} />,        color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20" },
];

function renderContent(section: string) {
  switch (section) {
    case "dashboard": return <DashboardMain />;
    case "orders":    return <OrdersView />;
    case "menu":      return <MenuView />;
    case "inventory": return <InventoryView />;
    case "branches":  return <BranchesView />;
    case "ai":        return <AIInsightsView />;
    case "analytics": return <AnalyticsView />;
    case "customers": return <CustomersView />;
    case "loyalty":   return <LoyaltyView />;
    default:          return <PlaceholderView section={section} />;
  }
}

function DashboardMain() {
  return (
    <div className="flex flex-col gap-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {KPI_CARDS.map(k => (
          <div key={k.label} className={`rounded-2xl border p-5 flex flex-col gap-3 ${k.bg}`}>
            <div className="flex items-center justify-between">
              <div className={`size-10 rounded-xl bg-white/5 flex items-center justify-center ${k.color}`}>{k.icon}</div>
              <span className={`flex items-center gap-1 text-xs font-bold ${k.up ? "text-emerald-400" : "text-red-400"}`}>
                {k.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {k.sub.split(" ")[0]}
              </span>
            </div>
            <div>
              <p className={`text-2xl font-black ${k.color}`}>{k.val}</p>
              <p className="text-xs text-white/50 mt-0.5">{k.label}</p>
              <p className="text-[10px] text-white/30 mt-0.5">{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Revenue Chart */}
        <div className="col-span-2 rounded-2xl bg-white/[0.04] border border-white/8 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm">Revenue — Last 7 Days</h3>
            <div className="flex gap-2">
              {["7D", "30D", "3M", "1Y"].map(p => (
                <button key={p} className={`text-xs px-2.5 py-1 rounded-lg transition-all ${p === "7D" ? "bg-[#d7ff7a] text-[#17200f] font-bold" : "text-white/40 hover:text-white"}`}>{p}</button>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-3 h-36">
            {[4200, 5800, 4900, 6700, 7200, 5900, 8100].map((val, i) => {
              const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full rounded-t-xl relative group cursor-pointer" style={{ height: `${(val / 8100) * 100}%`, background: i === 6 ? "linear-gradient(to top, #d7ff7a, #a9cc50)" : "rgba(255,255,255,0.06)" }}>
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#17200f] border border-[#d7ff7a]/30 text-[#d7ff7a] text-[9px] px-1.5 py-0.5 rounded font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                      ${(val / 1000).toFixed(1)}k
                    </div>
                  </div>
                  <span className="text-[10px] text-white/30">{days[i]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Items */}
        <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-5">
          <h3 className="font-bold text-sm mb-4">Top Items</h3>
          <div className="flex flex-col gap-3">
            {MENU_ITEMS.slice(0, 4).map((item, i) => (
              <div key={item.name} className="flex items-center gap-3">
                <span className="text-xs text-white/30 w-4 text-right">{i + 1}</span>
                <img src={item.img} alt={item.name} className="size-8 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{item.name}</p>
                  <div className="h-1 rounded-full bg-white/5 mt-1">
                    <div className="h-full rounded-full bg-[#d7ff7a]/60" style={{ width: `${(item.orders / 412) * 100}%` }} />
                  </div>
                </div>
                <span className="text-xs text-white/40">{item.orders}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Orders & AI Insights */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 rounded-2xl bg-white/[0.04] border border-white/8 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm">Recent Orders</h3>
            <button className="text-xs text-[#d7ff7a] flex items-center gap-1 hover:text-white transition-colors">View all <ChevronRight size={12} /></button>
          </div>
          <div className="flex flex-col gap-2">
            {ORDERS_DATA.slice(0, 5).map(o => (
              <div key={o.id} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-white/5 transition-colors group">
                <span className="text-xs font-mono text-white/40 w-14">{o.id}</span>
                <span className="text-sm font-medium flex-1 truncate">{o.customer}</span>
                <span className="text-xs text-white/40">{o.items} items</span>
                <span className="text-sm font-bold text-[#d7ff7a] w-16 text-right">{o.total}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold w-20 text-center ${statusColor[o.status]}`}>{o.status}</span>
                <span className="text-[10px] text-white/30">{o.time}</span>
              </div>
            ))}
          </div>
        </div>
        <AIInsightsView mini />
      </div>
    </div>
  );
}

function OrdersView() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const exportOrders = () => {
    const csv = ["Order ID,Customer,Items,Total,Method,Status,Time", ...ORDERS_DATA.map(order => [order.id, order.customer, order.items, order.total, order.method, order.status, order.time].join(","))].join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "morrow-orders.csv"; link.click(); URL.revokeObjectURL(link.href);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2 flex-1 max-w-xs">
          <Search size={14} className="text-white/30" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search orders..." className="bg-transparent text-sm flex-1 focus:outline-none placeholder:text-white/25" />
        </div>
        <div className="flex gap-2">
          {["all", "completed", "cooking", "preparing", "ready"].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all ${filter === f ? "bg-[#d7ff7a] text-[#17200f]" : "bg-white/5 text-white/50 hover:text-white border border-white/8"}`}>{f}</button>
          ))}
        </div>
        <button onClick={exportOrders} className="ml-auto flex items-center gap-1.5 text-sm text-white/50 hover:text-white border border-white/8 px-3 py-1.5 rounded-xl transition-all">
          <Download size={14} /> Export
        </button>
      </div>
      <div className="rounded-2xl bg-white/[0.04] border border-white/8 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {["Order ID", "Customer", "Items", "Total", "Method", "Status", "Time", ""].map(h => (
                <th key={h} className="text-left text-xs text-white/30 font-semibold uppercase tracking-wider px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ORDERS_DATA.filter(o => (filter === "all" || o.status === filter) && `${o.id} ${o.customer}`.toLowerCase().includes(search.toLowerCase())).map(o => (
              <tr key={o.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                <td className="px-4 py-3 font-mono text-sm text-white/50">{o.id}</td>
                <td className="px-4 py-3 font-medium text-sm">{o.customer}</td>
                <td className="px-4 py-3 text-sm text-white/50">{o.items}</td>
                <td className="px-4 py-3 font-bold text-[#d7ff7a]">{o.total}</td>
                <td className="px-4 py-3 text-xs text-white/40">{o.method}</td>
                <td className="px-4 py-3"><span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${statusColor[o.status]}`}>{o.status}</span></td>
                <td className="px-4 py-3 text-xs text-white/30">{o.time}</td>
                <td className="px-4 py-3"><button onClick={() => setSelectedOrder(selectedOrder === o.id ? null : o.id)} className="opacity-0 group-hover:opacity-100 transition-opacity"><MoreHorizontal size={14} className="text-white/40" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedOrder && <div className="rounded-xl border border-[#d7ff7a]/20 bg-[#d7ff7a]/5 p-4 text-sm">Selected {selectedOrder}. <button onClick={() => setSelectedOrder(null)} className="float-right text-white/40">Close</button><div className="mt-3 flex gap-2"><button onClick={() => window.print()} className="rounded-lg bg-white/10 px-3 py-2">Print receipt</button><button onClick={() => { localStorage.setItem(`morrow_refund_${selectedOrder}`, new Date().toISOString()); setSelectedOrder(null); }} className="rounded-lg bg-red-500/10 px-3 py-2 text-red-400">Mark refunded</button></div></div>}
    </div>
  );
}

function MenuView() {
  const [menuItems, setMenuItems] = useState(MENU_ITEMS);
  const [adding, setAdding] = useState(false);
  const addItem = () => { setMenuItems(previous => [...previous, { name: `New Menu Item ${previous.length + 1}`, price: "$0.00", orders: 0, stock: 0, status: "out", img: MENU_ITEMS[0].img }]); setAdding(false); };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h3 className="font-bold text-base">Menu Items</h3>
        <button onClick={() => setAdding(true)} className="ml-auto px-4 py-2 rounded-xl bg-[#d7ff7a] text-[#17200f] font-bold text-sm hover:bg-[#c8f060] transition-all">+ Add Item</button>
      </div>
      <div className="rounded-2xl bg-white/[0.04] border border-white/8 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {["Item", "Price", "Orders", "Stock", "Status", ""].map(h => (
                <th key={h} className="text-left text-xs text-white/30 font-semibold uppercase tracking-wider px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {menuItems.map(item => (
              <tr key={item.name} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img src={item.img} alt={item.name} className="size-10 rounded-xl object-cover" />
                    <span className="font-medium text-sm">{item.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-bold text-[#d7ff7a]">{item.price}</td>
                <td className="px-4 py-3 text-sm text-white/60">{item.orders}</td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-bold ${item.stock === 0 ? "text-red-400" : item.stock < 20 ? "text-orange-400" : "text-emerald-400"}`}>{item.stock}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${item.status === "active" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" : item.status === "low" ? "bg-orange-500/15 text-orange-400 border-orange-500/20" : "bg-red-500/15 text-red-400 border-red-500/20"}`}>
                    {item.status === "out" ? "Out of Stock" : item.status === "low" ? "Low Stock" : "Active"}
                  </span>
                </td>
                <td className="px-4 py-3"><button onClick={() => setMenuItems(previous => previous.map(current => current.name === item.name ? { ...current, status: current.status === "active" ? "out" : "active", stock: current.status === "active" ? 0 : 20 } : current))} className="opacity-0 group-hover:opacity-100 transition-opacity text-[#d7ff7a] text-xs border border-[#d7ff7a]/20 px-2 py-1 rounded-lg hover:bg-[#d7ff7a]/10">Toggle status</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding && <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-between"><span className="text-sm">Create a new editable draft menu item?</span><div className="flex gap-2"><button onClick={() => setAdding(false)} className="px-3 py-2 text-xs text-white/40">Cancel</button><button onClick={addItem} className="rounded-lg bg-[#d7ff7a] px-3 py-2 text-xs font-bold text-[#17200f]">Create draft</button></div></div>}
    </div>
  );
}

function InventoryView() {
  const [ordered, setOrdered] = useState<string[]>([]);
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-bold text-base">Inventory Management</h3>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total SKUs",    val: "84",   color: "text-white" },
          { label: "Low Stock",     val: "3",    color: "text-orange-400" },
          { label: "Out of Stock",  val: "1",    color: "text-red-400" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl bg-white/[0.04] border border-white/8 p-4">
            <p className={`text-2xl font-black ${s.color}`}>{s.val}</p>
            <p className="text-sm text-white/40 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      {INVENTORY_ALERTS.length > 0 && (
        <div className="rounded-2xl bg-red-500/5 border border-red-500/20 p-4">
          <h4 className="font-semibold text-sm text-red-400 flex items-center gap-2 mb-3"><AlertTriangle size={14} /> Critical Stock Alerts</h4>
          <div className="flex flex-col gap-2">
            {INVENTORY_ALERTS.map(a => (
              <div key={a.item} className="flex items-center justify-between py-2 border-b border-red-500/10 last:border-b-0">
                <span className="text-sm">{a.item}</span>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold ${a.stock === 0 ? "text-red-400" : "text-orange-400"}`}>{a.stock} {a.unit}</span>
                  <span className="text-xs text-white/30">min: {a.min}</span>
                  <button onClick={() => setOrdered(previous => previous.includes(a.item) ? previous : [...previous, a.item])} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1 rounded-lg transition-all">{ordered.includes(a.item) ? "Ordered" : "Reorder"}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BranchesView() {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-bold text-base">All Branches</h3>
      <div className="grid grid-cols-2 gap-4">
        {BRANCHES.map(b => (
          <div key={b.name} className="rounded-2xl bg-white/[0.04] border border-white/8 p-5 hover:border-white/15 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-[#d7ff7a]" />
                <h4 className="font-bold">{b.name}</h4>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${b.status === "open" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" : "bg-white/5 text-white/30 border-white/10"}`}>
                {b.status}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><p className="text-lg font-black text-[#d7ff7a]">{b.revenue}</p><p className="text-xs text-white/30">Revenue</p></div>
              <div><p className="text-lg font-black text-blue-400">{b.orders}</p><p className="text-xs text-white/30">Orders</p></div>
              <div><p className="text-lg font-black text-amber-400">{b.rating}★</p><p className="text-xs text-white/30">Rating</p></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AIInsightsView({ mini = false }: { mini?: boolean }) {
  if (mini) return (
    <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-[#d7ff7a]" />
        <h3 className="font-bold text-sm">AI Insights</h3>
      </div>
      <div className="flex flex-col gap-2">
        {AI_INSIGHTS.slice(0, 3).map((ins, i) => (
          <div key={i} className={`rounded-xl border p-3 ${ins.bg}`}>
            <div className="flex items-start gap-2">
              <span className={ins.color}>{ins.icon}</span>
              <p className="text-xs text-white/60 leading-relaxed">{ins.msg}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Sparkles size={20} className="text-[#d7ff7a]" />
        <h3 className="font-bold text-lg">AI Insights & Recommendations</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {AI_INSIGHTS.map((ins, i) => (
          <div key={i} className={`rounded-2xl border p-5 ${ins.bg}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={ins.color}>{ins.icon}</span>
              <span className={`text-xs font-bold uppercase tracking-wider ${ins.color}`}>{ins.type}</span>
            </div>
            <p className="text-sm text-white/70 leading-relaxed">{ins.msg}</p>
            <button className={`mt-3 text-xs font-semibold ${ins.color} flex items-center gap-1 hover:opacity-80 transition-opacity`}>
              Take Action <ChevronRight size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsView() {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-bold text-base">Revenue Analytics</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-5">
          <h4 className="text-sm font-semibold text-white/60 mb-4">Monthly Revenue Trend</h4>
          <div className="flex items-end gap-2 h-40">
            {[32, 41, 38, 52, 48, 61, 58, 72, 68, 79, 85, 92].map((val, i) => {
              const months = ["J","F","M","A","M","J","J","A","S","O","N","D"];
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t-lg transition-all hover:opacity-80" style={{ height: `${val}%`, background: i === 11 ? "linear-gradient(to top, #d7ff7a, #a9cc50)" : "rgba(255,255,255,0.07)" }} />
                  <span className="text-[9px] text-white/25">{months[i]}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-5">
          <h4 className="text-sm font-semibold text-white/60 mb-4">Payment Methods</h4>
          <div className="flex flex-col gap-2.5">
            {[
              { label: "Credit/Debit", pct: 38, color: "bg-blue-400" },
              { label: "Apple Pay",    pct: 24, color: "bg-slate-300" },
              { label: "Google Pay",   pct: 18, color: "bg-green-400" },
              { label: "Cash",         pct: 12, color: "bg-[#d7ff7a]" },
              { label: "Other",        pct: 8,  color: "bg-white/20" },
            ].map(p => (
              <div key={p.label} className="flex items-center gap-3">
                <span className="text-xs text-white/50 w-24">{p.label}</span>
                <div className="flex-1 h-2 rounded-full bg-white/5">
                  <div className={`h-full rounded-full ${p.color}`} style={{ width: `${p.pct}%` }} />
                </div>
                <span className="text-xs text-white/40 w-8 text-right">{p.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomersView() {
  const customers = [
    { name: "Ahmed Ali",     email: "ahmed@ex.co",  orders: 24, spent: "$312.40", tier: "gold",     last: "Today" },
    { name: "Sara Johnson",  email: "sara@ex.co",   orders: 18, spent: "$198.60", tier: "silver",   last: "Yesterday" },
    { name: "Mike Chen",     email: "mike@ex.co",   orders: 32, spent: "$487.20", tier: "platinum", last: "2d ago" },
    { name: "Lena Park",     email: "lena@ex.co",   orders: 9,  spent: "$94.50",  tier: "bronze",   last: "1w ago" },
  ];
  const tierColors: Record<string, string> = {
    bronze: "text-amber-700 bg-amber-700/10 border-amber-700/20",
    silver: "text-slate-300 bg-slate-300/10 border-slate-300/20",
    gold:   "text-amber-400 bg-amber-400/10 border-amber-400/20",
    platinum: "text-violet-300 bg-violet-300/10 border-violet-300/20",
  };
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-bold text-base">Customer Management</h3>
      <div className="rounded-2xl bg-white/[0.04] border border-white/8 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {["Customer", "Email", "Orders", "Total Spent", "Tier", "Last Visit"].map(h => (
                <th key={h} className="text-left text-xs text-white/30 font-semibold uppercase tracking-wider px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {customers.map(c => (
              <tr key={c.name} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 font-medium text-sm">{c.name}</td>
                <td className="px-4 py-3 text-sm text-white/40 font-mono">{c.email}</td>
                <td className="px-4 py-3 text-sm text-white/60">{c.orders}</td>
                <td className="px-4 py-3 font-bold text-[#d7ff7a]">{c.spent}</td>
                <td className="px-4 py-3"><span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold capitalize ${tierColors[c.tier]}`}>{c.tier}</span></td>
                <td className="px-4 py-3 text-xs text-white/30">{c.last}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LoyaltyView() {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-bold text-base">Loyalty Program</h3>
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Members",    val: "6,312", color: "text-[#d7ff7a]" },
          { label: "Points Issued",    val: "2.4M",  color: "text-amber-400" },
          { label: "Points Redeemed",  val: "890K",  color: "text-violet-400" },
          { label: "Avg Points/User",  val: "380",   color: "text-blue-400" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl bg-white/[0.04] border border-white/8 p-4">
            <p className={`text-2xl font-black ${s.color}`}>{s.val}</p>
            <p className="text-xs text-white/40 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-5">
        <h4 className="font-semibold text-sm mb-4">Tier Distribution</h4>
        <div className="flex gap-4">
          {[
            { tier: "Bronze",   count: 2840, color: "bg-amber-700/60",   pct: 45 },
            { tier: "Silver",   count: 1890, color: "bg-slate-400/60",   pct: 30 },
            { tier: "Gold",     count: 1100, color: "bg-amber-400/60",   pct: 17 },
            { tier: "Platinum", count: 482,  color: "bg-violet-400/60",  pct: 8 },
          ].map(t => (
            <div key={t.tier} className="flex-1 flex flex-col gap-2">
              <div className="h-24 rounded-xl bg-white/5 relative overflow-hidden">
                <div className={`absolute bottom-0 left-0 right-0 rounded-xl ${t.color} transition-all`} style={{ height: `${t.pct}%` }} />
              </div>
              <p className="text-xs text-white/60 text-center">{t.tier}</p>
              <p className="text-sm font-bold text-center">{t.count.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlaceholderView({ section }: { section: string }) {
  const navItem = NAV_ITEMS.find(n => n.id === section);
  const storageKey = `morrow_admin_${section}`;
  const [records, setRecords] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "[]") as string[]; } catch { return []; }
  });
  const [draft, setDraft] = useState("");
  const addRecord = () => {
    const value = draft.trim(); if (!value) return;
    const next = [...records, value]; setRecords(next); localStorage.setItem(storageKey, JSON.stringify(next)); setDraft("");
  };
  return (
    <div className="max-w-3xl flex flex-col gap-5">
      <div className="flex items-center gap-3"><div className="size-12 rounded-2xl bg-[#d7ff7a]/10 border border-[#d7ff7a]/20 flex items-center justify-center text-[#d7ff7a]">{navItem?.icon}</div><div><h3 className="text-lg font-semibold capitalize">{navItem?.label || section}</h3><p className="text-white/30 text-sm">Local management workspace</p></div></div>
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5"><label className="text-xs uppercase tracking-wider text-white/35">Add {navItem?.label || section} record</label><div className="flex gap-2 mt-2"><input value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") addRecord(); }} className="h-11 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 outline-none focus:border-[#d7ff7a]/40" placeholder={`Enter ${navItem?.label?.toLowerCase() || section} information`} /><button onClick={addRecord} className="px-5 rounded-xl bg-[#d7ff7a] text-[#17200f] font-bold">Add</button></div></div>
      <div className="space-y-2">{records.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/30">No locally saved records yet.</p> : records.map((record,index)=><div key={`${record}-${index}`} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3"><span className="text-sm">{record}</span><button onClick={()=>{const next=records.filter((_,i)=>i!==index);setRecords(next);localStorage.setItem(storageKey,JSON.stringify(next));}} className="text-xs text-red-400">Remove</button></div>)}</div>
    </div>
  );
}

export default function Dashboard({ onNavigate }: Props) {
  const [activeSection, setActiveSection] = useState("dashboard");

  return (
    <div className="min-h-screen bg-[#080a08] text-[#f0f0eb] font-['DM_Sans'] flex">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-[#09090b] border-r border-white/5 flex flex-col h-screen sticky top-0">
        {/* Logo */}
        <div className="border-b border-white/5 px-5 py-5">
          <MorrowLogo variant="full" priority className="h-auto w-36" />
          <p className="mt-1 text-[10px] text-white/30">Enterprise Admin</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all mb-0.5 ${
                activeSection === item.id
                  ? "bg-[#d7ff7a] text-[#17200f] font-bold"
                  : "text-white/50 hover:text-white hover:bg-white/5"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge && (
                <span className={`ml-auto text-[10px] font-bold rounded-full size-4 flex items-center justify-center ${activeSection === item.id ? "bg-[#17200f]/20 text-[#17200f]" : "bg-white/10 text-white/60"}`}>
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div className="p-3 border-t border-white/5">
          <button onClick={() => onNavigate("portal")} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-white/30 hover:text-white hover:bg-white/5 transition-all">
            <ArrowLeft size={14} /> Exit Dashboard
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen overflow-auto">
        {/* Top Bar */}
        <header className="sticky top-0 z-40 bg-[#080a08]/90 backdrop-blur-xl border-b border-white/5 px-6 py-3 flex items-center gap-4">
          <div>
            <h1 className="font-bold text-base capitalize">{NAV_ITEMS.find(n => n.id === activeSection)?.label || activeSection}</h1>
            <p className="text-xs text-white/30">Morrow Restaurant · Enterprise</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="size-8 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center hover:bg-white/10 transition-colors relative">
              <Bell size={14} className="text-white/50" />
              <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-red-500" />
            </button>
            <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-1.5">
              <div className="size-6 rounded-full bg-[#d7ff7a]/20 flex items-center justify-center text-[10px] font-bold text-[#d7ff7a]">A</div>
              <span className="text-xs font-medium">Admin</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-6">
          {renderContent(activeSection)}
        </main>
      </div>
    </div>
  );
}
