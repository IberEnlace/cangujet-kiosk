import { BarChart3, ChefHat, Monitor, ShoppingBag, Store, Utensils, Check } from "lucide-react";
import { useState } from "react";
import type { DeviceMode } from "../auth/roleConfig";

type Props = { onSelect: (mode: Exclude<DeviceMode, "unassigned">, remember: boolean) => void };

const ROLES = [
  { id: "customer", name: "Customer Kiosk", description: "Start a new order without signing in.", icon: Utensils, color: "#d7ff7a", defaultRemember: true },
  { id: "admin", name: "Admin", description: "Manage sales, menu, inventory, staff, branches, and reports.", icon: BarChart3, color: "#60a5fa", defaultRemember: false },
  { id: "cashier", name: "Cashier", description: "Create orders, accept payments, print receipts, and manage the register.", icon: Store, color: "#a78bfa", defaultRemember: false },
  { id: "kitchen", name: "Kitchen", description: "View incoming orders and manage preparation status.", icon: ChefHat, color: "#fb923c", defaultRemember: false },
  { id: "display", name: "Order Display", description: "Show preparing and ready order numbers on a public screen.", icon: Monitor, color: "#34d399", defaultRemember: true },
] as const;

export default function RoleSelection({ onSelect }: Props) {
  const [selected, setSelected] = useState<(typeof ROLES)[number]["id"] | null>(null);
  const [remember, setRemember] = useState(true);
  const choose = (role: typeof ROLES[number]) => { setSelected(role.id); setRemember(role.defaultRemember); };

  return <main className="min-h-screen bg-[#07090a] text-[#f0f0eb] font-['DM_Sans'] px-6 py-8 flex flex-col relative overflow-hidden">
    <div className="absolute inset-0 pointer-events-none"><div className="absolute -top-40 left-1/3 size-[600px] bg-[#d7ff7a]/5 rounded-full blur-[140px]" /><div className="absolute -bottom-40 right-0 size-[520px] bg-blue-500/5 rounded-full blur-[130px]" /></div>
    <header className="relative max-w-7xl w-full mx-auto flex items-center gap-3">
      <div className="size-12 rounded-2xl bg-[#d7ff7a] text-[#17200f] grid place-items-center shadow-lg shadow-[#d7ff7a]/20"><ShoppingBag size={21} /></div>
      <div><h1 className="font-black text-xl">Morrow</h1><p className="text-xs text-white/35">Restaurant Operating Platform</p></div>
    </header>
    <section className="relative flex-1 flex flex-col justify-center max-w-7xl w-full mx-auto py-10">
      <div className="mb-8"><span className="text-xs font-bold tracking-widest uppercase text-[#d7ff7a]">Device setup</span><h2 className="text-4xl md:text-5xl font-black mt-3 tracking-tight">How will this device be used?</h2><p className="text-white/45 mt-3 max-w-2xl">Choose one workspace. Each role opens a focused application with only the tools it needs.</p></div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {ROLES.map(role => { const Icon = role.icon; const active = selected === role.id; return <button key={role.id} onClick={() => choose(role)} className={`text-left min-h-64 rounded-3xl border p-5 flex flex-col transition-all hover:-translate-y-1 ${active ? "bg-white/[0.08] border-white/25 shadow-2xl" : "bg-white/[0.025] border-white/8 hover:bg-white/[0.05] hover:border-white/15"}`}>
          <div className="size-13 rounded-2xl grid place-items-center border" style={{ color: role.color, backgroundColor: `${role.color}14`, borderColor: `${role.color}30` }}><Icon size={24} /></div>
          <div className="mt-auto"><h3 className="font-bold text-lg">{role.name}</h3><p className="text-sm text-white/40 leading-relaxed mt-2">{role.description}</p><span className="inline-block mt-5 text-xs font-bold" style={{ color: role.color }}>{active ? "Selected" : "Select workspace"} →</span></div>
        </button>; })}
      </div>
      {selected && <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-4 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <button onClick={() => setRemember(v => !v)} className="flex items-center gap-3 text-left"><span className={`size-6 rounded-lg border grid place-items-center ${remember ? "bg-[#d7ff7a] border-[#d7ff7a] text-[#17200f]" : "border-white/20"}`}>{remember && <Check size={15} />}</span><span><strong className="block text-sm">Remember this device mode</strong><small className="text-white/35">Automatically reopen this workspace after restart.</small></span></button>
        <button onClick={() => onSelect(selected, remember)} className="px-7 py-3.5 rounded-2xl bg-[#d7ff7a] text-[#17200f] font-black hover:bg-[#c8f060] transition">Continue to {ROLES.find(r => r.id === selected)?.name}</button>
      </div>}
    </section>
  </main>;
}
