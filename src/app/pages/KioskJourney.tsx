import { useEffect, useRef, useState } from "react";
import {
  Accessibility, ArrowRight, ChevronLeft, Globe2, Heart, Mic, QrCode, Search,
  Sparkles, Star, UtensilsCrossed, Volume2, X, Plus, Check, Info, Eye,
  ChevronRight, RefreshCw, ShoppingCart, User, Smartphone,
  TrendingUp
} from "lucide-react";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import type { NoriChatRequest, NoriConversationState } from "../../server/types/noriChat";
import { executeNoriCartActions, serializeNoriCart } from "../services/noriCartActions";
import { postNoriChat, shouldSubmitNoriKey } from "../services/noriChatClient";

// Premium Unsplash Images for Kiosk Menu
const burgerImg = "https://images.unsplash.com/photo-1606149059549-6042addafc5a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=1080";
const chickenImg = "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=1080";
const friesImg = "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=1080";
const saladImg = "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=1080";
const drinkImg = "https://images.unsplash.com/photo-1543007630-9710e4a00a20?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=1080";
const dessertImg = "https://images.unsplash.com/photo-1551024601-bec78aea704b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=85&w=1080";

type KioskItem = {
  id: string;
  name: string;
  price: number;
  image: string;
  desc: string;
  tag?: string;
  cal?: number;
  rating?: number;
};

type JourneyAIMessage = {
  id: string;
  sender: "user" | "bot";
  text: string;
};

const fullMenu: KioskItem[] = [
  { id: "1", name: "The Crispy Nori", price: 8.90, image: burgerImg, desc: "Crispy chicken breast, fresh seaweed, pickled cucumber, spicy signature mayo.", tag: "BEST SELLER", cal: 520, rating: 4.9 },
  { id: "2", name: "Smoky Truffle Beef", price: 10.50, image: chickenImg, desc: "Angus beef patty, black truffle paste, melted Swiss cheese, caramelized onion.", tag: "NEW", cal: 680, rating: 4.8 },
  { id: "3", name: "Golden Sea Salt Fries", price: 3.50, image: friesImg, desc: "Hand-cut Idaho potatoes, Mediterranean sea salt, freshly cracked rosemary.", tag: "CLASSIC", cal: 320, rating: 4.7 },
  { id: "4", name: "Zen Garden Salad", price: 7.20, image: saladImg, desc: "Organic mix greens, edamame, shaved avocado, toasted sesame vinaigrette.", cal: 240, rating: 4.6 },
  { id: "5", name: "Iced Matcha Latte", price: 4.50, image: drinkImg, desc: "Uji matcha, organic oat milk, touch of natural agave nectar.", tag: "POPULAR", cal: 150, rating: 4.9 },
  { id: "6", name: "Choco Lava Souffle", price: 5.80, image: dessertImg, desc: "Warm Belgian chocolate cake, melting chocolate center, Madagascar vanilla cream.", cal: 410, rating: 4.8 }
];

