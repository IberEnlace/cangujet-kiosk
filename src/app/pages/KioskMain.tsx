import { useState } from "react";
import {
  Accessibility, ArrowRight, ChevronDown, Clock3, Flame, Heart,
  Mic, Minus, Plus, Search, ShoppingBag, Sparkles, Star, UtensilsCrossed, X
} from "lucide-react";

const burgerImage = "https://images.unsplash.com/photo-1606149059549-6042addafc5a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=1080";
const chickenImage = "https://images.unsplash.com/photo-1637710847214-f91d99669e18?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=1080";
const friesImage = "https://images.unsplash.com/photo-1551782450-17144efb9c50?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=1080";

type Item = { name: string; price: number; image: string; desc: string; tag?: string };
const menu: Item[] = [
  { name: "The Crispy", price: 8.9, image: burgerImage, desc: "Crispy chicken, pickles, signature sauce", tag: "BEST SELLER" },
  { name: "Smoky Truffle", price: 10.5, image: chickenImage, desc: "Angus beef, truffle mayo, aged cheddar", tag: "NEW" },
  { name: "Golden Fries", price: 3.5, image: friesImage, desc: "Sea salt · house seasoning" },
];

export default function KioskMain({ onBackToSelection }: { onBackToSelection?: () => void }) {
  const [activeCategory, setActiveCategory] = useState("Burgers");
  const [basket, setBasket] = useState<Item[]>([menu[0]]);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [locale, setLocale] = useState("EN");
  const total = basket.reduce((sum, item) => sum + item.price, 0);
  const add = (item: Item) => setBasket((current) => [...current, item]);
  const remove = (name: string) => setBasket((current) => { const i = current.findIndex((item) => item.name === name); return i < 0 ? current : current.filter((_, index) => index !== i); });
  const filtered = menu.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
  const categories = ["Burgers", "Chicken", "Combos", "Sides", "Drinks", "Desserts"];

  return (
    <main className="min-h-screen overflow-hidden bg-[#101310] font-['DM_Sans'] text-[#f7f5ee]">
      <div className="relative min-h-screen bg-[radial-gradient(circle_at_30%_-10%,rgba(205,255,88,.14),transparent_32%),radial-gradient(circle_at_91%_5%,rgba(255,166,61,.12),transparent_25%)] px-5 py-5 lg:px-9">
        <header className="mx-auto flex max-w-[1720px] items-center justify-between border-b border-white/10 pb-5">
          <div className="flex items-center gap-4"><div className="grid size-12 place-items-center rounded-2xl bg-[#c9f266] text-[#101310]"><UtensilsCrossed size={24}/></div><div><p className="font-['Space_Mono'] text-[10px] font-bold tracking-[.22em] text-[#c9f266]">NORTH / 27</p><p className="text-sm text-white/60">Kitchen & market</p></div></div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden rounded-full border border-white/10 px-4 py-2 text-white/60 md:block"><Clock3 className="mr-2 inline size-4 text-[#c9f266]"/>Ready in 8–12 min</span>
            <button onClick={() => setLocale(locale === "EN" ? "ع" : "EN")} className="rounded-full border border-white/15 px-4 py-2 hover:bg-white/10">{locale} <ChevronDown className="ml-1 inline size-4"/></button>
            <button className="grid size-10 place-items-center rounded-full border border-white/15 hover:bg-white/10"><Accessibility size={19}/></button>
            {onBackToSelection && (
              <button onClick={onBackToSelection} className="rounded-full bg-[#c9f266] text-[#101310] px-4 py-2 font-semibold hover:bg-[#d8ff78] transition">
                Exit Demo
              </button>
            )}
          </div>
        </header>

        <section className="mx-auto grid max-w-[1720px] grid-cols-1 gap-6 py-7 xl:grid-cols-[1fr_395px]">
          <div className="min-w-0">
            <div className="relative isolate min-h-[315px] overflow-hidden rounded-[34px] border border-white/10 bg-[#22291c] p-7 md:p-10">
              <img src={burgerImage} alt="Crispy chicken burger" className="absolute inset-0 h-full w-full object-cover opacity-70 mix-blend-luminosity" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#17200f] via-[#17200f]/78 to-[#17200f]/10"/>
              <div className="relative flex h-full max-w-xl flex-col justify-between gap-8"><div><div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#c9f266] px-3 py-1.5 font-['Space_Mono'] text-[10px] font-bold tracking-[.15em] text-[#15200a]"><Flame size={13}/> TODAY'S DROP</div><h1 className="font-['DM_Sans'] text-4xl font-semibold leading-[1.02] tracking-[-.04em] md:text-6xl">The crisp is<br/>calling.</h1><p className="mt-4 max-w-sm text-base leading-6 text-white/70">Two crunchy chicken burgers, hot fries & your choice of drink.</p></div><button onClick={() => add(menu[0])} className="group flex w-fit items-center gap-5 rounded-2xl bg-[#f7f5ee] px-5 py-3.5 font-semibold text-[#17200f] transition hover:bg-[#c9f266]">Build your meal <ArrowRight className="transition group-hover:translate-x-1"/></button></div>
              <div className="absolute bottom-7 right-8 hidden rounded-2xl border border-white/15 bg-black/25 px-5 py-4 backdrop-blur md:block"><p className="font-['Space_Mono'] text-[10px] tracking-widest text-white/55">MEAL FOR 2</p><p className="mt-1 text-xl font-semibold">$18.80 <span className="text-sm font-normal text-white/60">value</span></p></div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4"><div><p className="font-['Space_Mono'] text-[10px] font-bold tracking-[.2em] text-[#c9f266]">ORDER THE GOOD STUFF</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.025em]">What's on your mind?</h2></div><div className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[.055] px-4 py-3 md:w-80"><Search size={19} className="text-white/45"/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search the menu" className="w-full bg-transparent text-sm outline-none placeholder:text-white/40"/><Mic size={18} className="text-[#c9f266]"/></div></div>
            <nav className="mt-5 flex gap-3 overflow-x-auto pb-2">{categories.map((category) => <button key={category} onClick={() => setActiveCategory(category)} className={`shrink-0 rounded-full border px-5 py-3 text-sm font-medium transition ${activeCategory === category ? "border-[#c9f266] bg-[#c9f266] text-[#17200f]" : "border-white/10 bg-white/[.035] text-white/65 hover:border-white/30"}`}>{category}</button>)}</nav>

            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((item) => <article key={item.name} className="group overflow-hidden rounded-[26px] border border-white/10 bg-white/[.045] transition hover:-translate-y-1 hover:border-white/20"><div className="relative h-52 overflow-hidden bg-[#282b24]"><img src={item.image} alt={item.name} className="size-full object-cover transition duration-500 group-hover:scale-110"/>{item.tag && <span className="absolute left-4 top-4 rounded-full bg-[#c9f266] px-2.5 py-1 font-['Space_Mono'] text-[9px] font-bold tracking-wider text-[#17200f]">{item.tag}</span>}<button className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-black/30 backdrop-blur hover:bg-black/50"><Heart size={17}/></button></div><div className="p-5"><div className="flex items-start justify-between gap-2"><div><h3 className="text-lg font-semibold">{item.name}</h3><p className="mt-1 min-h-10 text-sm leading-5 text-white/55">{item.desc}</p></div><span className="font-['Space_Mono'] text-sm font-bold text-[#c9f266]">${item.price.toFixed(2)}</span></div><div className="mt-5 flex items-center justify-between"><span className="flex items-center gap-1 text-xs text-white/50"><Star className="size-3.5 fill-[#ffc65a] text-[#ffc65a]"/> 4.9</span><button onClick={() => add(item)} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#161916] transition hover:bg-[#c9f266]">Add to order</button></div></div></article>)}</div>
          </div>

          <aside className="flex flex-col rounded-[30px] border border-white/10 bg-[#181c17]/95 p-6 shadow-2xl shadow-black/30 xl:sticky xl:top-5 xl:h-[calc(100vh-72px)]">
            <div className="flex items-center justify-between"><div><p className="font-['Space_Mono'] text-[10px] font-bold tracking-[.2em] text-[#c9f266]">YOUR ORDER</p><h2 className="mt-1 text-2xl font-semibold">Looking delicious</h2></div><div className="grid size-10 place-items-center rounded-xl bg-white/5"><ShoppingBag size={19}/></div></div>
            <div className="my-6 h-px bg-white/10"/>
            <div className="min-h-36 flex-1 space-y-4 overflow-auto pr-1">{basket.length === 0 ? <p className="pt-10 text-center text-sm text-white/45">Your tray is waiting for something delicious.</p> : basket.map((item, index) => <div key={`${item.name}-${index}`} className="flex gap-3"><img src={item.image} alt="" className="size-16 rounded-xl object-cover"/><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="truncate font-medium">{item.name}</p><span className="font-['Space_Mono'] text-xs text-[#c9f266]">${item.price.toFixed(2)}</span></div><p className="mt-1 text-xs text-white/45">Regular · Signature sauce</p><div className="mt-2 flex items-center gap-2"><button onClick={() => remove(item.name)} className="grid size-6 place-items-center rounded-md bg-white/10"><Minus size={13}/></button><span className="w-4 text-center text-xs">1</span><button onClick={() => add(item)} className="grid size-6 place-items-center rounded-md bg-white/10"><Plus size={13}/></button></div></div></div>)}</div>
            <div className="mt-5 border-t border-white/10 pt-5"><button className="mb-4 flex w-full items-center justify-between rounded-xl bg-[#fff1d6]/10 px-4 py-3 text-left text-sm text-[#ffd890]"><span>Have a reward or code?</span><ChevronDown size={17}/></button><div className="space-y-2 text-sm text-white/55"><div className="flex justify-between"><span>Subtotal</span><span>${total.toFixed(2)}</span></div><div className="flex justify-between"><span>Estimated tax</span><span>${(total * .08).toFixed(2)}</span></div></div><div className="mt-4 flex justify-between border-t border-white/10 pt-4 text-lg font-semibold"><span>Total</span><span>${(total * 1.08).toFixed(2)}</span></div><button className="mt-5 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#c9f266] py-4 font-semibold text-[#17200f] transition hover:bg-[#d9ff86]">Continue to checkout <ArrowRight size={19}/></button><p className="mt-3 text-center text-xs text-white/35">Secure checkout · Tap to pay available</p></div>
          </aside>
        </section>
        <button onClick={() => setAssistantOpen(!assistantOpen)} className="fixed bottom-6 left-6 z-20 flex items-center gap-3 rounded-2xl border border-[#c9f266]/30 bg-[#252d1e] px-4 py-3 shadow-xl shadow-black/30 transition hover:bg-[#303c25]"><span className="grid size-8 place-items-center rounded-xl bg-[#c9f266] text-[#17200f]"><Sparkles size={17}/></span><span className="text-left text-sm font-semibold">Ask Nori<br/><small className="font-normal text-white/50">your ordering guide</small></span></button>
        {assistantOpen && <div className="fixed bottom-24 left-6 z-20 w-[min(360px,calc(100vw-48px))] rounded-3xl border border-white/10 bg-[#22281d] p-5 shadow-2xl"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Sparkles className="size-4 text-[#c9f266]"/><b>Nori, your food guide</b></div><button onClick={() => setAssistantOpen(false)}><X size={18}/></button></div><p className="mt-4 text-sm leading-5 text-white/65">Tell me what you're craving, your budget, or any dietary needs.</p><div className="mt-4 flex gap-2"><button onClick={()=>add(menu[0])} className="rounded-lg bg-white/10 px-3 py-2 text-xs">Something spicy</button><button className="rounded-lg bg-white/10 px-3 py-2 text-xs">Under $10</button></div><div className="mt-4 flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2"><input placeholder="Try: high protein meal" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/35"/><Mic className="size-4 text-[#c9f266]"/></div></div>}
      </div>
    </main>
  );
}
