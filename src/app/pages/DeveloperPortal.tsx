import { BarChart3, ChefHat, Code2, CreditCard, Monitor, Package, ShoppingCart, Sparkles, Store, User, Utensils } from "lucide-react";
import MorrowLogo from "../components/branding/MorrowLogo";

const MODULES = [
  ["/kiosk","Customer Journey","Complete kiosk ordering flow",Utensils], ["/cart","Shopping Cart","Cart, coupons and rewards",ShoppingCart],
  ["/payment","Payment Flow","All simulated payment methods",CreditCard], ["/tracking","Order Tracking","Live customer order status",Package],
  ["/admin","Admin Dashboard","Analytics and restaurant management",BarChart3], ["/cashier","Cashier Register","POS and shift tools",Store],
  ["/kitchen","Kitchen Display","Kitchen operations board",ChefHat], ["/display","Public Display","Preparing and ready numbers",Monitor],
  ["/select-role","Role Selection","Production startup experience",User], ["/device-setup","Device Setup","Protected device assignment",Code2],
] as const;
export default function DeveloperPortal({ navigate }: { navigate: (route: string) => void }) {
  return <main className="min-h-screen bg-[#07090a] text-white p-8 pb-24 font-['DM_Sans']"><div className="max-w-6xl mx-auto"><header className="py-5 flex items-center justify-between"><div><MorrowLogo variant="full" priority className="h-auto w-44" /><p className="mt-1 text-xs text-white/35">Developer Portal · Internal module gallery</p></div><span className="text-xs text-[#d7ff7a] bg-[#d7ff7a]/10 border border-[#d7ff7a]/20 px-3 py-1 rounded-full"><Sparkles size={11} className="inline mr-1"/>Development</span></header><section className="mt-12"><h2 className="text-4xl font-black">System modules</h2><p className="text-white/40 mt-2">Open any module directly for development and presentation.</p><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">{MODULES.map(([route,name,desc,Icon])=><button key={route} onClick={()=>navigate(route)} className="rounded-3xl min-h-48 p-5 text-left border border-white/8 bg-white/[0.025] hover:bg-white/[0.06] hover:-translate-y-1 transition-all"><div className="size-11 rounded-2xl bg-white/5 text-[#d7ff7a] grid place-items-center"><Icon size={20}/></div><h3 className="font-bold mt-8">{name}</h3><p className="text-xs text-white/35 mt-1">{desc}</p><code className="text-[10px] text-white/20 block mt-4">#{route}</code></button>)}</div></section></div></main>;
}
