import { useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Coffee, CupSoda, IceCreamBowl, Pizza, Plus, Salad, Sandwich, ShoppingBag, Soup, UtensilsCrossed } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCart } from "../../context/CartContext";
import { useLanguage } from "../../context/LanguageContext";
import MorrowLogo from "../../components/branding/MorrowLogo";
import { useDevice } from "../../context/DeviceContext";

type Product = { id: string; name: string; description: string; price: number; calories: number; badge?: string; symbol: string; image?: string };
type Category = { name: string; icon: LucideIcon; image: string };

const categories: readonly Category[] = [
  { name: "Pizza", icon: Pizza, image: "/images/category-cutouts/pizza.png" },
  { name: "Burgers", icon: Sandwich, image: "/images/category-cutouts/burgers.png" },
  { name: "Pasta", icon: Soup, image: "/images/category-cutouts/pasta.png" },
  { name: "Salads", icon: Salad, image: "/images/category-cutouts/salads.png" },
  { name: "Chicken", icon: UtensilsCrossed, image: "/images/category-cutouts/chicken.png" },
  { name: "Desserts", icon: IceCreamBowl, image: "/images/category-cutouts/desserts.png" },
  { name: "Drinks", icon: CupSoda, image: "/images/category-cutouts/drinks.png" },
  { name: "Coffee", icon: Coffee, image: "/images/category-cutouts/coffee.png" },
];

function productImage(fileName: string) { return `/images/products/${encodeURIComponent(fileName)}`; }

function createProducts(category: string, names: readonly string[], fileNumbers: readonly number[], basePrice: number, calories: number): Product[] {
  return names.map((name, index) => {
    const number = fileNumbers[index];
    const fileName = number === 1 ? `${category}.png` : `${category} (${number}).png`;
    return {
      id: `${category}-${number}`,
      name,
      description: `Freshly prepared ${name.toLowerCase()} with Morrow's signature touch`,
      price: basePrice + index,
      calories: calories + index * 45,
      symbol: name.charAt(0),
      image: productImage(fileName),
      badge: index === 0 ? "POPULAR" : undefined,
    };
  });
}

const catalog: Record<string, Product[]> = {
  Pizza: [
    { id: "margherita", name: "Morrow Margherita", description: "Tomato, fior di latte & basil", price: 8, calories: 760, badge: "VEGETARIAN", symbol: "M", image: "/images/products/pizza%20(4).png" },
    { id: "pepperoni", name: "Firehouse Pepperoni", description: "Spiced pepperoni, mozzarella & oregano", price: 10, calories: 890, badge: "POPULAR", symbol: "P", image: "/images/products/pizza%20(3).png" },
    { id: "truffle", name: "Truffle Bianca", description: "Mushroom cream, truffle & parmesan", price: 11, calories: 820, symbol: "T", image: "/images/products/pizza%20(2).png" },
    { id: "veggie", name: "Garden Roast", description: "Zucchini, peppers & fresh herbs", price: 9, calories: 690, badge: "VEGETARIAN", symbol: "G", image: "/images/products/pizza.png" },
  ],
  Burgers: createProducts("burger", ["Morrow Classic", "Smoky Beef Burger", "Crispy Chicken Burger", "Double Cheese Burger", "Garden Burger"], [1, 2, 3, 4, 5], 8, 590),
  Pasta: createProducts("pasta", ["Classic Pomodoro", "Creamy Alfredo", "Pesto Primavera", "Spicy Arrabbiata", "Mushroom Truffle Pasta"], [1, 2, 3, 4, 5], 8, 520),
  Salads: createProducts("salads", ["Morrow Garden Salad", "Caesar Crunch", "Mediterranean Salad", "Avocado Green Bowl", "Grilled Chicken Salad"], [1, 2, 3, 4, 5], 7, 260),
  Chicken: createProducts("chicken", ["Golden Chicken", "Spicy Chicken Bites", "Herb Grilled Chicken", "Crispy Chicken Plate"], [1, 2, 3, 4], 9, 510),
  Desserts: createProducts("desserts", ["Morrow Sweet Slice", "Chocolate Dream", "Berry Delight", "Caramel Cloud"], [1, 2, 4, 5], 5, 330),
  Drinks: createProducts("drink", ["Morrow Cola", "Cloud Lemonade", "Orange Splash", "Berry Fizz", "Tropical Cooler", "Mint Lime", "Peach Iced Tea", "Mango Chill", "Still Water", "Sparkling Water"], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 2, 80),
  Coffee: createProducts("coffee", ["Morrow Espresso", "Classic Americano", "Creamy Cappuccino", "Caffè Latte", "Caramel Macchiato", "Oat Cold Brew"], [1, 2, 3, 4, 5, 6], 3, 70),
};

