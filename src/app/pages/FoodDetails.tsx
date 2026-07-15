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
    <main className="min-h-screen bg-[#090b08] text-[#f7f5ee] font-['DM_Sans'] flex flex-col justify-between relative selection:bg-[#d7ff7a]/30">
      
      {/* Background Ambience */}
      <div className="absolute top-0 right-1/4 w-[700px] h-[700px] bg-[#d7ff7a]/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-[500px] h-[500px] bg-[#ff9e3b]/3 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between border-b border-white/5 relative z-10">
        <div className="flex items-center gap-4">
          {onBackToSelection && (
            <button 
              onClick={onBackToSelection}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-white/80 transition flex items-center justify-center border border-white/10"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold tracking-tight">The Crispy Nori Burger</h1>
            <p className="text-xs text-[#d7ff7a] font-mono tracking-widest uppercase">Gourmet Customizer</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs bg-white/5 border border-white/10 px-3.5 py-2 rounded-full font-mono text-white/60 flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" /> Live Stock: 14 left
          </span>
          <button 
            onClick={() => setIsLiked(!isLiked)}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-white/80 transition flex items-center justify-center border border-white/10"
          >
            <Heart size={20} className={isLiked ? "fill-red-500 text-red-500" : "text-white/60"} />
          </button>
        </div>
      </header>

      {/* Layout Content */}
      <section className="flex-1 w-full max-w-7xl mx-auto px-6 py-8 grid lg:grid-cols-12 gap-8 relative z-10 items-start">
        
        {/* Left Side: Product Gallery & Nutrition (Lg: col-span-5) */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-8">
          
          {/* Main Large Hero Image */}
          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.02] aspect-square shadow-2xl group">
            <img 
              src={images[activeImageIdx]} 
              alt="Crispy Nori Burger" 
              className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
            <span className="absolute bottom-6 left-6 bg-[#d7ff7a]/15 border border-[#d7ff7a]/30 text-[#d7ff7a] text-xs font-mono px-3.5 py-1.5 rounded-full uppercase tracking-wider backdrop-blur-md flex items-center gap-2">
              <Award size={14} /> Signature Selection
            </span>
          </div>

          {/* Multiple Gallery Image Thumbnails */}
          <div className="grid grid-cols-3 gap-4">
            {images.map((img, idx) => (
              <button 
                key={idx}
                onClick={() => setActiveImageIdx(idx)}
                className={`overflow-hidden rounded-2xl border transition-all aspect-video relative bg-white/[0.02] ${
                  activeImageIdx === idx 
                    ? "border-[#d7ff7a] shadow-lg shadow-[#d7ff7a]/5 scale-[1.02]" 
                    : "border-white/10 opacity-60 hover:opacity-100"
                }`}
              >
                <img src={img} alt="burger thumbnail" className="size-full object-cover" />
              </button>
            ))}
          </div>

          {/* Core Info & Metadata */}
          <div className="p-6 rounded-[28px] border border-white/10 bg-white/[0.02] space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/45 flex items-center gap-1.5"><Clock size={16} className="text-[#d7ff7a]"/> Prep Time</span>
              <b className="text-white font-semibold">8–12 minutes</b>
            </div>
            
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/45 flex items-center gap-1.5"><Star size={16} className="text-[#d7ff7a] fill-[#d7ff7a]"/> Rating & Reviews</span>
              <b className="text-white font-semibold">4.9 <span className="text-white/40 font-normal">(184 reviews)</span></b>
            </div>

            <div className="flex justify-between items-start text-sm">
              <span className="text-white/45 flex items-center gap-1.5 shrink-0"><AlertTriangle size={16} className="text-[#d7ff7a]"/> Allergens</span>
              <div className="flex flex-wrap justify-end gap-1.5">
                {["Gluten", "Sesame", "Soy"].map(a => (
                  <span key={a} className="bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Nutrition Info Cards */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Calories", value: "520 kcal", sub: "26% DV", color: "text-[#d7ff7a]" },
              { label: "Protein", value: "32g", sub: "64% DV", color: "text-[#d7ff7a]" },
              { label: "Fat", value: "18g", sub: "23% DV", color: "text-white/70" },
              { label: "Carbs", value: "48g", sub: "16% DV", color: "text-white/70" }
            ].map(nut => (
              <div key={nut.label} className="p-4 rounded-2xl border border-white/5 bg-white/[0.01] text-center">
                <span className="text-[10px] text-white/40 uppercase block tracking-wider">{nut.label}</span>
                <b className={`text-sm block mt-1.5 ${nut.color}`}>{nut.value}</b>
                <span className="text-[9px] text-white/30 block mt-0.5">{nut.sub}</span>
              </div>
            ))}
          </div>

        </div>

        {/* Right Side: Product Customization Form (Lg: col-span-7) */}
        <div className="lg:col-span-7 space-y-8 pb-32">
          
          {/* Title & Description */}
          <div className="space-y-4">
            <h2 className="text-4xl font-bold tracking-tight text-white leading-tight">The Crispy Nori Burger</h2>
            <p className="text-white/60 text-base leading-relaxed">
              Crispy seasoned chicken breast, premium toasted bun, fresh kelp seaweed sheets, crunchy pickled cucumber slices, and our house-formulated spicy roasted garlic signature mayonnaise.
            </p>
            <div>
              <span className="text-xs font-mono tracking-widest text-[#d7ff7a] uppercase font-bold block">Standard Ingredients</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {["Artisan Bun", "Seasoned Chicken Breast", "Kelp Seaweed Sheets", "Pickled Cucumber", "Roasted Garlic Mayo"].map((ing) => (
                  <span key={ing} className="bg-white/5 border border-white/10 px-3.5 py-2 rounded-xl text-xs text-white/80">
                    {ing}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 1. Bun Customization */}
          <div className="space-y-3">
            <h3 className="text-sm font-mono tracking-widest text-[#d7ff7a] uppercase font-bold flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-[#d7ff7a]" /> 1. Select Bakery Bread
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
                  className={`p-4 rounded-2xl border text-left transition-all ${
                    bread === x.id 
                      ? "border-[#d7ff7a] bg-[#d7ff7a]/5" 
                      : "border-white/10 bg-white/[0.02] hover:bg-white/5"
                  }`}
                >
                  <b className="text-sm text-white block">{x.label}</b>
                  <span className="text-xs text-[#d7ff7a] font-mono block mt-1">{x.extra}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Size Customization */}
          <div className="space-y-3">
            <h3 className="text-sm font-mono tracking-widest text-[#d7ff7a] uppercase font-bold flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-[#d7ff7a]" /> 2. Choose Burger Size
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
                  className={`p-4 rounded-2xl border text-left transition-all ${
                    size === x.id 
                      ? "border-[#d7ff7a] bg-[#d7ff7a]/5" 
                      : "border-white/10 bg-white/[0.02] hover:bg-white/5"
                  }`}
                >
                  <b className="text-sm text-white block">{x.label}</b>
                  <span className="text-xs text-[#d7ff7a] font-mono block mt-1">{x.extra}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Cheese Customization */}
          <div className="space-y-3">
            <h3 className="text-sm font-mono tracking-widest text-[#d7ff7a] uppercase font-bold flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-[#d7ff7a]" /> 3. Add Premium Cheese (+$0.80 each)
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
                    className={`p-4 rounded-2xl border text-left transition-all flex justify-between items-start ${
                      isActive 
                        ? "border-[#d7ff7a] bg-[#d7ff7a]/5" 
                        : "border-white/10 bg-white/[0.02] hover:bg-white/5"
                    }`}
                  >
                    <div>
                      <b className="text-sm text-white block">{x.label}</b>
                      <span className="text-xs text-[#d7ff7a]/70 font-mono block mt-1">+$0.80</span>
                    </div>
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 ${isActive ? "bg-[#d7ff7a] border-[#d7ff7a] text-black" : "border-white/30"}`}>
                      {isActive && <Check size={10} strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Sauce Preferences */}
          <div className="space-y-3">
            <h3 className="text-sm font-mono tracking-widest text-[#d7ff7a] uppercase font-bold flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-[#d7ff7a]" /> 4. Select Sauces (First free, extra +$0.30)
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
                    className={`p-4 rounded-2xl border text-center transition-all ${
                      isActive 
                        ? "border-[#d7ff7a] bg-[#d7ff7a]/5 text-white" 
                        : "border-white/10 bg-white/[0.02] hover:bg-white/5 text-white/70"
                    }`}
                  >
                    <b className="text-xs block truncate">{x.label}</b>
                    <span className="text-[10px] text-white/40 block mt-1">{isExtraCost ? "+$0.30" : "Free"}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Extra Meat Patty */}
          <div className="p-6 rounded-[28px] border border-white/10 bg-white/[0.02] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-mono tracking-widest text-[#d7ff7a] uppercase font-bold flex items-center gap-2">
                Extra Crispy Patty
              </h3>
              <p className="text-xs text-white/45 mt-1">Add additional hand-breaded chicken breast (+$3.00 each)</p>
            </div>
            <div className="flex items-center gap-4 bg-white/5 border border-white/10 p-2 rounded-xl">
              <button 
                onClick={() => setExtraMeat(prev => Math.max(0, prev - 1))}
                className="size-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 text-white transition"
              >
                <Minus size={14} />
              </button>
              <b className="w-6 text-center text-sm font-mono text-white">{extraMeat}</b>
              <button 
                onClick={() => setExtraMeat(prev => prev + 1)}
                className="size-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 text-white transition"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* 6. Fresh Vegetables */}
          <div className="space-y-3">
            <h3 className="text-sm font-mono tracking-widest text-[#d7ff7a] uppercase font-bold flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-[#d7ff7a]" /> 5. Fresh Vegetables (Included)
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
                    className={`p-4 rounded-2xl border text-center transition-all ${
                      isActive 
                        ? "border-[#d7ff7a] bg-[#d7ff7a]/5 text-white" 
                        : "border-white/10 bg-white/[0.02] hover:bg-white/5 text-white/50"
                    }`}
                  >
                    <b className="text-xs block">{x.label}</b>
                    <span className="text-[10px] text-[#d7ff7a] block mt-1">{isActive ? "Added" : "Excluded"}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 7. Cooking Preference */}
          <div className="space-y-3">
            <h3 className="text-sm font-mono tracking-widest text-[#d7ff7a] uppercase font-bold flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-[#d7ff7a]" /> 6. Patty Cooking Doneness
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
                  className={`p-4 rounded-2xl border text-center transition-all ${
                    cookingPref === x.id 
                      ? "border-[#d7ff7a] bg-[#d7ff7a]/5 text-white" 
                      : "border-white/10 bg-white/[0.02] hover:bg-white/5 text-white/55"
                  }`}
                >
                  <b className="text-xs block">{x.label}</b>
                </button>
              ))}
            </div>
          </div>

          {/* 8. Special Preparation Notes */}
          <div className="space-y-3">
            <h3 className="text-sm font-mono tracking-widest text-[#d7ff7a] uppercase font-bold flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-[#d7ff7a]" /> 7. Special Notes
            </h3>
            <textarea 
              rows={3}
              placeholder="E.g., No sauce on bottom bun, extra wrap, cut in half..."
              value={specialNotes}
              onChange={e => setSpecialNotes(e.target.value)}
              className="w-full bg-white/[0.02] border border-white/10 rounded-2xl p-4 text-sm text-white placeholder:text-white/35 focus:border-[#d7ff7a] focus:bg-white/[0.04] outline-none transition"
            />
          </div>

        </div>

      </section>

      {/* Sticky Bottom Add To Cart Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0c0f0a]/90 backdrop-blur-lg border-t border-white/10 py-6 px-8 z-50 shadow-2xl">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          
          {/* Quantity Selector & Item Cost */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 bg-white/5 border border-white/10 p-2 rounded-xl">
              <button 
                onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
                className="size-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 text-white transition active:scale-95"
              >
                <Minus size={16} />
              </button>
              <b className="w-8 text-center text-base font-mono text-white">{quantity}</b>
              <button 
                onClick={() => setQuantity(prev => prev + 1)}
                className="size-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 text-white transition active:scale-95"
              >
                <Plus size={16} />
              </button>
            </div>

            <div>
              <span className="text-xs text-white/45 block uppercase tracking-wider font-mono">Customized Total</span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <b className="text-3xl font-mono text-[#d7ff7a]">${totalPrice.toFixed(2)}</b>
                <span className="text-xs text-white/40">(${unitPrice.toFixed(2)} each)</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-4 w-full sm:w-auto">
            {onBackToSelection && (
              <button 
                onClick={onBackToSelection}
                className="flex-1 sm:flex-none px-6 py-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-semibold text-sm transition"
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
              className="flex-2 sm:flex-none px-10 py-4 rounded-2xl bg-[#d7ff7a] text-[#17200f] font-bold text-sm hover:bg-[#c9f05a] transition shadow-lg shadow-[#d7ff7a]/20 flex items-center justify-center gap-2 group active:scale-[0.98]"
            >
              <ShoppingBag size={18} /> Add to Order <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

        </div>
      </div>

    </main>
  );
}
