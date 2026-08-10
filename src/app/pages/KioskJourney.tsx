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
import CangujetLogo from "../components/branding/CangujetLogo";
import { supportedLanguages } from "../config/languages";

// Premium Unsplash Images for Kiosk Menu
const burgerImg = "/images/products/burger%20(2).png";
const chickenImg = "/images/products/chicken%20(3).png";
const friesImg = "/images/products/drink%20(4).png";
const saladImg = "/images/products/salads%20(2).png";
const drinkImg = "/images/products/drink%20(2).png";
const dessertImg = "/images/products/desserts%20(2).png";

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
    updateCustomizations, clearCart, setOrderType,
  } = useCart();
  const cartRef = useRef(sharedCart);
  useEffect(() => { cartRef.current = sharedCart; }, [sharedCart]);
  const executedActionIdsRef = useRef(new Set<string>());
  const actionResultsRef = useRef<NoriChatRequest["actionResults"]>([]);
  const [screen, setScreen] = useState(initialScreen);
  const [lang, setLang] = useState(language === "tr" ? "Türkçe" : "English");
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
    <div className="flex items-center justify-between border-b border-[#ECECEC] pb-6 mb-6">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-[#C41E19] text-[#FFFFFF] shadow-sm shadow-black/10">
          <UtensilsCrossed size={22} />
        </span>
        <div>
          <b className="text-lg tracking-tight text-[#1F1F1F]">cangujet Premium</b>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-['Plus_Jakarta_Sans'] text-[10px] tracking-widest text-[#C41E19]">KIOSK 04</span>
            <span className="text-[#9CA3AF] text-[10px]">•</span>
            <span className="text-[#9CA3AF] text-[10px]">Zone: Dining Lobby</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {onBackToSelection && (
          <button onClick={onBackToSelection} className="rounded-xl border border-[#ECECEC] bg-white px-4 py-2.5 text-xs font-semibold text-[#1F1F1F] shadow-sm transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[#ECECEC] hover:bg-[#F8F9FA] hover:shadow-md active:scale-[.98]">
            Exit Demo
          </button>
        )}
        <button onClick={() => setScreen("Access")} className="grid size-11 place-items-center rounded-xl border border-[#ECECEC] bg-white text-[#1F1F1F] shadow-sm transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[#ECECEC] hover:bg-[#F8F9FA] hover:shadow-md active:scale-[.98]">
          <Accessibility size={20} />
        </button>
      </div>
    </div>
  );

  let currentScreenContent: React.ReactNode;

  switch (screen) {
    case "Splash":
      currentScreenContent = (
        <div className="relative min-h-[750px] flex flex-col justify-between overflow-hidden rounded-2xl border border-[#ECECEC] bg-white p-10 shadow-[0_1px_3px_rgba(31,31,31,.04),0_12px_32px_rgba(31,31,31,.05)]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-[#F8F9FA] pointer-events-none" />
          
          <div className="flex justify-between items-center relative z-10">
            <div className="flex items-center gap-2 font-['Plus_Jakarta_Sans'] text-xs text-[#9CA3AF]">
              <span className="size-2 rounded-full bg-[#C41E19] animate-pulse" />
              SYSTEM ACTIVE · ONLINE
            </div>
            <div className="text-right text-xs text-[#9CA3AF] font-['Plus_Jakarta_Sans']">
              TAP SCREEN TO ORDER
            </div>
          </div>

          <div className="text-center relative z-10 max-w-xl mx-auto">
            <CangujetLogo variant="full" priority className="mx-auto mb-10 h-auto w-[clamp(15rem,38vw,22rem)]" />
            <p className="mt-4 font-['Plus_Jakarta_Sans'] text-xs tracking-[0.4em] text-[#C41E19] uppercase">
              Thoughtfully Crafted · Quietly Fast
            </p>
          </div>

          <div className="flex flex-col items-center gap-6 relative z-10">
            <button 
              onClick={() => setScreen("Welcome")}
              className="group flex items-center gap-4 rounded-2xl bg-[#C41E19] px-10 py-6 text-lg font-semibold text-[#FFFFFF] shadow-md transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-[#A8161A] hover:shadow-lg active:scale-[0.98]"
            >
              Start Your Order
              <ArrowRight className="group-hover:translate-x-1.5 transition-transform" size={20} />
            </button>
            <div className="flex items-center gap-6 text-xs text-[#9CA3AF] font-['Plus_Jakarta_Sans']">
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
        <div className="relative min-h-[750px] flex flex-col justify-between overflow-hidden rounded-2xl border border-[#ECECEC] bg-white p-10 shadow-[0_1px_3px_rgba(31,31,31,.04),0_12px_32px_rgba(31,31,31,.05)]">
          <img src={burgerImg} alt="Welcome Banner" className="absolute inset-0 size-full object-cover opacity-15 filter brightness-[0.95]" />
          <div className="absolute inset-0 bg-gradient-to-t from-white via-white/90 to-white/35" />
          
          <div className="relative z-10">
            <KioskHeader />
          </div>

          <div className="relative z-10 max-w-2xl mt-12">
            <span className="font-['Plus_Jakarta_Sans'] text-xs tracking-[0.25em] text-[#C41E19] uppercase bg-[#C41E19]/10 px-3 py-1.5 rounded-full border border-[#C41E19]/20">
              Premium Kiosk Ordering
            </span>
            <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-[#1F1F1F] mt-6 leading-tight">
              Crafted Fresh, <br />
              Just for You.
            </h2>
            <p className="text-[#6B7280] text-lg mt-6 leading-relaxed max-w-md">
              Order gourmet meals, customize ingredients, and checkout securely in seconds.
            </p>
          </div>

          <div className="relative z-10 flex flex-wrap gap-4 mt-12">
            <button 
              onClick={() => setScreen("Language")} 
              className="flex min-w-[200px] flex-1 items-center justify-center gap-3 rounded-2xl bg-[#C41E19] px-8 py-5 font-bold text-[#FFFFFF] shadow-sm transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-[#A8161A] hover:shadow-md active:scale-[.98]"
            >
              Order Now <ArrowRight size={18} />
            </button>
            <button 
              onClick={() => setScreen("Access")} 
              className="min-w-[200px] flex-1 rounded-2xl border border-[#ECECEC] bg-white px-8 py-5 font-bold text-[#1F1F1F] shadow-sm transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[#ECECEC] hover:bg-[#F8F9FA] hover:shadow-md active:scale-[.98]"
            >
              Accessibility Options
            </button>
          </div>
        </div>
      );
      break;

    case "Language":
      currentScreenContent = (
        <div className="p-8 md:p-12 rounded-2xl border border-[#ECECEC] bg-white shadow-[0_1px_3px_rgba(31,31,31,.04),0_12px_32px_rgba(31,31,31,.05)] min-h-[750px] flex flex-col justify-between">
          <KioskHeader />
          
          <div className="text-center max-w-xl mx-auto my-auto">
            <span className="font-['Plus_Jakarta_Sans'] text-xs text-[#C41E19] tracking-[0.3em] uppercase">Select Language</span>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-[#1F1F1F] mt-4">Let's Speak Your Language</h2>
            <p className="text-[#6B7280] text-sm mt-3">You can easily change this setting at any point during your transaction.</p>

            <div className="grid gap-4 mt-10">
              {supportedLanguages.map(option => {
                const x = {
                  code: option.code,
                  name: option.nativeName,
                  greet: option.code === "tr" ? "Hoş geldiniz, afiyet olsun" : "Welcome & Enjoy",
                };
                return (
                <button 
                  key={x.code}
                  onClick={() => {
                    setLang(x.name);
                    setLanguage(x.code);
                    setScreen("Access");
                  }}
                  className={`flex items-center justify-between rounded-2xl border p-6 text-left transition-[transform,background-color,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(31,31,31,.08)] ${
                    lang === x.name 
                      ? "border-[#C41E19] bg-[#C41E19]/10 text-[#1F1F1F]"
                      : "border-[#ECECEC] bg-white text-[#6B7280] hover:bg-[#F8F9FA]"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="grid size-12 place-items-center rounded-xl bg-[#F8F9FA] border border-[#ECECEC] text-[#C41E19]">
                      <Globe2 size={20} />
                    </span>
                    <div>
                      <b className="text-lg block">{x.name}</b>
                      <span className="text-xs text-[#9CA3AF] block mt-0.5">{x.greet}</span>
                    </div>
                  </div>
                  <ChevronRight size={20} className={lang === x.name ? "text-[#C41E19]" : "text-[#9CA3AF]"} />
                </button>
              );})}
            </div>
          </div>

          <div className="flex justify-between items-center text-xs text-[#9CA3AF] pt-6 border-t border-[#ECECEC]">
            <span>Powered by SmartTrans™</span>
            <span>Step 3 of 18</span>
          </div>
        </div>
      );
      break;

    case "Access":
      currentScreenContent = (
        <div className="p-8 md:p-12 rounded-2xl border border-[#ECECEC] bg-white shadow-[0_1px_3px_rgba(31,31,31,.04),0_12px_32px_rgba(31,31,31,.05)] min-h-[750px] flex flex-col justify-between">
          <KioskHeader />
          
          <div className="max-w-3xl mx-auto w-full my-auto">
            <span className="font-['Plus_Jakarta_Sans'] text-xs text-[#C41E19] tracking-[0.2em] uppercase">Accessibility Settings</span>
            <h2 className="text-4xl font-bold tracking-tight text-[#1F1F1F] mt-3">Tailor Your Experience</h2>
            <p className="text-[#6B7280] text-sm mt-2">Adjust accessibility configurations below for easier kiosk navigation.</p>

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
                    className={`flex min-h-[140px] flex-col justify-between rounded-2xl border p-6 text-left transition-[transform,background-color,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(31,31,31,.08)] ${
                      isActive 
                        ? "border-[#C41E19] bg-[#C41E19]/5"
                        : "border-[#ECECEC] bg-white hover:bg-[#F8F9FA]"
                    }`}
                  >
                    <div className="flex items-start justify-between w-full">
                      <span className={`p-2.5 rounded-lg border ${isActive ? "bg-[#C41E19]/10 border-[#C41E19] text-[#C41E19]" : "bg-[#F8F9FA] border-[#ECECEC] text-[#6B7280]"}`}>
                        {x.icon}
                      </span>
                      <span className={`w-5 h-5 rounded-full border flex items-center justify-center ${isActive ? "bg-[#C41E19] border-[#C41E19] text-[#FFFFFF]" : "border-[#ECECEC]"}`}>
                        {isActive && <Check size={12} strokeWidth={3} />}
                      </span>
                    </div>
                    <div>
                      <b className="text-base text-[#1F1F1F] block mt-4">{x.name}</b>
                      <span className="text-xs text-[#9CA3AF] block mt-1 leading-relaxed">{x.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex gap-4">
              <button onClick={() => setScreen("Service")} className="rounded-xl bg-[#C41E19] px-8 py-4 font-bold text-[#FFFFFF] shadow-sm transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-[#A8161A] hover:shadow-md active:scale-[.98]">
                Apply & Continue
              </button>
              <button onClick={() => setScreen("Welcome")} className="rounded-xl border border-[#ECECEC] bg-white px-8 py-4 font-semibold text-[#1F1F1F] shadow-sm transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[#ECECEC] hover:bg-[#F8F9FA] hover:shadow-md active:scale-[.98]">
                Back
              </button>
            </div>
          </div>
          
          <div className="text-center text-xs text-[#9CA3AF] pt-6 border-t border-[#ECECEC]">
            Settings will apply universally across your session.
          </div>
        </div>
      );
      break;

    case "Service":
      currentScreenContent = (
        <div className="p-8 md:p-12 rounded-2xl border border-[#ECECEC] bg-white shadow-[0_1px_3px_rgba(31,31,31,.04),0_12px_32px_rgba(31,31,31,.05)] min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div className="max-w-2xl mx-auto text-center my-auto w-full">
            <span className="font-['Plus_Jakarta_Sans'] text-xs text-[#C41E19] tracking-[0.3em] uppercase">Dining Option</span>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-[#1F1F1F] mt-4">Where Will You Eat?</h2>
            <p className="text-[#6B7280] text-sm mt-3">Select your preference so we can package your meal correctly.</p>

            <div className="grid md:grid-cols-2 gap-6 mt-10">
              {/* Eat Here */}
              <button 
                onClick={() => {
                  setSelectedDining("here");
                  setOrderType("dine_in");
                  setScreen("Guest login");
                }}
                className={`group rounded-2xl border p-8 text-center transition-[transform,background-color,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(31,31,31,.08)] ${
                  selectedDining === "here" 
                    ? "border-[#C41E19] bg-[#C41E19]/5"
                    : "border-[#ECECEC] bg-white hover:bg-[#F8F9FA]"
                }`}
              >
                <div className="mx-auto size-24 rounded-full bg-[#F8F9FA] border border-[#ECECEC] flex items-center justify-center text-[#C41E19] mb-6 group-hover:scale-105 transition-transform duration-300">
                  <UtensilsCrossed size={40} />
                </div>
                <h3 className="text-2xl font-bold text-[#1F1F1F]">Eat Here</h3>
                <p className="text-xs text-[#9CA3AF] mt-2 leading-relaxed max-w-[200px] mx-auto">
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
                className={`group rounded-2xl border p-8 text-center transition-[transform,background-color,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(31,31,31,.08)] ${
                  selectedDining === "away" 
                    ? "border-[#C41E19] bg-[#C41E19]/5"
                    : "border-[#ECECEC] bg-white hover:bg-[#F8F9FA]"
                }`}
              >
                <div className="mx-auto size-24 rounded-full bg-[#F8F9FA] border border-[#ECECEC] flex items-center justify-center text-[#C41E19] mb-6 group-hover:scale-105 transition-transform duration-300">
                  <ShoppingCart size={40} />
                </div>
                <h3 className="text-2xl font-bold text-[#1F1F1F]">Take Away</h3>
                <p className="text-xs text-[#9CA3AF] mt-2 leading-relaxed max-w-[200px] mx-auto">
                  Packaged in eco-friendly insulated bags to preserve freshness.
                </p>
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs text-[#9CA3AF] pt-6 border-t border-[#ECECEC]">
            <span>Table tracker sensors active</span>
            <span>Step 5 of 18</span>
          </div>
        </div>
      );
      break;

    case "Guest login":
      currentScreenContent = (
        <div className="p-8 md:p-12 rounded-2xl border border-[#ECECEC] bg-white shadow-[0_1px_3px_rgba(31,31,31,.04),0_12px_32px_rgba(31,31,31,.05)] min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div className="max-w-2xl mx-auto text-center my-auto w-full">
            <span className="font-['Plus_Jakarta_Sans'] text-xs text-[#C41E19] tracking-[0.3em] uppercase">Session Setup</span>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-[#1F1F1F] mt-4">Order Preference</h2>
            <p className="text-[#6B7280] text-sm mt-3">Earn reward points, track orders, or checkout quickly as a guest.</p>

            <div className="grid md:grid-cols-2 gap-6 mt-10">
              {/* Rewards Login */}
              <button 
                onClick={() => setScreen("Loyalty")}
                className="group rounded-2xl border border-[#ECECEC] bg-gradient-to-br from-[#C41E19]/10 to-transparent p-8 text-center shadow-sm transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#C41E19]/30 hover:shadow-md"
              >
                <div className="mx-auto size-16 rounded-2xl bg-[#C41E19] text-[#FFFFFF] flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                  <QrCode size={28} />
                </div>
                <h3 className="text-xl font-bold text-[#1F1F1F]">Loyalty & Rewards</h3>
                <p className="text-xs text-[#C41E19]/85 mt-2 leading-relaxed max-w-[200px] mx-auto">
                  Scan QR code, enter phone number, and unlock double point multipliers.
                </p>
              </button>

              {/* Guest Login */}
              <button 
                onClick={() => setScreen("Home")}
                className="group rounded-2xl border border-[#ECECEC] bg-white p-8 text-center shadow-sm transition-[background-color,transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#ECECEC] hover:bg-[#F8F9FA] hover:shadow-md"
              >
                <div className="mx-auto size-16 rounded-2xl bg-[#F8F9FA] border border-[#ECECEC] text-[#6B7280] flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                  <User size={28} />
                </div>
                <h3 className="text-xl font-bold text-[#1F1F1F]">Checkout as Guest</h3>
                <p className="text-xs text-[#9CA3AF] mt-2 leading-relaxed max-w-[200px] mx-auto">
                  Proceed straight to menu selection. You can register anytime during checkout.
                </p>
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs text-[#9CA3AF] pt-6 border-t border-[#ECECEC]">
            <span>Guest sessions automatically clear after checkout</span>
            <span>Step 6 of 18</span>
          </div>
        </div>
      );
      break;

    case "Loyalty":
      currentScreenContent = (
        <div className="p-8 md:p-12 rounded-2xl border border-[#ECECEC] bg-white shadow-[0_1px_3px_rgba(31,31,31,.04),0_12px_32px_rgba(31,31,31,.05)] min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div className="max-w-2xl mx-auto w-full my-auto">
            <div className="text-center mb-8">
              <span className="font-['Plus_Jakarta_Sans'] text-xs text-[#C41E19] tracking-[0.3em] uppercase">Rewards Sign In</span>
              <h2 className="text-4xl font-bold tracking-tight text-[#1F1F1F] mt-4">Welcome Back</h2>
              <p className="text-[#6B7280] text-sm mt-2">Scan your app barcode or enter your registered phone number.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 items-center">
              {/* QR scanner demo */}
              <div className="flex flex-col items-center rounded-2xl border border-[#ECECEC] bg-white p-8 text-center shadow-sm">
                <div className="size-48 bg-[#F8F9FA] rounded-2xl border border-[#ECECEC] flex items-center justify-center p-4 relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-full h-1 bg-[#C41E19] animate-pulse" />
                  <QrCode size={120} className="text-[#9CA3AF]" />
                </div>
                <span className="text-xs text-[#9CA3AF] block mt-4 font-['Plus_Jakarta_Sans']">ALIGN APP CODE WITH SCANNER BELOW</span>
              </div>

              {/* Keyboard mock input */}
              <div className="space-y-4">
                <div className="flex rounded-2xl border border-[#ECECEC] bg-white p-2.5 shadow-sm transition-[border-color,box-shadow] focus-within:border-[#C41E19] focus-within:ring-4 focus-within:ring-[#C41E19]/10">
                  <span className="px-3 flex items-center text-[#9CA3AF]"><Smartphone size={18} /></span>
                  <input 
                    type="text" 
                    readOnly 
                    value={loyaltyPhone || "Enter Mobile Number"} 
                    className={`min-w-0 flex-1 bg-transparent px-2 py-1 outline-none text-lg font-semibold ${loyaltyPhone ? "text-[#1F1F1F]" : "text-[#9CA3AF]"}`}
                  />
                  {loyaltyPhone && (
                    <button onClick={() => setLoyaltyPhone("")} className="p-2 text-[#9CA3AF] hover:text-[#1F1F1F]"><X size={16}/></button>
                  )}
                </div>

                {/* Simulated keypad */}
                <div className="grid grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map(num => (
                    <button 
                      key={num} 
                      onClick={() => setLoyaltyPhone(prev => prev.length < 10 ? prev + num : prev)}
                      className="rounded-xl border border-[#ECECEC] bg-white py-3.5 font-semibold text-[#1F1F1F] shadow-sm transition-[background-color,border-color,box-shadow,transform] hover:border-[#ECECEC] hover:bg-[#F8F9FA] hover:shadow-md active:scale-[.97]"
                    >
                      {num}
                    </button>
                  ))}
                  <button 
                    onClick={() => setScreen("Home")}
                    className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-[#C41E19] py-3.5 font-bold text-[#FFFFFF] shadow-sm transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-[#A8161A] hover:shadow-md active:scale-[.98]"
                  >
                    Confirm <Check size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs text-[#9CA3AF] pt-6 border-t border-[#ECECEC]">
            <span>Points balance updates instantly</span>
            <span>Step 7 of 18</span>
          </div>
        </div>
      );
      break;

    case "Home":
      currentScreenContent = (
        <div className="p-8 rounded-2xl border border-[#ECECEC] bg-white shadow-[0_1px_3px_rgba(31,31,31,.04),0_12px_32px_rgba(31,31,31,.05)] min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div className="grid xl:grid-cols-[1fr_360px] gap-8 items-start">
            <div className="space-y-8">
              {/* Promo Banner */}
              <div 
                onClick={() => setScreen("Offers")}
                className="cursor-pointer relative overflow-hidden rounded-2xl border border-[#ECECEC] bg-white p-8 text-[#1F1F1F] shadow-[0_1px_3px_rgba(31,31,31,.04),0_8px_24px_rgba(31,31,31,.05)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[#ECECEC] hover:shadow-[0_8px_24px_rgba(31,31,31,.09)] group"
              >
                <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-[#F8F9FA] group-hover:scale-105 transition-transform duration-300" />
                <span className="font-['Plus_Jakarta_Sans'] text-[10px] tracking-[0.25em] bg-[#F8F9FA] px-3 py-1 rounded-full uppercase">Today's Special drop</span>
                <h3 className="text-4xl font-bold tracking-tight mt-6 leading-none">The Crisp is <br />Calling.</h3>
                <p className="mt-3 text-sm opacity-80 max-w-sm">Enjoy our delicious Crispy chicken burger bundled with Golden Rosemary fries and cold drink at special discount.</p>
                <div className="mt-6 flex items-center gap-4">
                  <span className="text-2xl font-bold font-['Plus_Jakarta_Sans']">$13.50</span>
                  <span className="line-through text-xs opacity-50 font-['Plus_Jakarta_Sans']">$18.90</span>
                  <span className="rounded-full bg-[#C41E19] px-2.5 py-1 text-[10px] font-bold text-[#FFFFFF]">SAVE 28%</span>
                </div>
              </div>

              {/* Categories Navigation */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-[#1F1F1F]">Browse Categories</h3>
                  <button onClick={() => setScreen("Categories")} className="text-xs text-[#C41E19] hover:underline flex items-center gap-1">View All <ChevronRight size={14} /></button>
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
                      className="rounded-2xl border border-[#ECECEC] bg-white p-4 text-center shadow-sm transition-[background-color,transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#ECECEC] hover:bg-[#F8F9FA] hover:shadow-md"
                    >
                      <b className="text-sm text-[#1F1F1F] block">{cat.name}</b>
                      <span className="text-[10px] text-[#9CA3AF] block mt-1">{cat.count} Items</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recommendation row */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-[#1F1F1F]">Curated for You</h3>
                  <button onClick={() => setScreen("Recommendations")} className="text-xs text-[#C41E19] hover:underline flex items-center gap-1">Nori Picks <Sparkles size={12} /></button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {fullMenu.slice(0, 2).map(item => (
                    <div key={item.id} className="group relative flex gap-4 rounded-2xl border border-[#ECECEC] bg-white p-4 shadow-sm transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#C41E19]/30 hover:shadow-md">
                      <img src={item.image} alt={item.name} className="size-20 rounded-xl object-cover" />
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start gap-1">
                            <h4 className="font-semibold text-sm truncate text-[#1F1F1F]">{item.name}</h4>
                            <span className="font-['Plus_Jakarta_Sans'] text-xs text-[#C41E19]">${item.price.toFixed(2)}</span>
                          </div>
                          <p className="text-[11px] text-[#9CA3AF] truncate mt-1">{item.desc}</p>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-[10px] text-[#6B7280]">{item.cal} Cal</span>
                          <button onClick={() => addToCart(item)} className="grid size-8 place-items-center rounded-lg border border-[#ECECEC] bg-white text-[#1F1F1F] shadow-sm transition-[background-color,border-color,color,transform] hover:border-[#C41E19] hover:bg-[#C41E19] hover:text-[#FFFFFF] active:scale-95"><Plus size={14} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar quick actions */}
            <div className="space-y-6 rounded-2xl border border-[#ECECEC] bg-white p-6 shadow-[0_1px_3px_rgba(31,31,31,.04),0_8px_24px_rgba(31,31,31,.05)]">
              <h4 className="text-sm font-bold text-[#6B7280] tracking-wider uppercase">Order Methods</h4>
              
              <button onClick={() => setScreen("Search")} className="flex w-full items-center gap-4 rounded-2xl border border-[#ECECEC] bg-white p-4 text-left shadow-sm transition-[background-color,transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-[#ECECEC] hover:bg-[#F8F9FA] hover:shadow-md active:scale-[.99]">
                <span className="p-2.5 rounded-xl bg-[#F8F9FA] text-[#C41E19]"><Search size={20} /></span>
                <div>
                  <b className="text-sm text-[#1F1F1F] block">Intelligent Search</b>
                  <span className="text-xs text-[#9CA3AF] block mt-0.5">Filter allergens, calorie limits</span>
                </div>
              </button>

              <button onClick={() => setScreen("AI ordering")} className="group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-[#C41E19]/20 bg-[#C41E19]/5 p-4 text-left shadow-sm transition-[background-color,transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-[#C41E19]/35 hover:bg-[#C41E19]/10 hover:shadow-md active:scale-[.99]">
                <span className="p-2.5 rounded-xl bg-[#C41E19]/10 text-[#C41E19]"><Sparkles size={20} /></span>
                <div>
                  <b className="text-sm text-[#1F1F1F] block">Speak with Nori AI</b>
                  <span className="text-xs text-[#C41E19]/70 block mt-0.5">Custom meal builder</span>
                </div>
              </button>

              <button onClick={() => setScreen("Voice search")} className="flex w-full items-center gap-4 rounded-2xl border border-[#ECECEC] bg-white p-4 text-left shadow-sm transition-[background-color,transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-[#ECECEC] hover:bg-[#F8F9FA] hover:shadow-md active:scale-[.99]">
                <span className="p-2.5 rounded-xl bg-[#F8F9FA] text-[#C41E19]"><Mic size={20} /></span>
                <div>
                  <b className="text-sm text-[#1F1F1F] block">Voice Order Command</b>
                  <span className="text-xs text-[#9CA3AF] block mt-0.5">Tap & speak your menu choices</span>
                </div>
              </button>

              <div className="border-t border-[#ECECEC] pt-6">
                <div className="flex justify-between text-xs text-[#9CA3AF] mb-2"><span>Cart Items</span><span>{cart.length}</span></div>
                <div className="flex justify-between text-sm font-semibold text-[#1F1F1F] mb-4"><span>Subtotal</span><span>${cart.reduce((s,i)=>s+i.price, 0).toFixed(2)}</span></div>
                <button disabled={!cart.length} onClick={onCheckout} className="w-full rounded-2xl bg-[#C41E19] py-4 text-center font-bold text-[#FFFFFF] shadow-sm transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-[#A8161A] hover:shadow-md active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-sm">Review Cart</button>
              </div>
            </div>
          </div>
        </div>
      );
      break;

    case "Categories":
      currentScreenContent = (
        <div className="p-8 rounded-2xl border border-[#ECECEC] bg-white shadow-[0_1px_3px_rgba(31,31,31,.04),0_12px_32px_rgba(31,31,31,.05)] min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div>
            <div className="flex items-center gap-2 mb-6">
              <button onClick={() => setScreen("Home")} className="grid size-10 place-items-center rounded-xl border border-[#ECECEC] bg-white text-[#6B7280] shadow-sm transition-[background-color,color,border-color,transform] hover:border-[#ECECEC] hover:bg-[#F8F9FA] hover:text-[#1F1F1F] active:scale-95"><ChevronLeft size={16} /></button>
              <h2 className="text-3xl font-bold text-[#1F1F1F]">All Menu Categories</h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              {[
                { name: "Premium Burgers", items: "8 Items", desc: "100% Angus beef, fresh brioche buns", bg: "from-[#F8F9FA]" },
                { name: "Crispy Chicken", items: "6 Items", desc: "Brined 24h, hand-battered breast", bg: "from-[#F8F9FA]" },
                { name: "Golden Combos", items: "5 Items", desc: "Curated bundles save up to 30%", bg: "from-[#C41E19]/5" },
                { name: "Rosemary Sides", items: "12 Items", desc: "Sea salted fries, dynamic snacks", bg: "from-[#F8F9FA]" },
                { name: "Artisanal Drinks", items: "15 Items", desc: "Cold brews, matcha, natural juices", bg: "from-[#F8F9FA]" },
                { name: "Warm Desserts", items: "7 Items", desc: "Souffle, pastries, vanilla cream", bg: "from-[#F8F9FA]" }
              ].map((c, idx) => (
                <div 
                  key={c.name}
                  onClick={() => setScreen("Listing")}
                  className={`group flex min-h-[220px] cursor-pointer flex-col justify-between rounded-2xl border border-[#ECECEC] bg-gradient-to-br ${c.bg} to-transparent p-8 shadow-sm transition-[background-color,transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#C41E19]/30 hover:bg-[#F8F9FA] hover:shadow-md`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-['Plus_Jakarta_Sans'] text-xs text-[#C41E19]">0{idx+1}</span>
                    <span className="text-xs bg-[#F8F9FA] border border-[#ECECEC] px-2.5 py-1 rounded-full text-[#6B7280]">{c.items}</span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-[#1F1F1F] group-hover:text-[#C41E19] transition-colors">{c.name}</h3>
                    <p className="text-xs text-[#9CA3AF] mt-2 leading-relaxed">{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 border-t border-[#ECECEC] pt-6 flex justify-between items-center text-xs text-[#9CA3AF]">
            <span>Tap category card to view item listings</span>
            <span>Step 9 of 18</span>
          </div>
        </div>
      );
      break;

    case "Search":
      currentScreenContent = (
        <div className="p-8 rounded-2xl border border-[#ECECEC] bg-white shadow-[0_1px_3px_rgba(31,31,31,.04),0_12px_32px_rgba(31,31,31,.05)] min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div>
            <div className="flex items-center gap-2 mb-6">
              <button onClick={() => setScreen("Home")} className="grid size-10 place-items-center rounded-xl border border-[#ECECEC] bg-white text-[#6B7280] shadow-sm transition-[background-color,color,border-color,transform] hover:border-[#ECECEC] hover:bg-[#F8F9FA] hover:text-[#1F1F1F] active:scale-95"><ChevronLeft size={16} /></button>
              <h2 className="text-3xl font-bold text-[#1F1F1F]">Intelligent Catalog Search</h2>
            </div>

            {/* Large Search Bar */}
            <div className="relative flex items-center gap-4 rounded-2xl border border-[#ECECEC] bg-white p-4 pl-6 shadow-sm transition-[border-color,box-shadow] focus-within:border-[#C41E19] focus-within:ring-4 focus-within:ring-[#C41E19]/10">
              <Search className="text-[#C41E19]" size={24} />
              <input 
                type="text" 
                autoFocus
                placeholder="Try: 'Spicy chicken with high protein' or 'Vegan sides'" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-lg text-[#1F1F1F] placeholder:text-[#9CA3AF] outline-none"
              />
              <button onClick={() => setScreen("Voice search")} className="grid size-11 place-items-center rounded-xl border border-[#ECECEC] bg-white text-[#C41E19] shadow-sm transition-[background-color,border-color,transform] hover:border-[#ECECEC] hover:bg-[#F8F9FA] active:scale-95">
                <Mic size={18} />
              </button>
            </div>

            {/* Search Filters */}
            <div className="mt-6 flex flex-wrap gap-2">
              {["High Protein", "Spicy", "Vegetarian", "Dairy-Free", "Under $10", "Low Calorie"].map(filter => (
                <button 
                  key={filter}
                  onClick={() => setSearchQuery(filter)}
                  className="rounded-full border border-[#ECECEC] bg-white px-4 py-2 text-xs text-[#6B7280] shadow-sm transition-[background-color,color,border-color,transform] hover:-translate-y-0.5 hover:border-[#C41E19] hover:bg-[#C41E19] hover:text-[#FFFFFF] active:scale-[.98]"
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Results Grid */}
            <div className="mt-10">
              <h4 className="text-sm font-bold text-[#6B7280] uppercase tracking-wider mb-4">Matching menu Items</h4>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {fullMenu
                  .filter(i => 
                    i.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    i.desc.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map(item => (
                    <div key={item.id} className="flex flex-col justify-between rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-sm transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#C41E19]/30 hover:shadow-md">
                      <div className="flex gap-4">
                        <img src={item.image} alt={item.name} className="size-20 rounded-xl object-cover shrink-0" />
                        <div>
                          <h5 className="font-bold text-sm text-[#1F1F1F]">{item.name}</h5>
                          <p className="text-xs text-[#9CA3AF] mt-1 line-clamp-2 leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                      <div className="flex justify-between items-center mt-6 pt-4 border-t border-[#ECECEC]">
                        <span className="font-['Plus_Jakarta_Sans'] font-bold text-[#C41E19] text-sm">${item.price.toFixed(2)}</span>
                        <button onClick={() => addToCart(item)} className="px-4 py-2 border border-[#ECECEC] bg-white text-[#1F1F1F] hover:border-[#C41E19] hover:bg-[#C41E19] hover:text-[#FFFFFF] transition rounded-lg text-xs font-semibold">Add to Order</button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-[#ECECEC] pt-6 text-xs text-[#9CA3AF]">
            Realtime catalog index contains 56 custom variants
          </div>
        </div>
      );
      break;

    case "Voice search":
      currentScreenContent = (
        <div className="p-8 rounded-2xl border border-[#ECECEC] bg-white shadow-[0_1px_3px_rgba(31,31,31,.04),0_12px_32px_rgba(31,31,31,.05)] min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div className="max-w-xl mx-auto text-center my-auto w-full flex flex-col items-center">
            <span className="font-['Plus_Jakarta_Sans'] text-xs text-[#C41E19] tracking-[0.3em] uppercase">Voice Recognition</span>
            
            {/* Visual Wave */}
            <div className="my-10 relative flex justify-center items-center h-48 w-full">
              <div className={`absolute w-36 h-36 rounded-full border border-[#C41E19]/20 bg-[#C41E19]/5 transition-all duration-1000 ${voiceListening ? "scale-125 opacity-20" : ""}`} />
              <div className={`absolute w-28 h-28 rounded-full border border-[#C41E19]/30 bg-[#C41E19]/10 transition-all duration-700 ${voiceListening ? "scale-110 opacity-30" : ""}`} />
              
              <button 
                onClick={() => setVoiceListening(!voiceListening)}
                className={`z-10 grid size-20 place-items-center rounded-full bg-[#C41E19] text-[#FFFFFF] transition-[background-color,box-shadow,transform] hover:bg-[#A8161A] active:scale-95 ${voiceListening ? "shadow-[0_8px_24px_rgba(196,30,25,.24)]" : "shadow-md"}`}
              >
                <Mic size={32} />
              </button>
            </div>

            <h3 className="text-3xl font-bold text-[#1F1F1F]">{voiceListening ? "Listening Now..." : "Tap Mic to Speak"}</h3>
            <p className="text-[#6B7280] text-sm mt-3 leading-relaxed max-w-sm">
              {voiceListening 
                ? "Try saying: 'I would like two smoky truffle beef burgers with fries and a cola'" 
                : "Ask for items, request allergy changes, or complete order checkout."
              }
            </p>

            {/* Transcript Mock */}
            {voiceListening && (
              <div className="w-full mt-8 p-4 rounded-xl bg-[#F8F9FA] border border-[#ECECEC] text-center">
                <span className="text-xs text-[#9CA3AF] uppercase block mb-1">Live Transcript</span>
                <p className="text-sm font-semibold italic text-[#C41E19]">"I want a smoky truffle beef burger..."</p>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center text-xs text-[#9CA3AF] pt-6 border-t border-[#ECECEC]">
            <span>Powered by neural voice processing</span>
            <span>Step 11 of 18</span>
          </div>
        </div>
      );
      break;

    case "AI ordering":
      currentScreenContent = (
        <div className="p-8 rounded-2xl border border-[#ECECEC] bg-white shadow-[0_1px_3px_rgba(31,31,31,.04),0_12px_32px_rgba(31,31,31,.05)] min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div className="max-w-2xl mx-auto w-full my-auto space-y-6">
            <div className="text-center">
              <span className="font-['Plus_Jakarta_Sans'] text-xs text-[#C41E19] tracking-[0.3em] uppercase">AI Culinary Guide</span>
              <h2 className="text-4xl font-bold tracking-tight text-[#1F1F1F] mt-4">Order with Nori</h2>
              <p className="text-[#6B7280] text-sm mt-2">Let AI build your tailored meal bundle based on calorie counts, protein goals or dietary flags.</p>
            </div>

            {/* Chat History Box */}
            <div className="flex min-h-[250px] max-h-[360px] flex-col justify-end space-y-4 overflow-y-auto rounded-2xl border border-[#ECECEC] bg-[#F8F9FA] p-6 shadow-inner">
              <div className="flex gap-3 items-start">
                <span className="size-8 rounded-lg bg-[#C41E19]/15 text-[#C41E19] flex items-center justify-center shrink-0 mt-0.5"><Sparkles size={14} /></span>
                <div className="max-w-[85%] rounded-2xl rounded-tl-none border border-[#ECECEC] bg-white p-4 text-xs leading-relaxed text-[#1F1F1F] shadow-sm md:text-sm">
                  Hi! I'm Nori, your digital food guide. Tell me your dietary needs or budget limit and I'll curate your exact meal.
                </div>
              </div>

              {aiMessages.map(message => message.sender === "user" ? (
                <div key={message.id} className="flex gap-3 items-start justify-end">
                  <div className="bg-[#C41E19]/10 border border-[#C41E19]/20 rounded-2xl rounded-tr-none p-4 max-w-[85%] text-xs md:text-sm text-[#1F1F1F] leading-relaxed">
                    {message.text}
                  </div>
                </div>
              ) : (
                <div key={message.id} className="flex gap-3 items-start">
                  <span className="size-8 rounded-lg bg-[#C41E19]/15 text-[#C41E19] flex items-center justify-center shrink-0 mt-0.5"><Sparkles size={14} /></span>
                  <div className="max-w-[85%] rounded-2xl rounded-tl-none border border-[#ECECEC] bg-white p-4 text-xs leading-relaxed text-[#1F1F1F] shadow-sm md:text-sm">
                    {message.text}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="flex gap-3 items-start">
                  <span className="size-8 rounded-lg bg-[#C41E19]/15 text-[#C41E19] flex items-center justify-center shrink-0 mt-0.5"><Sparkles size={14} /></span>
                  <div className="animate-pulse rounded-2xl rounded-tl-none border border-[#ECECEC] bg-white px-4 py-3 text-sm text-[#9CA3AF] shadow-sm">Nori is checking the menu…</div>
                </div>
              )}
              <div ref={aiHistoryEndRef} />
            </div>

            {/* Input Form */}
            <form className="flex items-center gap-3 rounded-xl border border-[#ECECEC] bg-white p-2.5 pl-5 shadow-sm transition-[border-color,box-shadow] focus-within:border-[#C41E19] focus-within:ring-4 focus-within:ring-[#C41E19]/10" onSubmit={event => { event.preventDefault(); void sendAIMessage(); }}>
              <Sparkles className="text-[#C41E19] shrink-0" size={20} />
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
                className="w-full bg-transparent text-sm text-[#1F1F1F] outline-none placeholder:text-[#9CA3AF]"
              />
              <button 
                type="submit"
                disabled={!aiPrompt.trim() || aiLoading}
                className="rounded-xl bg-[#C41E19] px-5 py-3 text-xs font-bold text-[#FFFFFF] shadow-sm transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-[#A8161A] hover:shadow-md active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
              >
                {aiLoading ? "Thinking…" : "Ask Nori"}
              </button>
            </form>
          </div>

          <div className="mt-8 border-t border-[#ECECEC] pt-6 text-xs text-[#9CA3AF] text-center">
            Nori analyzes active kitchen stock and ingredients in real-time
          </div>
        </div>
      );
      break;

    case "Listing":
      currentScreenContent = (
        <div className="p-8 rounded-2xl border border-[#ECECEC] bg-white shadow-[0_1px_3px_rgba(31,31,31,.04),0_12px_32px_rgba(31,31,31,.05)] min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div>
            <div className="flex justify-between items-end mb-6">
              <div>
                <span className="font-['Plus_Jakarta_Sans'] text-xs text-[#C41E19] tracking-[0.2em] uppercase">Burgers & Mains</span>
                <h2 className="text-3xl font-bold text-[#1F1F1F] mt-2">Burgers</h2>
              </div>
              <span className="text-xs text-[#9CA3AF]">{fullMenu.filter(i=>i.tag==="BEST SELLER" || i.tag==="NEW").length} Featured Items Available</span>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {fullMenu.map(item => (
                <div key={item.id} className="overflow-hidden rounded-2xl border border-[#ECECEC] bg-white flex flex-col justify-between group transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#C41E19]/35 hover:shadow-[0_8px_24px_rgba(31,31,31,.08)]">
                  <div className="relative h-48 overflow-hidden bg-white/90">
                    <img src={item.image} alt={item.name} className="size-full object-cover group-hover:scale-105 transition duration-500" />
                    {item.tag && (
                      <span className="absolute left-4 top-4 bg-[#C41E19] text-[#FFFFFF] text-[9px] font-bold font-['Plus_Jakarta_Sans'] px-3 py-1 rounded-full uppercase tracking-wider">
                        {item.tag}
                      </span>
                    )}
                    <button 
                      onClick={() => toggleFavorite(item.id)}
                      className="absolute right-4 top-4 grid size-10 place-items-center rounded-full border border-white/70 bg-white/90 shadow-sm backdrop-blur transition-[background-color,box-shadow,transform] hover:bg-white hover:shadow-md active:scale-95"
                    >
                      <Heart size={16} className={favorites.includes(item.id) ? "fill-[#C41E19] text-[#C41E19]" : "text-[#1F1F1F]"} />
                    </button>
                  </div>

                  <div className="p-6 flex flex-col justify-between flex-1">
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <h4 className="font-bold text-lg text-[#1F1F1F] leading-tight">{item.name}</h4>
                        <span className="font-['Plus_Jakarta_Sans'] font-bold text-base text-[#C41E19]">${item.price.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-[#9CA3AF] mt-2 leading-relaxed min-h-[48px]">{item.desc}</p>
                    </div>

                    <div className="flex justify-between items-center mt-6 pt-4 border-t border-[#ECECEC]">
                      <div className="flex items-center gap-3 text-xs text-[#6B7280]">
                        <span className="flex items-center gap-1"><Star size={13} className="text-[#C41E19] fill-[#C41E19]"/> {item.rating || 4.7}</span>
                        <span>•</span>
                        <span>{item.cal} Cal</span>
                      </div>
                      <button 
                        onClick={() => addToCart(item)}
                        className="rounded-xl border border-[#ECECEC] bg-white px-5 py-3 text-xs font-semibold text-[#1F1F1F] shadow-sm transition-[background-color,color,border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[#C41E19] hover:bg-[#C41E19] hover:text-[#FFFFFF] hover:shadow-md active:scale-[.98]"
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
        <div className="p-8 rounded-2xl border border-[#ECECEC] bg-white shadow-[0_1px_3px_rgba(31,31,31,.04),0_12px_32px_rgba(31,31,31,.05)] min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div>
            <div className="flex items-center gap-2 mb-6">
              <button onClick={() => setScreen("Home")} className="grid size-10 place-items-center rounded-xl border border-[#ECECEC] bg-white text-[#6B7280] shadow-sm transition-[background-color,color,border-color,transform] hover:border-[#ECECEC] hover:bg-[#F8F9FA] hover:text-[#1F1F1F] active:scale-95"><ChevronLeft size={16} /></button>
              <div>
                <span className="font-['Plus_Jakarta_Sans'] text-xs text-[#C41E19] tracking-[0.2em] uppercase">User Favorites</span>
                <h2 className="text-3xl font-bold text-[#1F1F1F] mt-1">Your Favorite items</h2>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {fullMenu.filter(i => favorites.includes(i.id)).map(item => (
                <div key={item.id} className="flex gap-4 rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-sm transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#C41E19]/30 hover:shadow-md">
                  <img src={item.image} alt={item.name} className="size-24 rounded-xl object-cover shrink-0" />
                  <div className="flex-1 flex flex-col justify-between min-w-0">
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <h4 className="font-bold text-base text-[#1F1F1F] truncate">{item.name}</h4>
                        <span className="font-['Plus_Jakarta_Sans'] font-semibold text-[#C41E19]">${item.price.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-[#9CA3AF] mt-1 line-clamp-2 leading-relaxed">{item.desc}</p>
                    </div>
                    <div className="flex justify-between items-center mt-4">
                      <span className="text-xs text-[#6B7280]">{item.cal} Cal</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleFavorite(item.id)} className="grid size-9 place-items-center rounded-lg border border-[#ECECEC] bg-white text-[#C41E19] shadow-sm transition-[background-color,border-color,transform] hover:border-[#C41E19]/30 hover:bg-[#F8F9FA] active:scale-95"><X size={14}/></button>
                        <button onClick={() => addToCart(item)} className="px-4 py-2 border border-[#ECECEC] bg-white text-[#1F1F1F] hover:border-[#C41E19] hover:bg-[#C41E19] hover:text-[#FFFFFF] rounded-lg text-xs font-semibold transition">Quick Add</button>
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
        <div className="p-8 rounded-2xl border border-[#ECECEC] bg-white shadow-[0_1px_3px_rgba(31,31,31,.04),0_12px_32px_rgba(31,31,31,.05)] min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div>
            <div className="flex items-center gap-2 mb-6">
              <button onClick={() => setScreen("Home")} className="grid size-10 place-items-center rounded-xl border border-[#ECECEC] bg-white text-[#6B7280] shadow-sm transition-[background-color,color,border-color,transform] hover:border-[#ECECEC] hover:bg-[#F8F9FA] hover:text-[#1F1F1F] active:scale-95"><ChevronLeft size={16} /></button>
              <div>
                <span className="font-['Plus_Jakarta_Sans'] text-xs text-[#C41E19] tracking-[0.2em] uppercase">Daily Drops</span>
                <h2 className="text-3xl font-bold text-[#1F1F1F] mt-1">Exclusive Promo Coupons</h2>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-2xl border border-[#ECECEC] bg-white p-8 text-[#1F1F1F] shadow-[0_1px_3px_rgba(31,31,31,.04),0_8px_24px_rgba(31,31,31,.05)]">
                <div>
                  <span className="font-['Plus_Jakarta_Sans'] text-[9px] tracking-[0.25em] bg-[#F8F9FA] px-3 py-1 rounded-full uppercase">COUPON: MEAL2X</span>
                  <h3 className="text-3xl font-bold mt-4 leading-none">Double Combo Deal</h3>
                  <p className="text-xs opacity-80 mt-2">Get two crispy burgers and two orders of rosemary fries for only $18.80 total.</p>
                </div>
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-[#ECECEC]">
                  <span className="text-xs font-['Plus_Jakarta_Sans'] font-bold">Expires in 2h 45m</span>
                  <button onClick={() => {
                    const burger = fullMenu.find(m => m.id === "1");
                    const fries = fullMenu.find(m => m.id === "3");
                    if(burger) addToCart(burger);
                    if(fries) addToCart(fries);
                  }} className="rounded-xl bg-[#C41E19] px-5 py-3 text-xs font-bold text-[#FFFFFF] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#A8161A] hover:shadow-md active:scale-[.98]">Apply coupon</button>
                </div>
              </div>

              <div className="relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-2xl border border-[#ECECEC] bg-white p-8 text-[#1F1F1F] shadow-[0_1px_3px_rgba(31,31,31,.04),0_8px_24px_rgba(31,31,31,.05)]">
                <div>
                  <span className="font-['Plus_Jakarta_Sans'] text-[9px] tracking-[0.25em] bg-[#F8F9FA] px-3 py-1 rounded-full uppercase">COUPON: MATCHA50</span>
                  <h3 className="text-3xl font-bold mt-4 leading-none">Sweet Matcha discount</h3>
                  <p className="text-xs opacity-80 mt-2">Add a dessert to any salad order and get your Iced Matcha Latte at 50% discount.</p>
                </div>
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-[#ECECEC]">
                  <span className="text-xs font-['Plus_Jakarta_Sans'] font-bold">Limited to rewards members</span>
                  <button onClick={() => {
                    const matcha = fullMenu.find(m => m.id === "5");
                    if(matcha) addToCart(matcha);
                  }} className="rounded-xl bg-[#C41E19] px-5 py-3 text-xs font-bold text-[#FFFFFF] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#A8161A] hover:shadow-md active:scale-[.98]">Claim Drink</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
      break;

    case "Recommendations":
      currentScreenContent = (
        <div className="p-8 rounded-2xl border border-[#ECECEC] bg-white shadow-[0_1px_3px_rgba(31,31,31,.04),0_12px_32px_rgba(31,31,31,.05)] min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <span className="font-['Plus_Jakarta_Sans'] text-xs text-[#C41E19] tracking-[0.2em] uppercase">Smart Recommendations</span>
                <h2 className="text-3xl font-bold text-[#1F1F1F] mt-1">Recommended for You</h2>
              </div>
              <span className="text-xs text-[#C41E19] font-['Plus_Jakarta_Sans'] flex items-center gap-1.5"><Sparkles size={14}/> Curated at {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {fullMenu.slice(0, 3).map(item => (
                <div key={item.id} className="p-5 rounded-2xl border border-[#ECECEC] bg-white flex flex-col justify-between group transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#C41E19]/35 hover:shadow-[0_8px_24px_rgba(31,31,31,.08)]">
                  <div className="relative h-40 rounded-xl overflow-hidden mb-4">
                    <img src={item.image} alt={item.name} className="size-full object-cover" />
                    <span className="absolute bottom-2 left-2 text-[10px] bg-white/90 px-2 py-0.5 rounded text-[#C41E19] font-['Plus_Jakarta_Sans']">92% Match Score</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-[#1F1F1F]">{item.name}</h4>
                    <p className="text-xs text-[#9CA3AF] mt-1 min-h-[36px] line-clamp-2 leading-relaxed">{item.desc}</p>
                  </div>
                  <div className="flex justify-between items-center mt-6 pt-4 border-t border-[#ECECEC]">
                    <span className="font-['Plus_Jakarta_Sans'] font-bold text-sm text-[#C41E19]">${item.price.toFixed(2)}</span>
                    <button onClick={() => addToCart(item)} className="px-4 py-2.5 border border-[#ECECEC] bg-white text-[#1F1F1F] hover:border-[#C41E19] hover:bg-[#C41E19] hover:text-[#FFFFFF] rounded-lg text-xs font-semibold transition">Quick Add</button>
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
        <div className="p-8 rounded-2xl border border-[#ECECEC] bg-white shadow-[0_1px_3px_rgba(31,31,31,.04),0_12px_32px_rgba(31,31,31,.05)] min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div>
            <div className="flex items-center gap-2 mb-6">
              <button onClick={() => setScreen("Home")} className="grid size-10 place-items-center rounded-xl border border-[#ECECEC] bg-white text-[#6B7280] shadow-sm transition-[background-color,color,border-color,transform] hover:border-[#ECECEC] hover:bg-[#F8F9FA] hover:text-[#1F1F1F] active:scale-95"><ChevronLeft size={16} /></button>
              <div>
                <span className="font-['Plus_Jakarta_Sans'] text-xs text-[#C41E19] tracking-[0.2em] uppercase">Order History</span>
                <h2 className="text-3xl font-bold text-[#1F1F1F] mt-1">Recently Ordered items</h2>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {fullMenu.slice(2, 5).map(item => (
                <div key={item.id} className="flex items-center gap-4 rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-sm transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#C41E19]/30 hover:shadow-md">
                  <img src={item.image} alt={item.name} className="size-20 rounded-xl object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="font-bold text-sm text-[#1F1F1F] truncate">{item.name}</h4>
                      <span className="font-['Plus_Jakarta_Sans'] text-xs text-[#6B7280]">${item.price.toFixed(2)}</span>
                    </div>
                    <span className="text-[10px] text-[#C41E19] bg-[#C41E19]/15 px-2 py-0.5 rounded block w-fit mt-1">ORDERED 3 DAYS AGO</span>
                    <div className="flex justify-between items-center mt-3">
                      <span className="text-xs text-[#9CA3AF]">{item.cal} Cal</span>
                      <button onClick={() => addToCart(item)} className="flex items-center gap-1 rounded-lg bg-[#C41E19] px-4 py-2 text-xs font-semibold text-[#FFFFFF] shadow-sm transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-[#A8161A] hover:shadow-md active:scale-[.98]">Reorder <Plus size={12}/></button>
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
        <div className="p-8 rounded-2xl border border-[#ECECEC] bg-white shadow-[0_1px_3px_rgba(31,31,31,.04),0_12px_32px_rgba(31,31,31,.05)] min-h-[750px] flex flex-col justify-between">
          <KioskHeader />

          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <span className="font-['Plus_Jakarta_Sans'] text-xs text-[#C41E19] tracking-[0.2em] uppercase">Store Trends</span>
                <h2 className="text-3xl font-bold text-[#1F1F1F] mt-1">Trending Popular Items</h2>
              </div>
              <span className="text-xs text-[#9CA3AF] flex items-center gap-1"><TrendingUp size={14} className="text-[#C41E19]"/> Updated Live</span>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {fullMenu.slice(0, 3).map((item, idx) => (
                <div key={item.id} className="p-5 rounded-2xl border border-[#ECECEC] bg-white flex flex-col justify-between relative group transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#C41E19]/35 hover:shadow-[0_8px_24px_rgba(31,31,31,.08)]">
                  <span className="absolute top-4 left-4 size-8 rounded-full bg-[#C41E19] text-[#FFFFFF] font-bold text-xs flex items-center justify-center shadow-sm shadow-black/10 z-10">#{idx+1}</span>
                  <div className="relative h-40 rounded-xl overflow-hidden mb-4">
                    <img src={item.image} alt={item.name} className="size-full object-cover" />
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-[#1F1F1F]">{item.name}</h4>
                    <p className="text-xs text-[#9CA3AF] mt-1 min-h-[36px] line-clamp-2 leading-relaxed">{item.desc}</p>
                  </div>
                  <div className="flex justify-between items-center mt-6 pt-4 border-t border-[#ECECEC]">
                    <span className="font-['Plus_Jakarta_Sans'] font-bold text-sm text-[#C41E19]">${item.price.toFixed(2)}</span>
                    <button onClick={() => addToCart(item)} className="px-4 py-2.5 border border-[#ECECEC] bg-white text-[#1F1F1F] hover:border-[#C41E19] hover:bg-[#C41E19] hover:text-[#FFFFFF] rounded-lg text-xs font-semibold transition">Quick Add</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F8F9FA] font-['Plus_Jakarta_Sans'] text-[#1F1F1F]">
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-[1080px]">
        
        {/* Simulator Controls Sidebar */}
        <aside className="hidden" aria-hidden="true">
          <div className="flex items-center gap-2 mb-6">
            <span className="grid size-8 place-items-center rounded-lg bg-[#C41E19] text-[#FFFFFF]">
              <UtensilsCrossed size={16} />
            </span>
            <b className="text-sm">cangujet Demo Console</b>
          </div>

          <span className="font-['Plus_Jakarta_Sans'] text-[9px] tracking-[0.2em] text-[#9CA3AF] uppercase block mb-3">
            Simulate Kiosk Screens
          </span>

          <nav className="space-y-1">
            {screensList.map((scr) => (
              <button 
                key={scr.key} 
                onClick={() => setScreen(scr.key)} 
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs ${
                  screen === scr.key 
                    ? "bg-[#C41E19] font-semibold text-[#FFFFFF]"
                    : "text-[#6B7280] hover:bg-[#F8F9FA]"
                }`}
              >
                <span>{scr.label}</span>
              </button>
            ))}
          </nav>

          <div className="mt-8 pt-6 border-t border-[#ECECEC]">
            <span className="font-['Plus_Jakarta_Sans'] text-[9px] tracking-[0.2em] text-[#9CA3AF] uppercase block mb-3">
              Kiosk Hardware Info
            </span>
            <div className="space-y-2 text-[10px] text-[#9CA3AF]">
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
