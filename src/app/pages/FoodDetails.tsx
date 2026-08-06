import { useState } from "react";
import {
  ChevronLeft, Star, Clock, AlertTriangle, Plus, Minus, Check,
  Heart, ShoppingBag, Award, ArrowRight
} from "lucide-react";
import { useCart } from "../context/CartContext";

// Premium Burger Images
const images = [
  "https://images.unsplash.com/photo-1606149059549-6042addafc5a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=1200", // Main Hero
  "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=800",   // Detail 2
  "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=800"    // Detail 3
];

export default function FoodDetails({ onBackToSelection }: { onBackToSelection?: () => void }) {
  const { addItem } = useCart();
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [quantity, setQuantity] = useState(1);

  // Customization Options States
  const [bread, setBread] = useState("brioche"); // brioche (+$0), sesame (+$0.5), gluten-free (+$1.5)
  const [size, setSize] = useState("double"); // single (+$0), double (+$2.5), triple (+$4.5)
  const [cheese, setCheese] = useState<string[]>(["cheddar"]); // cheddar (+$0.8), swiss (+$0.8), pepperjack (+$1.0)
  const [sauces, setSauces] = useState<string[]>(["signature"]); // signature (+$0), smoky-bbq (+$0.3), spicy-mayo (+$0.3)
  const [extraMeat, setExtraMeat] = useState(0); // number of extra patties (+$3.00 each)
  const [vegetables, setVegetables] = useState<string[]>(["lettuce", "tomato", "pickles"]); // lettuce, tomato, pickles, grilled-onion
  const [cookingPref, setCookingPref] = useState("medium"); // medium-rare, medium, well-done
  const [specialNotes, setSpecialNotes] = useState("");

  // Base Price
  const basePrice = 8.90;

  // Calculate Extra Costs dynamically
  const getCustomizationPrice = () => {
    let extra = 0;
    
    // Bread pricing
    if (bread === "sesame") extra += 0.50;
    if (bread === "gluten-free") extra += 1.50;

    // Size pricing
    if (size === "double") extra += 2.50;
    if (size === "triple") extra += 4.50;

    // Cheese pricing
    extra += cheese.length * 0.80;

    // Extra Sauce pricing (first sauce is free, subsequent are +$0.30)
    if (sauces.length > 1) {
      extra += (sauces.length - 1) * 0.30;
    }

    // Extra Meat pricing
    extra += extraMeat * 3.00;

    return extra;
  };

  const unitPrice = basePrice + getCustomizationPrice();
  const totalPrice = unitPrice * quantity;

  return (
    <main className="relative flex min-h-screen flex-col justify-between bg-[#F8F9FA] text-[#1F1F1F] selection:bg-[#C41E19]/10">
      
      {/* Background Ambience */}
      <div className="pointer-events-none absolute right-1/4 top-0 size-[700px] rounded-full bg-[#C41E19]/[.025]" />
      <div className="pointer-events-none absolute bottom-1/4 left-1/4 size-[500px] rounded-full bg-white" />

      {/* Header */}
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between border-b border-[#ECECEC] bg-white px-6 py-6">
        <div className="flex items-center gap-4">
          {onBackToSelection && (
            <button 
              onClick={onBackToSelection}
              className="flex items-center justify-center rounded-xl border border-[#ECECEC] bg-white p-3 text-[#1F1F1F] shadow-sm transition hover:bg-[#F8F9FA] hover:shadow-md active:scale-[.98]"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold tracking-tight">The Crispy Nori Burger</h1>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#C41E19]">Gourmet Customizer</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full border border-[#ECECEC] bg-white px-3.5 py-2 text-xs font-medium text-[#6B7280]">
            <span className="size-2 rounded-full bg-[#C41E19]" /> Live Stock: 14 left
          </span>
          <button 
            onClick={() => setIsLiked(!isLiked)}
            className="flex items-center justify-center rounded-xl border border-[#ECECEC] bg-white p-3 text-[#1F1F1F] shadow-sm transition hover:bg-[#F8F9FA] hover:shadow-md active:scale-[.98]"
          >
            <Heart size={20} className={isLiked ? "fill-[#C41E19] text-[#C41E19]" : "text-[#6B7280]"} />
          </button>
        </div>
      </header>

      {/* Layout Content */}
      <section className="flex-1 w-full max-w-7xl mx-auto px-6 py-8 grid lg:grid-cols-12 gap-8 relative z-10 items-start">
        
        {/* Left Side: Product Gallery & Nutrition (Lg: col-span-5) */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-8">
          
          {/* Main Large Hero Image */}
          <div className="group relative aspect-square overflow-hidden rounded-2xl border border-[#ECECEC] bg-white shadow-[0_8px_24px_rgba(31,31,31,.08)]">
            <img 
              src={images[activeImageIdx]} 
              alt="Crispy Nori Burger" 
              className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
            <span className="absolute bottom-6 left-6 flex items-center gap-2 rounded-full border border-[#C41E19]/20 bg-white/90 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#C41E19] backdrop-blur-md">
              <Award size={14} /> Signature Selection
            </span>
          </div>

          {/* Multiple Gallery Image Thumbnails */}
          <div className="grid grid-cols-3 gap-4">
            {images.map((img, idx) => (
              <button 
                key={idx}
                onClick={() => setActiveImageIdx(idx)}
                className={`relative aspect-video overflow-hidden rounded-2xl border bg-white transition-all ${
                  activeImageIdx === idx 
                    ? "scale-[1.02] border-[#C41E19] shadow-md"
                    : "border-[#ECECEC] opacity-60 hover:opacity-100"
                }`}
              >
                <img src={img} alt="burger thumbnail" className="size-full object-cover" />
              </button>
            ))}
          </div>

          {/* Core Info & Metadata */}
          <div className="space-y-4 rounded-2xl border border-[#ECECEC] bg-white p-6 shadow-sm transition hover:shadow-md">
            <div className="flex justify-between items-center text-sm">
              <span className="flex items-center gap-1.5 text-[#6B7280]"><Clock size={16} className="text-[#C41E19]"/> Prep Time</span>
              <b className="font-semibold text-[#1F1F1F]">8–12 minutes</b>
            </div>
            
            <div className="flex justify-between items-center text-sm">
              <span className="flex items-center gap-1.5 text-[#6B7280]"><Star size={16} className="fill-[#C41E19] text-[#C41E19]"/> Rating & Reviews</span>
              <b className="font-semibold text-[#1F1F1F]">4.9 <span className="font-normal text-[#6B7280]">(184 reviews)</span></b>
            </div>

            <div className="flex justify-between items-start text-sm">
              <span className="flex shrink-0 items-center gap-1.5 text-[#6B7280]"><AlertTriangle size={16} className="text-[#C41E19]"/> Allergens</span>
              <div className="flex flex-wrap justify-end gap-1.5">
                {["Gluten", "Sesame", "Soy"].map(a => (
                  <span key={a} className="rounded border border-[#C41E19]/25 bg-white px-2 py-0.5 text-[10px] font-bold text-[#C41E19]">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Nutrition Info Cards */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Calories", value: "520 kcal", sub: "26% DV", color: "text-[#C41E19]" },
              { label: "Protein", value: "32g", sub: "64% DV", color: "text-[#C41E19]" },
              { label: "Fat", value: "18g", sub: "23% DV", color: "text-[#1F1F1F]" },
              { label: "Carbs", value: "48g", sub: "16% DV", color: "text-[#1F1F1F]" }
            ].map(nut => (
              <div key={nut.label} className="rounded-2xl border border-[#ECECEC] bg-white p-4 text-center shadow-sm">
                <span className="block text-[10px] uppercase tracking-wider text-[#6B7280]">{nut.label}</span>
                <b className={`text-sm block mt-1.5 ${nut.color}`}>{nut.value}</b>
                <span className="mt-0.5 block text-[9px] text-[#9CA3AF]">{nut.sub}</span>
              </div>
            ))}
          </div>

        </div>

        {/* Right Side: Product Customization Form (Lg: col-span-7) */}
        <div className="lg:col-span-7 space-y-8 pb-32">
          
          {/* Title & Description */}
          <div className="space-y-4">
            <h2 className="text-4xl font-bold leading-tight tracking-tight text-[#1F1F1F]">The Crispy Nori Burger</h2>
            <p className="text-base leading-relaxed text-[#6B7280]">
              Crispy seasoned chicken breast, premium toasted bun, fresh kelp seaweed sheets, crunchy pickled cucumber slices, and our house-formulated spicy roasted garlic signature mayonnaise.
            </p>
            <div>
              <span className="block text-xs font-bold uppercase tracking-widest text-[#C41E19]">Standard Ingredients</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {["Artisan Bun", "Seasoned Chicken Breast", "Kelp Seaweed Sheets", "Pickled Cucumber", "Roasted Garlic Mayo"].map((ing) => (
                  <span key={ing} className="rounded-xl border border-[#ECECEC] bg-white px-3.5 py-2 text-xs text-[#1F1F1F] shadow-sm">
                    {ing}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 1. Bun Customization */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[#C41E19]">
              <span className="size-1.5 rounded-full bg-[#C41E19]" /> 1. Select Bakery Bread
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: "brioche", label: "Brioche Bun", extra: "+$0.00" },
                { id: "sesame", label: "Sesame Bun", extra: "+$0.50" },
                { id: "gluten-free", label: "Gluten-Free Bun", extra: "+$1.50" }
              ].map(x => (
                <button
                  key={x.id}
                  onClick={() => setBread(x.id)}
                  className={`rounded-2xl border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                    bread === x.id 
                      ? "border-[#C41E19] bg-[#C41E19]/5"
                      : "border-[#ECECEC] bg-white hover:bg-[#F8F9FA]"
                  }`}
                >
                  <b className="block text-sm text-[#1F1F1F]">{x.label}</b>
                  <span className="mt-1 block text-xs font-medium text-[#C41E19]">{x.extra}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Size Customization */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[#C41E19]">
              <span className="size-1.5 rounded-full bg-[#C41E19]" /> 2. Choose Burger Size
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: "single", label: "Single Patty", extra: "+$0.00" },
                { id: "double", label: "Double Patty", extra: "+$2.50" },
                { id: "triple", label: "Triple Patty", extra: "+$4.50" }
              ].map(x => (
                <button
                  key={x.id}
                  onClick={() => setSize(x.id)}
                  className={`rounded-2xl border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                    size === x.id 
                      ? "border-[#C41E19] bg-[#C41E19]/5"
                      : "border-[#ECECEC] bg-white hover:bg-[#F8F9FA]"
                  }`}
                >
                  <b className="block text-sm text-[#1F1F1F]">{x.label}</b>
                  <span className="mt-1 block text-xs font-medium text-[#C41E19]">{x.extra}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Cheese Customization */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[#C41E19]">
              <span className="size-1.5 rounded-full bg-[#C41E19]" /> 3. Add Premium Cheese (+$0.80 each)
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: "cheddar", label: "Aged Cheddar" },
                { id: "swiss", label: "Swiss Cheese" },
                { id: "pepperjack", label: "Spicy Pepperjack" }
              ].map(x => {
                const isActive = cheese.includes(x.id);
                return (
                  <button
                    key={x.id}
                    onClick={() => {
                      setCheese(prev => isActive ? prev.filter(c => c !== x.id) : [...prev, x.id]);
                    }}
                    className={`flex items-start justify-between rounded-2xl border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                      isActive 
                      ? "border-[#C41E19] bg-[#C41E19]/5"
                      : "border-[#ECECEC] bg-white hover:bg-[#F8F9FA]"
                    }`}
                  >
                    <div>
                      <b className="block text-sm text-[#1F1F1F]">{x.label}</b>
                      <span className="mt-1 block text-xs font-medium text-[#C41E19]">+$0.80</span>
                    </div>
                    <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border ${isActive ? "border-[#C41E19] bg-[#C41E19] text-white" : "border-[#ECECEC]"}`}>
                      {isActive && <Check size={10} strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Sauce Preferences */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[#C41E19]">
              <span className="size-1.5 rounded-full bg-[#C41E19]" /> 4. Select Sauces (First free, extra +$0.30)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { id: "signature", label: "Signature Mayo" },
                { id: "smoky-bbq", label: "Smoky BBQ" },
                { id: "spicy-mayo", label: "Spicy Relish" },
                { id: "honey-mustard", label: "Honey Mustard" }
              ].map(x => {
                const isActive = sauces.includes(x.id);
                const isExtraCost = sauces.length > 0 && !isActive;
                return (
                  <button
                    key={x.id}
                    onClick={() => {
                      setSauces(prev => isActive ? prev.filter(s => s !== x.id) : [...prev, x.id]);
                    }}
                    className={`rounded-2xl border p-4 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                      isActive 
                        ? "border-[#C41E19] bg-[#C41E19]/5 text-[#1F1F1F]"
                        : "border-[#ECECEC] bg-white text-[#6B7280] hover:bg-[#F8F9FA]"
                    }`}
                  >
                    <b className="text-xs block truncate">{x.label}</b>
                    <span className="mt-1 block text-[10px] text-[#6B7280]">{isExtraCost ? "+$0.30" : "Free"}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Extra Meat Patty */}
          <div className="flex items-center justify-between rounded-2xl border border-[#ECECEC] bg-white p-6 shadow-sm transition hover:shadow-md">
            <div>
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[#C41E19]">
                Extra Crispy Patty
              </h3>
              <p className="mt-1 text-xs text-[#6B7280]">Add additional hand-breaded chicken breast (+$3.00 each)</p>
            </div>
            <div className="flex items-center gap-4 rounded-xl border border-[#ECECEC] bg-[#F8F9FA] p-2">
              <button 
                onClick={() => setExtraMeat(prev => Math.max(0, prev - 1))}
                className="flex size-8 items-center justify-center rounded-lg border border-[#ECECEC] bg-white text-[#1F1F1F] transition hover:border-[#C41E19]/25 hover:text-[#C41E19] active:scale-[.96]"
              >
                <Minus size={14} />
              </button>
              <b className="w-6 text-center text-sm text-[#1F1F1F]">{extraMeat}</b>
              <button 
                onClick={() => setExtraMeat(prev => prev + 1)}
                className="flex size-8 items-center justify-center rounded-lg border border-[#ECECEC] bg-white text-[#1F1F1F] transition hover:border-[#C41E19]/25 hover:text-[#C41E19] active:scale-[.96]"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* 6. Fresh Vegetables */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[#C41E19]">
              <span className="size-1.5 rounded-full bg-[#C41E19]" /> 5. Fresh Vegetables (Included)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { id: "lettuce", label: "Koji Lettuce" },
                { id: "tomato", label: "Vine Tomato" },
                { id: "pickles", label: "Crunchy Pickles" },
                { id: "onion", label: "Grilled Onion" }
              ].map(x => {
                const isActive = vegetables.includes(x.id);
                return (
                  <button
                    key={x.id}
                    onClick={() => {
                      setVegetables(prev => isActive ? prev.filter(v => v !== x.id) : [...prev, x.id]);
                    }}
                    className={`rounded-2xl border p-4 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                      isActive 
                        ? "border-[#C41E19] bg-[#C41E19]/5 text-[#1F1F1F]"
                        : "border-[#ECECEC] bg-white text-[#6B7280] hover:bg-[#F8F9FA]"
                    }`}
                  >
                    <b className="text-xs block">{x.label}</b>
                    <span className="mt-1 block text-[10px] text-[#C41E19]">{isActive ? "Added" : "Excluded"}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 7. Cooking Preference */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[#C41E19]">
              <span className="size-1.5 rounded-full bg-[#C41E19]" /> 6. Patty Cooking Doneness
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: "medium-rare", label: "Medium-Rare" },
                { id: "medium", label: "Medium Done" },
                { id: "well-done", label: "Well-Done" }
              ].map(x => (
                <button
                  key={x.id}
                  onClick={() => setCookingPref(x.id)}
                  className={`rounded-2xl border p-4 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                    cookingPref === x.id 
                      ? "border-[#C41E19] bg-[#C41E19]/5 text-[#1F1F1F]"
                      : "border-[#ECECEC] bg-white text-[#6B7280] hover:bg-[#F8F9FA]"
                  }`}
                >
                  <b className="text-xs block">{x.label}</b>
                </button>
              ))}
            </div>
          </div>

          {/* 8. Special Preparation Notes */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[#C41E19]">
              <span className="size-1.5 rounded-full bg-[#C41E19]" /> 7. Special Notes
            </h3>
            <textarea 
              rows={3}
              placeholder="E.g., No sauce on bottom bun, extra wrap, cut in half..."
              value={specialNotes}
              onChange={e => setSpecialNotes(e.target.value)}
              className="w-full rounded-xl border border-[#ECECEC] bg-white p-4 text-sm text-[#1F1F1F] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#C41E19] focus:ring-4 focus:ring-[#C41E19]/10"
            />
          </div>

        </div>

      </section>

      {/* Sticky Bottom Add To Cart Bar */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#ECECEC] bg-white/95 px-8 py-6 shadow-[0_-8px_24px_rgba(31,31,31,.08)] backdrop-blur-lg">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          
          {/* Quantity Selector & Item Cost */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 rounded-xl border border-[#ECECEC] bg-[#F8F9FA] p-2">
              <button 
                onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
                className="flex size-10 items-center justify-center rounded-lg border border-[#ECECEC] bg-white text-[#1F1F1F] transition hover:border-[#C41E19]/25 hover:text-[#C41E19] active:scale-95"
              >
                <Minus size={16} />
              </button>
              <b className="w-8 text-center text-base text-[#1F1F1F]">{quantity}</b>
              <button 
                onClick={() => setQuantity(prev => prev + 1)}
                className="flex size-10 items-center justify-center rounded-lg border border-[#ECECEC] bg-white text-[#1F1F1F] transition hover:border-[#C41E19]/25 hover:text-[#C41E19] active:scale-95"
              >
                <Plus size={16} />
              </button>
            </div>

            <div>
              <span className="block text-xs font-medium uppercase tracking-wider text-[#6B7280]">Customized Total</span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <b className="text-3xl text-[#C41E19]">${totalPrice.toFixed(2)}</b>
                <span className="text-xs text-[#6B7280]">(${unitPrice.toFixed(2)} each)</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-4 w-full sm:w-auto">
            {onBackToSelection && (
              <button 
                onClick={onBackToSelection}
                className="flex-1 rounded-xl border border-[#ECECEC] bg-white px-6 py-4 text-sm font-semibold text-[#1F1F1F] shadow-sm transition hover:bg-[#F8F9FA] hover:shadow-md active:scale-[.98] sm:flex-none"
              >
                Cancel
              </button>
            )}
            <button 
              onClick={() => {
                const customizations = { bread, size, cheese: cheese.join(", "), sauces: sauces.join(", "), vegetables: vegetables.join(", "), cooking: cookingPref, notes: specialNotes };
                for (let index = 0; index < quantity; index += 1) addItem({ id: `custom-nori-${JSON.stringify(customizations)}`, name: "Customized Crispy Nori Burger", price: unitPrice, basePrice, image: images[0], category: "burger", customizations });
                if (onBackToSelection) onBackToSelection();
              }}
              className="group flex flex-2 items-center justify-center gap-2 rounded-xl bg-[#C41E19] px-10 py-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(196,30,25,.18)] transition hover:-translate-y-0.5 hover:bg-[#A8161A] hover:shadow-md active:translate-y-0 active:scale-[0.98] sm:flex-none"
            >
              <ShoppingBag size={18} /> Add to Order <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

        </div>
      </div>

    </main>
  );
}