const categoryCopy: Record<string, string> = {
  Pizza: "Stone-baked & ready", Burgers: "Big flavour, made fresh", Pasta: "Comfort in every bite", Salads: "Fresh, crisp & colourful",
  Chicken: "Golden, tender & delicious", Desserts: "One more good thing", Drinks: "Cool things, quickly", Coffee: "Freshly brewed for you",
};

const featuredCategories = categories.map(category => ({ ...category, copy: categoryCopy[category.name], itemCount: catalog[category.name]?.length ?? 0 }));

function createProductImage(symbol: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#eee8dc"/><circle cx="200" cy="200" r="112" fill="#2e6d55"/><text x="200" y="228" text-anchor="middle" font-family="Arial,sans-serif" font-size="112" font-weight="700" fill="white">${symbol}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

interface MenuCatalogProps { onBack: () => void; onCheckout: () => void; onLanguage: () => void; onNori: () => void; }

export default function MenuCatalog({ onBack, onCheckout, onLanguage, onNori }: MenuCatalogProps) {
  const { config } = useDevice();
  const { language, direction } = useLanguage();
  const { items, addItem } = useCart();
  const [category, setCategory] = useState(() => sessionStorage.getItem("morrow:nori-entry-category") ?? "Pizza");
  const [view, setView] = useState<"categories" | "products">("categories");
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<number>();
  const products = catalog[category] ?? [];
  const count = items.reduce((sum, item) => sum + item.qty, 0);
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const currency = useMemo(() => new Intl.NumberFormat(language === "tr" ? "tr-TR" : language === "ar" ? "ar-SA" : "en-US", { style: "currency", currency: "EUR" }), [language]);

  const chooseCategory = (name: string) => { setCategory(name); sessionStorage.setItem("morrow:nori-entry-category", name); setView("products"); };
  const addProduct = (product: Product) => {
    addItem({ id: `menu-${product.id}`, name: product.name, price: product.price, basePrice: product.price, calories: product.calories, category, image: product.image ?? createProductImage(product.symbol) });
    setToast(`${product.name} added`);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 1800);
  };

  const BackIcon = direction === "rtl" ? ChevronRight : ChevronLeft;
  return (
    <main dir={direction} className="min-h-[100dvh] bg-[#050705] font-['DM_Sans'] text-[#f8f8f3]">
      <div className="relative mx-auto min-h-[100dvh] w-full max-w-[900px] overflow-hidden bg-[#0b1009] shadow-2xl shadow-black/40">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_10%,rgba(215,255,122,.08),transparent_28%),linear-gradient(145deg,#10160d,#080b08_70%)]" aria-hidden="true" />
        <header className="sticky top-0 z-30 flex h-[clamp(4.6rem,7vh,6rem)] items-center justify-between border-b border-white/10 bg-[#0b1009]/92 px-3 backdrop-blur-xl sm:px-5">
          <button type="button" onClick={onBack} aria-label="Back to service selection" className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 active:scale-95 focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#d7ff7a]"><BackIcon size={23} aria-hidden="true" /></button>
          <div className="text-center" dir="ltr"><MorrowLogo variant="full" className="hidden h-auto w-28 sm:block" /><MorrowLogo variant="symbol" className="mx-auto size-9 object-contain sm:hidden" alt="" /><p className="mt-0.5 text-[10px] text-white/40">{language === "ar" ? "طلبك الجديد" : language === "tr" ? "Yeni siparişiniz" : "Your new order"}</p></div>
          <div className="flex items-center gap-2">{config?.settings.aiAssistantEnabled && <button type="button" onClick={onNori} className="hidden min-h-11 rounded-xl border border-[#D7FB69]/25 bg-[#D7FB69]/8 px-3 text-xs font-bold text-[#D7FB69] min-[560px]:block">Ask Nori</button>}<button type="button" onClick={onLanguage} className="min-h-11 min-w-11 rounded-xl border border-white/10 bg-white/5 px-2 text-xs font-bold uppercase text-white/70 focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#d7ff7a]">{language}</button><button type="button" onClick={onCheckout} aria-label={`Open cart with ${count} items`} className="relative grid size-12 place-items-center rounded-2xl bg-[#d7ff7a] text-[#17200f] focus-visible:outline focus-visible:outline-4 focus-visible:outline-white"><ShoppingBag size={20} aria-hidden="true" />{count > 0 && <span className="absolute -end-1 -top-1 grid size-5 place-items-center rounded-full bg-[#ffb86c] text-[10px] font-bold text-[#34240e]">{count}</span>}</button></div>
        </header>

        <div className="grid min-h-[calc(100dvh-5rem)] grid-cols-[88px_minmax(0,1fr)] sm:grid-cols-[120px_minmax(0,1fr)]">
          <aside className="relative border-e border-white/10 bg-[#0e130c] p-2 pb-28"><p className="px-2 pb-2 pt-2 font-['Space_Mono'] text-[8px] tracking-[.14em] text-white/35">MENU</p><nav className="space-y-2" aria-label="Menu categories">{categories.map(({ name, icon: Icon }) => <button type="button" key={name} onClick={() => chooseCategory(name)} aria-pressed={category === name} className={`flex min-h-[78px] w-full flex-col items-center justify-center rounded-2xl border px-1 py-2 transition active:scale-95 focus-visible:outline focus-visible:outline-3 focus-visible:outline-[#d7ff7a] ${category === name ? "border-[#d7ff7a]/50 bg-[#d7ff7a]/10 shadow-[0_5px_20px_rgba(215,255,122,.08)]" : "border-transparent hover:bg-white/5"}`}><span className={`grid size-11 place-items-center rounded-full ${category === name ? "bg-[#d7ff7a] text-[#17200f]" : "bg-white/5 text-white/45"}`}><Icon size={21} aria-hidden="true" /></span><span className={`mt-1.5 text-[9px] leading-3 sm:text-[10px] ${category === name ? "font-bold text-[#d7ff7a]" : "text-white/45"}`}>{name}</span></button>)}</nav></aside>

          <section className="relative min-w-0 pb-28"><div className="p-3 sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-['Space_Mono'] text-[8px] tracking-[.14em] text-[#d7ff7a] sm:text-[9px]">{view === "products" ? "CATEGORY SELECTED" : "CHOOSE A CATEGORY"}</p><h1 className="mt-1 text-[clamp(1.45rem,4vw,2.2rem)] font-semibold tracking-[-.04em] text-white">{view === "products" ? category : "What are you craving?"}</h1></div><button type="button" onClick={() => setView("categories")} className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/55">Categories</button></div>
            {view === "categories" ? <CategoryLanding onChoose={chooseCategory} selected={category} /> : <ProductGrid products={products} currency={currency} onAdd={addProduct} />}
          </div></section>
        </div>

        <footer className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[900px] border-t border-white/10 bg-[#0b1009]/95 p-3 backdrop-blur-xl"><div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-xs text-white/40">{count ? `${count} item${count > 1 ? "s" : ""} in your order` : "Your cart is empty"}</p><p className="text-xl font-semibold text-white">{currency.format(total)}</p></div><button type="button" onClick={onCheckout} disabled={!count} className="min-h-14 rounded-2xl bg-[#d7ff7a] px-4 text-sm font-bold text-[#17200f] disabled:bg-white/10 disabled:text-white/25 sm:px-6">{count ? `Checkout · ${currency.format(total)}` : "Checkout"}</button></div></footer>
        {toast && <div role="status" className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-2xl bg-[#25372c] px-4 py-3 text-sm text-white shadow-xl"><span className="grid size-6 place-items-center rounded-lg bg-[#b8df83] text-[#21341f]"><Check size={14} aria-hidden="true" /></span>{toast}</div>}
      </div>
    </main>
  );
}

function CategoryLanding({ onChoose, selected }: { onChoose: (name: string) => void; selected: string }) {
  return <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-5 min-[560px]:grid-cols-2">{featuredCategories.map(({ name, copy, icon: Icon, image, itemCount }) => {
    const isSelected = selected === name;
    return <button type="button" key={name} onClick={() => onChoose(name)} aria-pressed={isSelected} className="group relative h-[clamp(11rem,20vh,13.5rem)] overflow-visible rounded-[24px] text-start transition duration-300 ease-out hover:-translate-y-1.5 hover:scale-[1.03] active:scale-[.99] focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#d7ff7a]">
      <span className={`absolute inset-0 overflow-hidden rounded-[24px] border transition duration-300 ${isSelected ? "border-[#d7ff7a]/70 bg-[#17200f] shadow-[0_16px_38px_rgba(120,170,62,.14)]" : "border-white/[.09] bg-[#10150f] shadow-[0_12px_30px_rgba(0,0,0,.22)] group-hover:border-[#d7ff7a]/30 group-hover:bg-[#131a11] group-hover:shadow-[0_18px_42px_rgba(120,170,62,.14)]"}`}>
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_76%_30%,rgba(215,251,105,.18),transparent_43%),linear-gradient(145deg,rgba(255,255,255,.035),transparent_55%)]" aria-hidden="true" />
        <span className="absolute inset-x-0 bottom-0 z-10 h-[72%] bg-gradient-to-t from-[#080b08] via-[#080b08]/78 to-transparent" aria-hidden="true" />
        {isSelected && <span className="absolute inset-x-5 top-0 z-30 h-0.5 rounded-b-full bg-[#d7ff7a] shadow-[0_0_12px_rgba(215,251,105,.42)]" aria-hidden="true" />}
      </span>
      <img src={image} alt="" className="pointer-events-none absolute -end-[4%] -top-[10%] z-[5] h-[82%] w-[62%] object-contain drop-shadow-[0_16px_14px_rgba(0,0,0,.34)] transition duration-500 ease-out group-hover:-translate-y-1.5 group-hover:translate-x-1 group-hover:scale-[1.045]" />
      <span className="absolute inset-x-5 bottom-5 z-20">
        <span className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-xl border border-[#d7ff7a]/20 bg-[#d7ff7a]/10 text-[#d7ff7a]"><Icon size={16} strokeWidth={1.8} aria-hidden="true" /></span><strong className="text-xl font-bold tracking-[-.025em] text-white">{name}</strong></span>
        <span className="mt-2 block max-w-[72%] text-[11px] leading-4 text-white/52">{copy}</span>
        <span className="mt-2 block font-['Space_Mono'] text-[9px] font-bold uppercase tracking-[.13em] text-[#d7ff7a]/80">{itemCount} Items</span>
      </span>
    </button>;
  })}</div>;
}