export default function KioskJourney({ onBackToSelection, onCheckout, initialScreen = "Splash" }: { onBackToSelection?: () => void; onCheckout?: () => void; initialScreen?: string }) {
  const { language, setLanguage } = useLanguage();
  const {
    items: sharedCart, addItem: addSharedItem, removeItem, updateQty,
    updateCustomizations, clearCart, setOrderType, providerInstanceId,
  } = useCart();
  const cartRef = useRef(sharedCart);
  useEffect(() => { cartRef.current = sharedCart; }, [sharedCart]);
  useEffect(() => { console.log("[CART][PROVIDER_INSTANCE]", providerInstanceId); }, [providerInstanceId]);
  const executedActionIdsRef = useRef(new Set<string>());
  const actionResultsRef = useRef<NoriChatRequest["actionResults"]>([]);
  const [screen, setScreen] = useState(initialScreen);
  const [lang, setLang] = useState(language === "ar" ? "العربية" : language === "tr" ? "Türkçe" : "English");
  const [accessibilitySettings, setAccessibilitySettings] = useState({
    largeText: false,
    highContrast: false,
    screenReader: false,
    reduceMotion: false
  });
  const [selectedDining, setSelectedDining] = useState<"here" | "away" | null>(null);
  const [loyaltyPhone, setLoyaltyPhone] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMessages, setAiMessages] = useState<JourneyAIMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiConversationState, setAiConversationState] = useState<NoriConversationState>();
  const aiSendingRef = useRef(false);
  const aiHistoryEndRef = useRef<HTMLDivElement | null>(null);
  const [favorites, setFavorites] = useState<string[]>(["1", "3"]);
  const [cart, setCart] = useState<KioskItem[]>([]);

  const toggleFavorite = (id: string) => {
    setFavorites(prev => prev.includes(id) ? prev.filter(fId => fId !== id) : [...prev, id]);
  };

  const addToCart = (item: KioskItem) => {
    setCart(prev => [...prev, item]);
    addSharedItem({ id: item.id, name: item.name, price: item.price, basePrice: item.price, image: item.image, category: "menu", calories: item.cal });
  };

  const sendAIMessage = async () => {
    const message = aiPrompt.trim();
    if (!message || aiSendingRef.current) return;
    aiSendingRef.current = true;

    const userMessage: JourneyAIMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: message,
    };
    setAiMessages(previous => [...previous, userMessage]);
    setAiPrompt("");
    setAiLoading(true);

    const serializedCart = serializeNoriCart(cartRef.current);
    console.log("[NORI][CART_BEFORE_REQUEST]", cartRef.current);
    console.log("[NORI][SERIALIZED_CART]", serializedCart);
    const request: NoriChatRequest = {
      message,
      cart: serializedCart,
      activeAllergens: [],
      language,
      conversationState: aiConversationState,
      actionResults: actionResultsRef.current,
    };

    try {
      const result = await postNoriChat(request);
      const executionResults = executeNoriCartActions(result.actions, {
        addItem: addSharedItem, removeItem, updateQty, updateCustomizations, clearCart,
      }, { executedActionIds: executedActionIdsRef.current, cartRef });
      actionResultsRef.current = executionResults.map(({ actionId, status }) => ({ actionId, status }));
      setAiConversationState(result.conversationState);
      setAiMessages(previous => [...previous, {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: result.reply,
      }]);
    } catch {
      setAiMessages(previous => [...previous, {
        id: `bot-error-${Date.now()}`,
        sender: "bot",
        text: "I could not reach the Nori service. Please try again or ask a staff member for help.",
      }]);
    } finally {
      aiSendingRef.current = false;
      setAiLoading(false);
    }
  };

  useEffect(() => {
    aiHistoryEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [aiMessages, aiLoading]);

  const screensList = [
    { key: "Splash", label: "01. Splash Screen" },
    { key: "Welcome", label: "02. Welcome Screen" },
    { key: "Language", label: "03. Language Selection" },
    { key: "Access", label: "04. Accessibility Options" },
    { key: "Service", label: "05. Eat Here / Take Away" },
    { key: "Guest login", label: "06. Guest Login Options" },
    { key: "Loyalty", label: "07. Loyalty Program Scan" },
    { key: "Home", label: "08. Main Home Dashboard" },
    { key: "Categories", label: "09. Expanded Categories" },
    { key: "Search", label: "10. Intelligent Search" },
    { key: "Voice search", label: "11. Voice Ordering Mic" },
    { key: "AI ordering", label: "12. Nori AI Ordering Assistant" },
    { key: "Listing", label: "13. Product Catalog Grid" },
    { key: "Favorites", label: "14. Saved Favorites" },
    { key: "Offers", label: "15. Today's Promotions" },
    { key: "Recommendations", label: "16. Smart Recommendations" },
    { key: "Recent", label: "17. Recently Ordered" },
    { key: "Popular", label: "18. Trending Popular Items" }
  ];

  // Helper Header Component for Kiosk Simulator
  const KioskHeader = () => (
    <div className="flex items-center justify-between border-b border-white/10 pb-6 mb-6">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-[#d7ff7a] text-[#17200f] shadow-lg shadow-[#d7ff7a]/20">
          <UtensilsCrossed size={22} />
        </span>
        <div>
          <b className="text-lg tracking-tight text-white">Morrow Premium</b>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-['Space_Mono'] text-[10px] tracking-widest text-[#d7ff7a]">KIOSK 04</span>
            <span className="text-white/30 text-[10px]">•</span>
            <span className="text-white/45 text-[10px]">Zone: Dining Lobby</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {onBackToSelection && (
          <button onClick={onBackToSelection} className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-semibold hover:bg-white/10 transition">
            Exit Demo
          </button>
        )}
        <button onClick={() => setScreen("Access")} className="grid size-11 place-items-center rounded-xl border border-white/15 hover:bg-white/10 text-white/80 transition">
          <Accessibility size={20} />
        </button>
      </div>
    </div>
  );

  let currentScreenContent: React.ReactNode;

  switch (screen) {
    case "Splash":
      currentScreenContent = (
        <div className="relative min-h-[750px] flex flex-col justify-between p-10 overflow-hidden rounded-[36px] bg-[#0c0f0a] border border-white/10">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#d7ff7a]/5 blur-[120px] pointer-events-none" />
          
          <div className="flex justify-between items-center relative z-10">
            <div className="flex items-center gap-2 font-mono text-xs text-white/40">
              <span className="size-2 rounded-full bg-[#d7ff7a] animate-ping" />
              SYSTEM ACTIVE · ONLINE
            </div>
            <div className="text-right text-xs text-white/45 font-mono">
              TAP SCREEN TO ORDER
            </div>
          </div>

          <div className="text-center relative z-10 max-w-xl mx-auto">
            <div className="mx-auto grid size-28 place-items-center rounded-[38px] bg-[#d7ff7a] text-[#17200f] shadow-[0_0_100px_rgba(215,255,122,.25)] mb-10">
              <UtensilsCrossed size={48} />
            </div>
            <h1 className="text-6xl md:text-7xl font-bold tracking-tight text-white">Morrow</h1>
            <p className="mt-4 font-['Space_Mono'] text-xs tracking-[0.4em] text-[#d7ff7a] uppercase">
              Thoughtfully Crafted · Quietly Fast
            </p>
          </div>

          <div className="flex flex-col items-center gap-6 relative z-10">
            <button 
              onClick={() => setScreen("Welcome")}
              className="group flex items-center gap-4 bg-[#d7ff7a] text-[#17200f] px-10 py-6 rounded-3xl font-semibold text-lg hover:bg-[#cbf26c] transition-all shadow-xl shadow-[#d7ff7a]/15 active:scale-[0.98]"
            >
              Start Your Order
              <ArrowRight className="group-hover:translate-x-1.5 transition-transform" size={20} />
            </button>
            <div className="flex items-center gap-6 text-xs text-white/40 font-mono">
              <span>Touch to Begin</span>
              <span>•</span>
              <span>Cards & Mobile Pay Only</span>
            </div>
          </div>
        </div>
      );
      break;

    case "Welcome":
      currentScreenContent = (
        <div className="relative min-h-[750px] flex flex-col justify-between p-10 overflow-hidden rounded-[36px] bg-[#0c0f0a] border border-white/10">
          <img src={burgerImg} alt="Welcome Banner" className="absolute inset-0 size-full object-cover opacity-35 filter brightness-[0.4]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c0f0a] via-[#0c0f0a]/75 to-transparent" />
          
          <div className="relative z-10">
            <KioskHeader />
          </div>

          <div className="relative z-10 max-w-2xl mt-12">
            <span className="font-['Space_Mono'] text-xs tracking-[0.25em] text-[#d7ff7a] uppercase bg-[#d7ff7a]/10 px-3 py-1.5 rounded-full border border-[#d7ff7a]/20">
              Premium Kiosk Ordering
            </span>
            <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-white mt-6 leading-tight">
              Crafted Fresh, <br />
              Just for You.
            </h2>
            <p className="text-white/60 text-lg mt-6 leading-relaxed max-w-md">
              Order gourmet meals, customize ingredients, and checkout securely in seconds.
            </p>
          </div>

          <div className="relative z-10 flex flex-wrap gap-4 mt-12">
            <button 
              onClick={() => setScreen("Language")} 
              className="flex-1 min-w-[200px] flex items-center justify-center gap-3 bg-[#d7ff7a] text-[#17200f] px-8 py-5 rounded-2xl font-bold hover:bg-[#c3ec60] transition"
            >
              Order Now <ArrowRight size={18} />
            </button>
            <button 
              onClick={() => setScreen("Access")} 
              className="flex-1 min-w-[200px] bg-white/5 border border-white/15 px-8 py-5 rounded-2xl font-bold text-white hover:bg-white/10 transition"
            >
              Accessibility Options
            </button>
          </div>
        </div>
      );
      break;

    case "Language":
      currentScreenContent = (
        <div className="p-8 md:p-12 rounded-[36px] bg-[#0f120e] border border-white/10 min-h-[750px] flex flex-col justify-between">
          <KioskHeader />
          
          <div className="text-center max-w-xl mx-auto my-auto">
            <span className="font-mono text-xs text-[#d7ff7a] tracking-[0.3em] uppercase">Select Language</span>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mt-4">Let's Speak Your Language</h2>
            <p className="text-white/50 text-sm mt-3">You can easily change this setting at any point during your transaction.</p>

            <div className="grid gap-4 mt-10">
              {[
                { code: "en", name: "English", greet: "Welcome & Enjoy" },
                { code: "ar", name: "العربية", greet: "مرحباً بك وبالعافية" },
                { code: "tr", name: "Türkçe", greet: "Hoş geldiniz, Afiyet olsun" },
                { code: "de", name: "Deutsch", greet: "Willkommen & Guten Appetit" }
              ].map(x => (
                <button 
                  key={x.code}
                  onClick={() => {
                    setLang(x.name);
                    setLanguage(x.name === "العربية" ? "ar" : x.name === "Türkçe" ? "tr" : "en");
                    setScreen("Access");
                  }}
                  className={`flex items-center justify-between p-6 rounded-2xl border text-left transition-all ${
                    lang === x.name 
                      ? "border-[#d7ff7a] bg-[#d7ff7a]/10 text-white" 
                      : "border-white/10 bg-white/[0.02] text-white/70 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="grid size-12 place-items-center rounded-xl bg-white/5 border border-white/10 text-[#d7ff7a]">
                      <Globe2 size={20} />
                    </span>
                    <div>
                      <b className="text-lg block">{x.name}</b>
                      <span className="text-xs text-white/40 block mt-0.5">{x.greet}</span>
                    </div>
                  </div>
                  <ChevronRight size={20} className={lang === x.name ? "text-[#d7ff7a]" : "text-white/20"} />
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center text-xs text-white/40 pt-6 border-t border-white/5">
            <span>Powered by SmartTrans™</span>
            <span>Step 3 of 18</span>
          </div>
        </div>
      );
      break;

    case "Access":
      currentScreenContent = (
        <div className="p-8 md:p-12 rounded-[36px] bg-[#0f120e] border border-white/10 min-h-[750px] flex flex-col justify-between">
          <KioskHeader />
          
          <div className="max-w-3xl mx-auto w-full my-auto">
            <span className="font-mono text-xs text-[#d7ff7a] tracking-[0.2em] uppercase">Accessibility Settings</span>
            <h2 className="text-4xl font-bold tracking-tight text-white mt-3">Tailor Your Experience</h2>
            <p className="text-white/50 text-sm mt-2">Adjust accessibility configurations below for easier kiosk navigation.</p>

            <div className="grid gap-4 md:grid-cols-2 mt-8">
              {[
                { id: "largeText", name: "Larger Font Sizing", desc: "Increases interface typography sizes for easier readability.", icon: <Info size={18} /> },
                { id: "highContrast", name: "High Contrast Mode", desc: "Boosts control bounds and text colors definition.", icon: <Eye size={18} /> },
                { id: "screenReader", name: "Screen Reader Assistance", desc: "Enable audio narration for selected items and descriptions.", icon: <Volume2 size={18} /> },
                { id: "reduceMotion", name: "Reduced Animation Speed", desc: "Lowers transition effects and micro-movements.", icon: <RefreshCw size={18} /> }
              ].map(x => {
                const isActive = accessibilitySettings[x.id as keyof typeof accessibilitySettings];
                return (
                  <button 
                    key={x.id}
                    onClick={() => setAccessibilitySettings(prev => ({ ...prev, [x.id]: !isActive }))}
                    className={`flex flex-col justify-between p-6 rounded-2xl border text-left transition-all min-h-[140px] ${
                      isActive 
                        ? "border-[#d7ff7a] bg-[#d7ff7a]/5" 
                        : "border-white/10 bg-white/[0.02] hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-start justify-between w-full">
                      <span className={`p-2.5 rounded-lg border ${isActive ? "bg-[#d7ff7a]/10 border-[#d7ff7a] text-[#d7ff7a]" : "bg-white/5 border-white/10 text-white/60"}`}>
                        {x.icon}
                      </span>
                      <span className={`w-5 h-5 rounded-full border flex items-center justify-center ${isActive ? "bg-[#d7ff7a] border-[#d7ff7a] text-black" : "border-white/30"}`}>
                        {isActive && <Check size={12} strokeWidth={3} />}
                      </span>
                    </div>
                    <div>
                      <b className="text-base text-white block mt-4">{x.name}</b>
                      <span className="text-xs text-white/45 block mt-1 leading-relaxed">{x.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex gap-4">
              <button onClick={() => setScreen("Service")} className="bg-[#d7ff7a] text-[#17200f] px-8 py-4 rounded-xl font-bold hover:bg-[#c4ec60] transition">
                Apply & Continue
              </button>
              <button onClick={() => setScreen("Welcome")} className="border border-white/10 bg-white/5 px-8 py-4 rounded-xl font-semibold text-white/70 hover:bg-white/10 transition">
                Back
              </button>
            </div>
          </div>
          
          <div className="text-center text-xs text-white/45 pt-6 border-t border-white/5">
            Settings will apply universally across your session.
          </div>
        </div>
      );
      break;

    case "Service":
      currentScreenContent = (
        <div className="p-8 md:p-12 rounded-[36px] bg-[#0f120e] border border-white/10 min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div className="max-w-2xl mx-auto text-center my-auto w-full">
            <span className="font-mono text-xs text-[#d7ff7a] tracking-[0.3em] uppercase">Dining Option</span>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mt-4">Where Will You Eat?</h2>
            <p className="text-white/50 text-sm mt-3">Select your preference so we can package your meal correctly.</p>

            <div className="grid md:grid-cols-2 gap-6 mt-10">
              {/* Eat Here */}
              <button 
                onClick={() => {
                  setSelectedDining("here");
                  setOrderType("dine_in");
                  setScreen("Guest login");
                }}
                className={`group p-8 rounded-[28px] border text-center transition-all ${
                  selectedDining === "here" 
                    ? "border-[#d7ff7a] bg-[#d7ff7a]/5" 
                    : "border-white/10 bg-white/[0.02] hover:bg-white/5"
                }`}
              >
                <div className="mx-auto size-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#d7ff7a] mb-6 group-hover:scale-105 transition-transform duration-300">
                  <UtensilsCrossed size={40} />
                </div>
                <h3 className="text-2xl font-bold text-white">Eat Here</h3>
                <p className="text-xs text-white/45 mt-2 leading-relaxed max-w-[200px] mx-auto">
                  Served fresh in our ceramic tableware at your table or counter.
                </p>
              </button>

              {/* Take Away */}
              <button 
                onClick={() => {
                  setSelectedDining("away");
                  setOrderType("take_away");
                  setScreen("Guest login");
                }}
                className={`group p-8 rounded-[28px] border text-center transition-all ${
                  selectedDining === "away" 
                    ? "border-[#d7ff7a] bg-[#d7ff7a]/5" 
                    : "border-white/10 bg-white/[0.02] hover:bg-white/5"
                }`}
              >
                <div className="mx-auto size-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#d7ff7a] mb-6 group-hover:scale-105 transition-transform duration-300">
                  <ShoppingCart size={40} />
                </div>
                <h3 className="text-2xl font-bold text-white">Take Away</h3>
                <p className="text-xs text-white/45 mt-2 leading-relaxed max-w-[200px] mx-auto">
                  Packaged in eco-friendly insulated bags to preserve freshness.
                </p>
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs text-white/40 pt-6 border-t border-white/5">
            <span>Table tracker sensors active</span>
            <span>Step 5 of 18</span>
          </div>
        </div>
      );
      break;

    case "Guest login":
      currentScreenContent = (
        <div className="p-8 md:p-12 rounded-[36px] bg-[#0f120e] border border-white/10 min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div className="max-w-2xl mx-auto text-center my-auto w-full">
            <span className="font-mono text-xs text-[#d7ff7a] tracking-[0.3em] uppercase">Session Setup</span>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mt-4">Order Preference</h2>
            <p className="text-white/50 text-sm mt-3">Earn reward points, track orders, or checkout quickly as a guest.</p>

            <div className="grid md:grid-cols-2 gap-6 mt-10">
              {/* Rewards Login */}
              <button 
                onClick={() => setScreen("Loyalty")}
                className="group p-8 rounded-[28px] border border-white/10 bg-gradient-to-br from-[#d7ff7a]/10 to-transparent hover:from-[#d7ff7a]/15 text-center transition-all"
              >
                <div className="mx-auto size-16 rounded-2xl bg-[#d7ff7a] text-[#17200f] flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                  <QrCode size={28} />
                </div>
                <h3 className="text-xl font-bold text-white">Loyalty & Rewards</h3>
                <p className="text-xs text-[#d7ff7a]/85 mt-2 leading-relaxed max-w-[200px] mx-auto">
                  Scan QR code, enter phone number, and unlock double point multipliers.
                </p>
              </button>

              {/* Guest Login */}
              <button 
                onClick={() => setScreen("Home")}
                className="group p-8 rounded-[28px] border border-white/10 bg-white/[0.02] hover:bg-white/5 text-center transition-all"
              >
                <div className="mx-auto size-16 rounded-2xl bg-white/5 border border-white/10 text-white/70 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                  <User size={28} />
                </div>
                <h3 className="text-xl font-bold text-white">Checkout as Guest</h3>
                <p className="text-xs text-white/45 mt-2 leading-relaxed max-w-[200px] mx-auto">
                  Proceed straight to menu selection. You can register anytime during checkout.
                </p>
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs text-white/40 pt-6 border-t border-white/5">
            <span>Guest sessions automatically clear after checkout</span>
            <span>Step 6 of 18</span>
          </div>
        </div>
      );
      break;

    case "Loyalty":
      currentScreenContent = (
        <div className="p-8 md:p-12 rounded-[36px] bg-[#0f120e] border border-white/10 min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div className="max-w-2xl mx-auto w-full my-auto">
            <div className="text-center mb-8">
              <span className="font-mono text-xs text-[#d7ff7a] tracking-[0.3em] uppercase">Rewards Sign In</span>
              <h2 className="text-4xl font-bold tracking-tight text-white mt-4">Welcome Back</h2>
              <p className="text-white/50 text-sm mt-2">Scan your app barcode or enter your registered phone number.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 items-center">
              {/* QR scanner demo */}
              <div className="p-8 rounded-[26px] bg-white/[0.02] border border-white/10 text-center flex flex-col items-center">
                <div className="size-48 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center p-4 relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-full h-1 bg-[#d7ff7a] animate-bounce" />
                  <QrCode size={120} className="text-white/40" />
                </div>
                <span className="text-xs text-white/40 block mt-4 font-mono">ALIGN APP CODE WITH SCANNER BELOW</span>
              </div>

              {/* Keyboard mock input */}
              <div className="space-y-4">
                <div className="flex rounded-2xl border border-white/15 bg-white/5 p-2.5">
                  <span className="px-3 flex items-center text-white/40"><Smartphone size={18} /></span>
                  <input 
                    type="text" 
                    readOnly 
                    value={loyaltyPhone || "Enter Mobile Number"} 
                    className={`min-w-0 flex-1 bg-transparent px-2 py-1 outline-none text-lg font-semibold ${loyaltyPhone ? "text-white" : "text-white/35"}`}
                  />
                  {loyaltyPhone && (
                    <button onClick={() => setLoyaltyPhone("")} className="p-2 text-white/40 hover:text-white"><X size={16}/></button>
                  )}
                </div>

                {/* Simulated keypad */}
                <div className="grid grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map(num => (
                    <button 
                      key={num} 
                      onClick={() => setLoyaltyPhone(prev => prev.length < 10 ? prev + num : prev)}
                      className="bg-white/5 border border-white/10 hover:bg-white/10 text-white font-semibold py-3.5 rounded-xl transition"
                    >
                      {num}
                    </button>
                  ))}
                  <button 
                    onClick={() => setScreen("Home")}
                    className="col-span-2 bg-[#d7ff7a] text-[#17200f] font-bold py-3.5 rounded-xl hover:bg-[#c1e85a] transition flex items-center justify-center gap-2"
                  >
                    Confirm <Check size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs text-white/40 pt-6 border-t border-white/5">
            <span>Points balance updates instantly</span>
            <span>Step 7 of 18</span>
          </div>
        </div>
      );
      break;

    case "Home":
      currentScreenContent = (
        <div className="p-8 rounded-[36px] bg-[#0c0f0a] border border-white/10 min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div className="grid xl:grid-cols-[1fr_360px] gap-8 items-start">
            <div className="space-y-8">
              {/* Promo Banner */}
              <div 
                onClick={() => setScreen("Offers")}
                className="cursor-pointer relative overflow-hidden rounded-[32px] bg-[#a9cc50] p-8 text-[#16200b] shadow-xl group"
              >
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-500" />
                <span className="font-['Space_Mono'] text-[10px] tracking-[0.25em] bg-black/10 px-3 py-1 rounded-full uppercase">Today's Special drop</span>
                <h3 className="text-4xl font-bold tracking-tight mt-6 leading-none">The Crisp is <br />Calling.</h3>
                <p className="mt-3 text-sm opacity-80 max-w-sm">Enjoy our delicious Crispy chicken burger bundled with Golden Rosemary fries and cold drink at special discount.</p>
                <div className="mt-6 flex items-center gap-4">
                  <span className="text-2xl font-bold font-mono">$13.50</span>
                  <span className="line-through text-xs opacity-50 font-mono">$18.90</span>
                  <span className="bg-black/85 text-[#d7ff7a] text-[10px] font-bold px-2 py-0.5 rounded">SAVE 28%</span>
                </div>
              </div>

              {/* Categories Navigation */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-white">Browse Categories</h3>
                  <button onClick={() => setScreen("Categories")} className="text-xs text-[#d7ff7a] hover:underline flex items-center gap-1">View All <ChevronRight size={14} /></button>
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { name: "Burgers", count: 8 },
                    { name: "Chicken", count: 6 },
                    { name: "Sides", count: 12 },
                    { name: "Drinks", count: 15 },
                    { name: "Desserts", count: 7 }
                  ].map(cat => (
                    <button 
                      key={cat.name}
                      onClick={() => setScreen("Listing")}
                      className="p-4 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-white/10 text-center transition-all"
                    >
                      <b className="text-sm text-white block">{cat.name}</b>
                      <span className="text-[10px] text-white/40 block mt-1">{cat.count} Items</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recommendation row */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-white">Curated for You</h3>
                  <button onClick={() => setScreen("Recommendations")} className="text-xs text-[#d7ff7a] hover:underline flex items-center gap-1">Nori Picks <Sparkles size={12} /></button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {fullMenu.slice(0, 2).map(item => (
                    <div key={item.id} className="flex gap-4 p-4 rounded-2xl border border-white/10 bg-white/[0.03] relative group">
                      <img src={item.image} alt={item.name} className="size-20 rounded-xl object-cover" />
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start gap-1">
                            <h4 className="font-semibold text-sm truncate text-white">{item.name}</h4>
                            <span className="font-mono text-xs text-[#d7ff7a]">${item.price.toFixed(2)}</span>
                          </div>
                          <p className="text-[11px] text-white/45 truncate mt-1">{item.desc}</p>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-[10px] text-white/50">{item.cal} Cal</span>
                          <button onClick={() => addToCart(item)} className="p-1 bg-white hover:bg-[#d7ff7a] text-black rounded-lg transition"><Plus size={14} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar quick actions */}
            <div className="p-6 rounded-[28px] bg-white/[0.02] border border-white/10 space-y-6">
              <h4 className="text-sm font-bold text-white/60 tracking-wider uppercase">Order Methods</h4>
              
              <button onClick={() => setScreen("Search")} className="w-full flex items-center gap-4 p-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-left">
                <span className="p-2.5 rounded-xl bg-white/5 text-[#d7ff7a]"><Search size={20} /></span>
                <div>
                  <b className="text-sm text-white block">Intelligent Search</b>
                  <span className="text-xs text-white/40 block mt-0.5">Filter allergens, calorie limits</span>
                </div>
              </button>

              <button onClick={() => setScreen("AI ordering")} className="w-full flex items-center gap-4 p-4 rounded-2xl border border-[#d7ff7a]/20 bg-[#d7ff7a]/5 hover:bg-[#d7ff7a]/10 transition text-left relative overflow-hidden group">
                <span className="p-2.5 rounded-xl bg-[#d7ff7a]/10 text-[#d7ff7a]"><Sparkles size={20} /></span>
                <div>
                  <b className="text-sm text-white block">Speak with Nori AI</b>
                  <span className="text-xs text-[#d7ff7a]/70 block mt-0.5">Custom meal builder</span>
                </div>
              </button>

              <button onClick={() => setScreen("Voice search")} className="w-full flex items-center gap-4 p-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-left">
                <span className="p-2.5 rounded-xl bg-white/5 text-[#d7ff7a]"><Mic size={20} /></span>
                <div>
                  <b className="text-sm text-white block">Voice Order Command</b>
                  <span className="text-xs text-white/40 block mt-0.5">Tap & speak your menu choices</span>
                </div>
              </button>

              <div className="border-t border-white/5 pt-6">
                <div className="flex justify-between text-xs text-white/40 mb-2"><span>Cart Items</span><span>{cart.length}</span></div>
                <div className="flex justify-between text-sm font-semibold text-white mb-4"><span>Subtotal</span><span>${cart.reduce((s,i)=>s+i.price, 0).toFixed(2)}</span></div>
                <button disabled={!cart.length} onClick={onCheckout} className="w-full py-4 rounded-2xl bg-[#d7ff7a] text-[#17200f] font-bold text-center hover:bg-[#c6f059] transition disabled:opacity-40 disabled:cursor-not-allowed">Review Cart</button>
              </div>
            </div>
          </div>
        </div>
      );
      break;

    case "Categories":
      currentScreenContent = (
        <div className="p-8 rounded-[36px] bg-[#0c0f0a] border border-white/10 min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div>
            <div className="flex items-center gap-2 mb-6">
              <button onClick={() => setScreen("Home")} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition"><ChevronLeft size={16} /></button>
              <h2 className="text-3xl font-bold text-white">All Menu Categories</h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              {[
                { name: "Premium Burgers", items: "8 Items", desc: "100% Angus beef, fresh brioche buns", bg: "from-amber-950/20" },
                { name: "Crispy Chicken", items: "6 Items", desc: "Brined 24h, hand-battered breast", bg: "from-orange-950/20" },
                { name: "Golden Combos", items: "5 Items", desc: "Curated bundles save up to 30%", bg: "from-[#d7ff7a]/5" },
                { name: "Rosemary Sides", items: "12 Items", desc: "Sea salted fries, dynamic snacks", bg: "from-yellow-950/20" },
                { name: "Artisanal Drinks", items: "15 Items", desc: "Cold brews, matcha, natural juices", bg: "from-blue-950/20" },
                { name: "Warm Desserts", items: "7 Items", desc: "Souffle, pastries, vanilla cream", bg: "from-red-950/20" }
              ].map((c, idx) => (
                <div 
                  key={c.name}
                  onClick={() => setScreen("Listing")}
                  className={`cursor-pointer group p-8 rounded-[30px] border border-white/10 bg-gradient-to-br ${c.bg} to-transparent hover:bg-white/[0.04] transition-all min-h-[220px] flex flex-col justify-between`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-mono text-xs text-[#d7ff7a]">0{idx+1}</span>
                    <span className="text-xs bg-white/5 border border-white/10 px-2.5 py-1 rounded-full text-white/60">{c.items}</span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white group-hover:text-[#d7ff7a] transition-colors">{c.name}</h3>
                    <p className="text-xs text-white/45 mt-2 leading-relaxed">{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 border-t border-white/5 pt-6 flex justify-between items-center text-xs text-white/40">
            <span>Tap category card to view item listings</span>
            <span>Step 9 of 18</span>
          </div>
        </div>
      );
      break;

    case "Search":
      currentScreenContent = (
        <div className="p-8 rounded-[36px] bg-[#0c0f0a] border border-white/10 min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div>
            <div className="flex items-center gap-2 mb-6">
              <button onClick={() => setScreen("Home")} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition"><ChevronLeft size={16} /></button>
              <h2 className="text-3xl font-bold text-white">Intelligent Catalog Search</h2>
            </div>

            {/* Large Search Bar */}
            <div className="flex items-center gap-4 bg-white/[0.03] border border-white/10 rounded-[24px] p-4 pl-6 relative">
              <Search className="text-[#d7ff7a]" size={24} />
              <input 
                type="text" 
                autoFocus
                placeholder="Try: 'Spicy chicken with high protein' or 'Vegan sides'" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-lg text-white placeholder:text-white/30 outline-none"
              />
              <button onClick={() => setScreen("Voice search")} className="p-3 bg-white/5 rounded-xl hover:bg-white/10 text-[#d7ff7a] transition">
                <Mic size={18} />
              </button>
            </div>

            {/* Search Filters */}
            <div className="mt-6 flex flex-wrap gap-2">
              {["High Protein", "Spicy", "Vegetarian", "Dairy-Free", "Under $10", "Low Calorie"].map(filter => (
                <button 
                  key={filter}
                  onClick={() => setSearchQuery(filter)}
                  className="px-4 py-2 text-xs rounded-full border border-white/10 bg-white/5 hover:bg-[#d7ff7a] hover:text-black transition"
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Results Grid */}
            <div className="mt-10">
              <h4 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-4">Matching menu Items</h4>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {fullMenu
                  .filter(i => 
                    i.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    i.desc.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map(item => (
                    <div key={item.id} className="p-5 rounded-[24px] border border-white/10 bg-white/[0.02] flex flex-col justify-between">
                      <div className="flex gap-4">
                        <img src={item.image} alt={item.name} className="size-20 rounded-xl object-cover shrink-0" />
                        <div>
                          <h5 className="font-bold text-sm text-white">{item.name}</h5>
                          <p className="text-xs text-white/40 mt-1 line-clamp-2 leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                      <div className="flex justify-between items-center mt-6 pt-4 border-t border-white/5">
                        <span className="font-mono font-bold text-[#d7ff7a] text-sm">${item.price.toFixed(2)}</span>
                        <button onClick={() => addToCart(item)} className="px-4 py-2 bg-white text-black hover:bg-[#d7ff7a] transition rounded-lg text-xs font-semibold">Add to Order</button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-white/5 pt-6 text-xs text-white/40">
            Realtime catalog index contains 56 custom variants
          </div>
        </div>
      );
      break;

    case "Voice search":
      currentScreenContent = (
        <div className="p-8 rounded-[36px] bg-[#0c0f0a] border border-white/10 min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div className="max-w-xl mx-auto text-center my-auto w-full flex flex-col items-center">
            <span className="font-mono text-xs text-[#d7ff7a] tracking-[0.3em] uppercase">Voice Recognition</span>
            
            {/* Visual Wave */}
            <div className="my-10 relative flex justify-center items-center h-48 w-full">
              <div className={`absolute w-36 h-36 rounded-full border border-[#d7ff7a]/20 bg-[#d7ff7a]/5 transition-all duration-1000 ${voiceListening ? "scale-125 opacity-20" : ""}`} />
              <div className={`absolute w-28 h-28 rounded-full border border-[#d7ff7a]/30 bg-[#d7ff7a]/10 transition-all duration-700 ${voiceListening ? "scale-110 opacity-30" : ""}`} />
              
              <button 
                onClick={() => setVoiceListening(!voiceListening)}
                className={`z-10 grid size-20 place-items-center rounded-full transition ${voiceListening ? "bg-red-500 text-white shadow-lg shadow-red-500/25" : "bg-[#d7ff7a] text-[#17200f]"}`}
              >
                <Mic size={32} />
              </button>
            </div>

            <h3 className="text-3xl font-bold text-white">{voiceListening ? "Listening Now..." : "Tap Mic to Speak"}</h3>
            <p className="text-white/50 text-sm mt-3 leading-relaxed max-w-sm">
              {voiceListening 
                ? "Try saying: 'I would like two smoky truffle beef burgers with fries and a cola'" 
                : "Ask for items, request allergy changes, or complete order checkout."
              }
            </p>

            {/* Transcript Mock */}
            {voiceListening && (
              <div className="w-full mt-8 p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                <span className="text-xs text-white/40 uppercase block mb-1">Live Transcript</span>
                <p className="text-sm font-semibold italic text-[#d7ff7a]">"I want a smoky truffle beef burger..."</p>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center text-xs text-white/40 pt-6 border-t border-white/5">
            <span>Powered by neural voice processing</span>
            <span>Step 11 of 18</span>
          </div>
        </div>
      );
      break;

    case "AI ordering":
      currentScreenContent = (
        <div className="p-8 rounded-[36px] bg-[#0c0f0a] border border-white/10 min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div className="max-w-2xl mx-auto w-full my-auto space-y-6">
            <div className="text-center">
              <span className="font-mono text-xs text-[#d7ff7a] tracking-[0.3em] uppercase">AI Culinary Guide</span>
              <h2 className="text-4xl font-bold tracking-tight text-white mt-4">Order with Nori</h2>
              <p className="text-white/50 text-sm mt-2">Let AI build your tailored meal bundle based on calorie counts, protein goals or dietary flags.</p>
            </div>

            {/* Chat History Box */}
            <div className="border border-white/10 bg-white/[0.02] rounded-3xl p-6 min-h-[250px] max-h-[360px] overflow-y-auto flex flex-col justify-end space-y-4">
              <div className="flex gap-3 items-start">
                <span className="size-8 rounded-lg bg-[#d7ff7a]/15 text-[#d7ff7a] flex items-center justify-center shrink-0 mt-0.5"><Sparkles size={14} /></span>
                <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-none p-4 max-w-[85%] text-xs md:text-sm text-white/80 leading-relaxed">
                  Hi! I'm Nori, your digital food guide. Tell me your dietary needs or budget limit and I'll curate your exact meal.
                </div>
              </div>

              {aiMessages.map(message => message.sender === "user" ? (
                <div key={message.id} className="flex gap-3 items-start justify-end">
                  <div className="bg-[#d7ff7a]/10 border border-[#d7ff7a]/20 rounded-2xl rounded-tr-none p-4 max-w-[85%] text-xs md:text-sm text-white/90 leading-relaxed">
                    {message.text}
                  </div>
                </div>
              ) : (
                <div key={message.id} className="flex gap-3 items-start">
                  <span className="size-8 rounded-lg bg-[#d7ff7a]/15 text-[#d7ff7a] flex items-center justify-center shrink-0 mt-0.5"><Sparkles size={14} /></span>
                  <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-none p-4 max-w-[85%] text-xs md:text-sm text-white/80 leading-relaxed">
                    {message.text}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="flex gap-3 items-start">
                  <span className="size-8 rounded-lg bg-[#d7ff7a]/15 text-[#d7ff7a] flex items-center justify-center shrink-0 mt-0.5"><Sparkles size={14} /></span>
                  <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-none px-4 py-3 text-sm text-white/45 animate-pulse">Nori is checking the menu…</div>
                </div>
              )}
              <div ref={aiHistoryEndRef} />
            </div>

            {/* Input Form */}
            <form className="flex items-center gap-3 bg-white/[0.03] border border-white/10 rounded-[22px] p-2.5 pl-5" onSubmit={event => { event.preventDefault(); void sendAIMessage(); }}>
              <Sparkles className="text-[#d7ff7a] shrink-0" size={20} />
              <input 
                type="text" 
                placeholder="Ask Nori: 'Find a lunch under $12, peanut-free'" 
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={event => {
                  if (shouldSubmitNoriKey({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing })) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
              />
              <button 
                type="submit"
                disabled={!aiPrompt.trim() || aiLoading}
                className="px-5 py-3 bg-[#d7ff7a] hover:bg-[#bce650] text-[#17200f] rounded-xl text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {aiLoading ? "Thinking…" : "Ask Nori"}
              </button>
            </form>
          </div>

          <div className="mt-8 border-t border-white/5 pt-6 text-xs text-white/40 text-center">
            Nori analyzes active kitchen stock and ingredients in real-time
          </div>
        </div>
      );
      break;

    case "Listing":
      currentScreenContent = (
        <div className="p-8 rounded-[36px] bg-[#0c0f0a] border border-white/10 min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div>
            <div className="flex justify-between items-end mb-6">
              <div>
                <span className="font-mono text-xs text-[#d7ff7a] tracking-[0.2em] uppercase">Burgers & Mains</span>
                <h2 className="text-3xl font-bold text-white mt-2">Burgers</h2>
              </div>
              <span className="text-xs text-white/40">{fullMenu.filter(i=>i.tag==="BEST SELLER" || i.tag==="NEW").length} Featured Items Available</span>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {fullMenu.map(item => (
                <div key={item.id} className="overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.02] flex flex-col justify-between group hover:border-[#d7ff7a]/30 transition-all">
                  <div className="relative h-48 overflow-hidden bg-black/40">
                    <img src={item.image} alt={item.name} className="size-full object-cover group-hover:scale-105 transition duration-500" />
                    {item.tag && (
                      <span className="absolute left-4 top-4 bg-[#d7ff7a] text-black text-[9px] font-bold font-mono px-3 py-1 rounded-full uppercase tracking-wider">
                        {item.tag}
                      </span>
                    )}
                    <button 
                      onClick={() => toggleFavorite(item.id)}
                      className="absolute right-4 top-4 size-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center hover:bg-black/60 transition"
                    >
                      <Heart size={16} className={favorites.includes(item.id) ? "fill-[#ff6363] text-[#ff6363]" : "text-white"} />
                    </button>
                  </div>

                  <div className="p-6 flex flex-col justify-between flex-1">
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <h4 className="font-bold text-lg text-white leading-tight">{item.name}</h4>
                        <span className="font-mono font-bold text-base text-[#d7ff7a]">${item.price.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-white/45 mt-2 leading-relaxed min-h-[48px]">{item.desc}</p>
                    </div>

                    <div className="flex justify-between items-center mt-6 pt-4 border-t border-white/5">
                      <div className="flex items-center gap-3 text-xs text-white/50">
                        <span className="flex items-center gap-1"><Star size={13} className="text-[#d7ff7a] fill-[#d7ff7a]"/> {item.rating || 4.7}</span>
                        <span>•</span>
                        <span>{item.cal} Cal</span>
                      </div>
                      <button 
                        onClick={() => addToCart(item)}
                        className="px-5 py-3 rounded-xl bg-white hover:bg-[#d7ff7a] text-black font-semibold text-xs transition"
                      >
                        Add to Order
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
      break;

    case "Favorites":
      currentScreenContent = (
        <div className="p-8 rounded-[36px] bg-[#0c0f0a] border border-white/10 min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div>
            <div className="flex items-center gap-2 mb-6">
              <button onClick={() => setScreen("Home")} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition"><ChevronLeft size={16} /></button>
              <div>
                <span className="font-mono text-xs text-[#d7ff7a] tracking-[0.2em] uppercase">User Favorites</span>
                <h2 className="text-3xl font-bold text-white mt-1">Your Favorite items</h2>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {fullMenu.filter(i => favorites.includes(i.id)).map(item => (
                <div key={item.id} className="flex gap-4 p-5 rounded-[26px] border border-white/10 bg-white/[0.02]">
                  <img src={item.image} alt={item.name} className="size-24 rounded-xl object-cover shrink-0" />
                  <div className="flex-1 flex flex-col justify-between min-w-0">
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <h4 className="font-bold text-base text-white truncate">{item.name}</h4>
                        <span className="font-mono font-semibold text-[#d7ff7a]">${item.price.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-white/45 mt-1 line-clamp-2 leading-relaxed">{item.desc}</p>
                    </div>
                    <div className="flex justify-between items-center mt-4">
                      <span className="text-xs text-white/50">{item.cal} Cal</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleFavorite(item.id)} className="p-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-red-400"><X size={14}/></button>
                        <button onClick={() => addToCart(item)} className="px-4 py-2 bg-white text-black hover:bg-[#d7ff7a] rounded-lg text-xs font-semibold transition">Quick Add</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
      break;

    case "Offers":
      currentScreenContent = (
        <div className="p-8 rounded-[36px] bg-[#0c0f0a] border border-white/10 min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div>
            <div className="flex items-center gap-2 mb-6">
              <button onClick={() => setScreen("Home")} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition"><ChevronLeft size={16} /></button>
              <div>
                <span className="font-mono text-xs text-[#d7ff7a] tracking-[0.2em] uppercase">Daily Drops</span>
                <h2 className="text-3xl font-bold text-white mt-1">Exclusive Promo Coupons</h2>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="rounded-[28px] bg-[#ffb86c] p-8 text-[#382306] relative overflow-hidden flex flex-col justify-between min-h-[220px]">
                <div>
                  <span className="font-mono text-[9px] tracking-[0.25em] bg-black/10 px-3 py-1 rounded-full uppercase">COUPON: MEAL2X</span>
                  <h3 className="text-3xl font-bold mt-4 leading-none">Double Combo Deal</h3>
                  <p className="text-xs opacity-80 mt-2">Get two crispy burgers and two orders of rosemary fries for only $18.80 total.</p>
                </div>
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-black/10">
                  <span className="text-xs font-mono font-bold">Expires in 2h 45m</span>
                  <button onClick={() => {
                    const burger = fullMenu.find(m => m.id === "1");
                    const fries = fullMenu.find(m => m.id === "3");
                    if(burger) addToCart(burger);
                    if(fries) addToCart(fries);
                  }} className="px-5 py-3 bg-black hover:bg-black/80 text-white rounded-xl text-xs font-bold transition">Apply coupon</button>
                </div>
              </div>

              <div className="rounded-[28px] bg-[#d7ff7a] p-8 text-[#17200f] relative overflow-hidden flex flex-col justify-between min-h-[220px]">
                <div>
                  <span className="font-mono text-[9px] tracking-[0.25em] bg-black/10 px-3 py-1 rounded-full uppercase">COUPON: MATCHA50</span>
                  <h3 className="text-3xl font-bold mt-4 leading-none">Sweet Matcha discount</h3>
                  <p className="text-xs opacity-80 mt-2">Add a dessert to any salad order and get your Iced Matcha Latte at 50% discount.</p>
                </div>
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-black/10">
                  <span className="text-xs font-mono font-bold">Limited to rewards members</span>
                  <button onClick={() => {
                    const matcha = fullMenu.find(m => m.id === "5");
                    if(matcha) addToCart(matcha);
                  }} className="px-5 py-3 bg-[#17200f] hover:bg-black text-[#d7ff7a] rounded-xl text-xs font-bold transition">Claim Drink</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
      break;

    case "Recommendations":
      currentScreenContent = (
        <div className="p-8 rounded-[36px] bg-[#0c0f0a] border border-white/10 min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <span className="font-mono text-xs text-[#d7ff7a] tracking-[0.2em] uppercase">Smart Recommendations</span>
                <h2 className="text-3xl font-bold text-white mt-1">Recommended for You</h2>
              </div>
              <span className="text-xs text-[#d7ff7a] font-mono flex items-center gap-1.5"><Sparkles size={14}/> Curated at {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {fullMenu.slice(0, 3).map(item => (
                <div key={item.id} className="p-5 rounded-[26px] border border-white/10 bg-white/[0.02] flex flex-col justify-between group hover:border-[#d7ff7a]/30 transition-all">
                  <div className="relative h-40 rounded-xl overflow-hidden mb-4">
                    <img src={item.image} alt={item.name} className="size-full object-cover" />
                    <span className="absolute bottom-2 left-2 text-[10px] bg-black/60 px-2 py-0.5 rounded text-[#d7ff7a] font-mono">92% Match Score</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-white">{item.name}</h4>
                    <p className="text-xs text-white/45 mt-1 min-h-[36px] line-clamp-2 leading-relaxed">{item.desc}</p>
                  </div>
                  <div className="flex justify-between items-center mt-6 pt-4 border-t border-white/5">
                    <span className="font-mono font-bold text-sm text-[#d7ff7a]">${item.price.toFixed(2)}</span>
                    <button onClick={() => addToCart(item)} className="px-4 py-2.5 bg-white text-black hover:bg-[#d7ff7a] rounded-lg text-xs font-semibold transition">Quick Add</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
      break;

    case "Recent":
      currentScreenContent = (
        <div className="p-8 rounded-[36px] bg-[#0c0f0a] border border-white/10 min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div>
            <div className="flex items-center gap-2 mb-6">
              <button onClick={() => setScreen("Home")} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition"><ChevronLeft size={16} /></button>
              <div>
                <span className="font-mono text-xs text-[#d7ff7a] tracking-[0.2em] uppercase">Order History</span>
                <h2 className="text-3xl font-bold text-white mt-1">Recently Ordered items</h2>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {fullMenu.slice(2, 5).map(item => (
                <div key={item.id} className="flex gap-4 p-5 rounded-[26px] border border-white/10 bg-white/[0.02] items-center">
                  <img src={item.image} alt={item.name} className="size-20 rounded-xl object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="font-bold text-sm text-white truncate">{item.name}</h4>
                      <span className="font-mono text-xs text-white/60">${item.price.toFixed(2)}</span>
                    </div>
                    <span className="text-[10px] text-[#d7ff7a] bg-[#d7ff7a]/15 px-2 py-0.5 rounded block w-fit mt-1">ORDERED 3 DAYS AGO</span>
                    <div className="flex justify-between items-center mt-3">
                      <span className="text-xs text-white/45">{item.cal} Cal</span>
                      <button onClick={() => addToCart(item)} className="px-4 py-2 bg-[#d7ff7a] text-black hover:bg-white rounded-lg text-xs font-semibold transition flex items-center gap-1">Reorder <Plus size={12}/></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
      break;

    default: // Popular Items
      currentScreenContent = (
        <div className="p-8 rounded-[36px] bg-[#0c0f0a] border border-white/10 min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <span className="font-mono text-xs text-[#d7ff7a] tracking-[0.2em] uppercase">Store Trends</span>
                <h2 className="text-3xl font-bold text-white mt-1">Trending Popular Items</h2>
              </div>
              <span className="text-xs text-white/40 flex items-center gap-1"><TrendingUp size={14} className="text-[#d7ff7a]"/> Updated Live</span>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {fullMenu.slice(0, 3).map((item, idx) => (
                <div key={item.id} className="p-5 rounded-[26px] border border-white/10 bg-white/[0.02] flex flex-col justify-between relative group hover:border-[#d7ff7a]/30 transition-all">
                  <span className="absolute top-4 left-4 size-8 rounded-full bg-[#d7ff7a] text-[#17200f] font-bold text-xs flex items-center justify-center shadow-lg shadow-[#d7ff7a]/20 z-10">#{idx+1}</span>
                  <div className="relative h-40 rounded-xl overflow-hidden mb-4">
                    <img src={item.image} alt={item.name} className="size-full object-cover" />
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-white">{item.name}</h4>
                    <p className="text-xs text-white/45 mt-1 min-h-[36px] line-clamp-2 leading-relaxed">{item.desc}</p>
                  </div>
                  <div className="flex justify-between items-center mt-6 pt-4 border-t border-white/5">
                    <span className="font-mono font-bold text-sm text-[#d7ff7a]">${item.price.toFixed(2)}</span>
                    <button onClick={() => addToCart(item)} className="px-4 py-2.5 bg-white text-black hover:bg-[#d7ff7a] rounded-lg text-xs font-semibold transition">Quick Add</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
  }

  return (
    <main className="min-h-screen bg-[#0f120e] font-['DM_Sans'] text-[#f8f8f3] overflow-x-hidden">
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-[1080px]">
        
        {/* Simulator Controls Sidebar */}
        <aside className="hidden" aria-hidden="true">
          <div className="flex items-center gap-2 mb-6">
            <span className="grid size-8 place-items-center rounded-lg bg-[#d7ff7a] text-black">
              <UtensilsCrossed size={16} />
            </span>
            <b className="text-sm">Morrow Demo Console</b>
          </div>

          <span className="font-['Space_Mono'] text-[9px] tracking-[0.2em] text-white/35 uppercase block mb-3">
            Simulate Kiosk Screens
          </span>

          <nav className="space-y-1">
            {screensList.map((scr) => (
              <button 
                key={scr.key} 
                onClick={() => setScreen(scr.key)} 
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs ${
                  screen === scr.key 
                    ? "bg-[#d7ff7a] font-semibold text-[#17200f]" 
                    : "text-white/55 hover:bg-white/5"
                }`}
              >
                <span>{scr.label}</span>
              </button>
            ))}
          </nav>

          <div className="mt-8 pt-6 border-t border-white/5">
            <span className="font-['Space_Mono'] text-[9px] tracking-[0.2em] text-white/35 uppercase block mb-3">
              Kiosk Hardware Info
            </span>
            <div className="space-y-2 text-[10px] text-white/45">
              <div className="flex justify-between"><span>Display size:</span><span>27 inch</span></div>
              <div className="flex justify-between"><span>Resolution:</span><span>2560 x 1440</span></div>
              <div className="flex justify-between"><span>Touch Engine:</span><span>Capacitive</span></div>
              <div className="flex justify-between"><span>Operating mode:</span><span>Kiosk Fullscreen</span></div>
            </div>
          </div>
        </aside>

        {/* Live Simulator View */}
        <section className="relative min-h-[100dvh] p-4 sm:p-6 md:p-8 flex flex-col justify-center">
          <div className="w-full max-w-6xl mx-auto">
            {currentScreenContent}
          </div>
        </section>
      </div>
    </main>
  );
}