function ProductGrid({ products, currency, onAdd }: { products: Product[]; currency: Intl.NumberFormat; onAdd: (product: Product) => void }) {
  return <div className="mt-5 grid grid-cols-1 gap-3 min-[560px]:grid-cols-2">{products.map(product => <article key={product.id} className="relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[.045] p-3 shadow-[0_12px_30px_rgba(0,0,0,.18)]"><div className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-[18px] bg-[radial-gradient(circle_at_40%_35%,rgba(215,255,122,.13),rgba(255,255,255,.025))]">{product.image ? <img src={product.image} alt={product.name} className="absolute inset-0 size-full object-contain p-2" /> : <span className="grid size-20 place-items-center rounded-full bg-[#d7ff7a] text-4xl font-black text-[#17200f] shadow-xl shadow-[#d7ff7a]/10">{product.symbol}</span>}{product.badge && <span className="absolute start-2 top-2 z-10 rounded-full bg-[#d7ff7a] px-2 py-1 font-['Space_Mono'] text-[8px] font-bold tracking-wider text-[#17200f]">{product.badge}</span>}</div><h2 className="mt-3 text-[15px] font-semibold leading-5 text-white">{product.name}</h2><p className="mt-1 min-h-8 text-[11px] leading-4 text-white/40">{product.description}</p><div className="mt-3 flex items-end justify-between"><div><b className="text-[#d7ff7a]">{currency.format(product.price)}</b><small className="block text-[10px] text-white/30">{product.calories} kcal</small></div><button type="button" onClick={() => onAdd(product)} aria-label={`Add ${product.name}`} className="grid size-12 place-items-center rounded-xl bg-[#d7ff7a] text-[#17200f] transition active:scale-95 focus-visible:outline focus-visible:outline-4 focus-visible:outline-white"><Plus size={20} aria-hidden="true" /></button></div></article>)}</div>;
}
