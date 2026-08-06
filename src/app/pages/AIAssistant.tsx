import { useEffect, useRef, useState } from "react";
import {
  Sparkles, Mic, Send, AlertTriangle, ShieldCheck, ChevronRight,
  ShoppingCart, ArrowLeft, X, ShieldAlert, Award, RefreshCw
} from "lucide-react";
import type { AIFoodItem as FoodItem } from "../data/aiMenu";
import {
  checkProductAllergens,
  findHealthyMeals,
  findHighProtein,
  findKidsMeals,
  findVegetarianMeals,
  noriMenuProducts,
  noriSupportedAllergens,
} from "../services/noriMenuEngine";
import type { NoriChatRequest, NoriConversationState } from "../../server/types/noriChat";
import { useCart } from "../context/CartContext";
import { executeNoriCartActions, serializeNoriCart } from "../services/noriCartActions";
import { postNoriChat, shouldSubmitNoriKey } from "../services/noriChatClient";

type Message = {
  sender: "user" | "bot";
  text: string;
  timestamp: string;
  recommendations?: FoodItem[];
  allergiesFlagged?: string[];
  upsellItem?: FoodItem;
};

export default function AIAssistant({ onBackToSelection }: { onBackToSelection?: () => void }) {
  const { items: cart, addItem, removeItem, updateQty, clearCart, subtotal, updateCustomizations } = useCart();
  const cartRef = useRef(cart);
  useEffect(() => { cartRef.current = cart; }, [cart]);
  const executedActionIdsRef = useRef<Set<string>>(new Set());
  const actionResultsRef = useRef<NoriChatRequest["actionResults"]>([]);
  const isSendingRef = useRef(false);
  const [activeTab, setActiveTab] = useState<"chat" | "presets" | "allergies">("chat");
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: "bot",
      text: "Hello! I am Nori, your AI culinary assistant. How can I help you order today? You can say things like 'I want something high protein' or 'What is under $12?'",
      timestamp: "Just now"
    }
  ]);
  const [inputVal, setInputVal] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [presetCategory, setPresetCategory] = useState<"healthy" | "vegetarian" | "kids" | "protein">("healthy");
  const [conversationState, setConversationState] = useState<NoriConversationState>();

  const resetConversation = () => {
    setConversationState(undefined);
    actionResultsRef.current = [];
    executedActionIdsRef.current.clear();
    setSelectedAllergens([]);
    setMessages([{
      sender: "bot",
      text: "Conversation reset. How can I help with your next order?",
      timestamp: "Just now",
    }]);
    setInputVal("");
  };

  const handleQuery = (queryText: string) => {
    if (!queryText.trim() || isSendingRef.current) return;
    isSendingRef.current = true;

    const newMsg: Message = {
      sender: "user",
      text: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newMsg]);
    setInputVal("");

    const currentCart = serializeNoriCart(cartRef.current);
    const request: NoriChatRequest = {
      message: queryText,
      cart: currentCart,
      activeAllergens: selectedAllergens,
      language: "en",
      conversationState,
      actionResults: actionResultsRef.current,
    };
    void postNoriChat(request)
      .then(result => {
        setConversationState(result.conversationState);
        const executionResults = executeNoriCartActions(result.actions, {
          addItem, updateCustomizations, removeItem, updateQty, clearCart,
        }, { executedActionIds: executedActionIdsRef.current, cartRef });
        actionResultsRef.current = executionResults.map(({ actionId, status }) => ({ actionId, status }));
        const cartExecutions = executionResults.filter(execution =>
          execution.status === "success"
          && result.actions.some(action => action.type === "add_to_cart" && action.actionId === execution.actionId),
        );
        const failedExecution = executionResults.some(item => item.status === "failed");
        const displayedReply = failedExecution
          ? "I could not add the items to your cart."
          : cartExecutions.length
            ? `Added ${cartExecutions.map(item => noriMenuProducts.find(product => product.id === item.productId)?.name).filter(Boolean).join(" and ")} to your cart.`
            : result.reply;
        const upsellAction = result.actions.find((action): action is Extract<typeof action, { type: "add_to_cart" }> =>
          action.type === "add_to_cart" && !result.recommendedProducts.some(product => product.id === action.productId),
        );
        setMessages(prev => [
          ...prev,
          {
            sender: "bot",
            text: displayedReply,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            recommendations: result.recommendedProducts,
            allergiesFlagged: result.warnings.length > 0 ? selectedAllergens : undefined,
            upsellItem: upsellAction ? noriMenuProducts.find(product => product.id === upsellAction.productId) : undefined,
          }
        ]);
      })
      .catch(() => {
        setMessages(prev => [...prev, {
          sender: "bot",
          text: "I could not reach the Nori service. Please try again or ask a staff member for help.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        }]);
      })
      .finally(() => { isSendingRef.current = false; });
  };

  // Keyboard simulator helper
  const sendSuggested = (txt: string) => {
    handleQuery(txt);
  };

  const toggleAllergenFilter = (allergen: string) => {
    setSelectedAllergens(prev => prev.includes(allergen) ? prev.filter(a => a !== allergen) : [...prev, allergen]);
  };

  const getPresetList = () => {
    switch (presetCategory) {
      case "healthy": return findHealthyMeals();
      case "vegetarian": return findVegetarianMeals();
      case "kids": return findKidsMeals();
      case "protein": return findHighProtein();
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col justify-between bg-[#F8F9FA] text-[#1F1F1F] selection:bg-[#C41E19]/10">

      {/* Top Header */}
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between border-b border-[#ECECEC] px-6 py-6">
        <div className="flex items-center gap-4">
          {onBackToSelection && (
            <button
              onClick={onBackToSelection}
              className="flex items-center justify-center rounded-2xl border border-[#ECECEC] bg-white p-3 text-[#6B7280] shadow-sm transition hover:border-[#C41E19]/25 hover:bg-[#C41E19]/5 hover:text-[#C41E19]"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl border border-[#C41E19]/20 bg-[#C41E19]/5 text-[#C41E19] shadow-sm">
              <Sparkles size={20} />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Nori AI Assistant</h1>
              <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-widest text-[#C41E19]">Conversational ordering</span>
            </div>
          </div>
        </div>

        {/* Cart counter */}
        <div className="flex items-center gap-3">
          <button
            onClick={resetConversation}
            className="flex items-center gap-2 rounded-full border border-[#ECECEC] bg-white px-4 py-2 font-mono text-xs text-[#6B7280] shadow-sm transition hover:border-[#C41E19]/25 hover:bg-[#C41E19]/5 hover:text-[#C41E19]"
            title="Reset conversation"
          >
            <RefreshCw size={14} className="text-[#C41E19]" /> Reset
          </button>
          <span className="flex items-center gap-2 rounded-full border border-[#ECECEC] bg-white px-4 py-2 font-mono text-xs text-[#6B7280] shadow-sm">
            <ShoppingCart size={14} className="text-[#C41E19]" /> Cart: {cart.reduce((sum, item) => sum + item.qty, 0)} item(s)
          </span>
        </div>
      </header>

      {/* Simulator Core Layout */}
      <section className="flex-1 w-full max-w-7xl mx-auto px-6 py-8 grid lg:grid-cols-12 gap-8 items-stretch relative z-10">

        {/* Left Side: Chat Simulator & Voice Mic (Lg: col-span-7) */}
        <div className="relative flex min-h-[600px] flex-col justify-between overflow-hidden rounded-2xl border border-[#ECECEC] bg-white shadow-[0_12px_40px_rgba(31,31,31,.07)] lg:col-span-7">

          {/* Chat Panel Switcher Tabs */}
          <div className="flex border-b border-[#ECECEC] bg-[#F8F9FA]">
            {[
              { id: "chat", label: "AI Conversational Chat" },
              { id: "presets", label: "Category Presets" },
              { id: "allergies", label: "Allergy Filters" }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-4 text-xs font-mono uppercase tracking-wider font-semibold border-b-2 transition-all ${activeTab === tab.id
                  ? "border-[#C41E19] bg-[#C41E19]/5 text-[#C41E19]"
                  : "border-transparent text-[#6B7280] hover:bg-white hover:text-[#1F1F1F]"
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Interactive Panels */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6 max-h-[460px]">

            {activeTab === "chat" && (
              <>
                {/* Chat History bubbles */}
                {messages.map((msg, index) => (
                  <div key={index} className={`flex gap-3 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>

                    {msg.sender === "bot" && (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#C41E19]/20 bg-[#C41E19]/5 text-[#C41E19]"><Sparkles size={16} /></span>
                    )}

                    <div className="space-y-4 max-w-[80%]">
                      <div className={`rounded-2xl border p-4 text-sm leading-relaxed ${msg.sender === "user"
                        ? "rounded-tr-none border-[#C41E19] bg-[#C41E19] text-white"
                        : "rounded-tl-none border-[#ECECEC] bg-[#F8F9FA] text-[#1F1F1F]"
                        }`}>
                        {msg.text}
                        <span className={`mt-2 block text-right font-mono text-[9px] ${msg.sender === "user" ? "text-white/65" : "text-[#9CA3AF]"}`}>{msg.timestamp}</span>
                      </div>

                      {/* Display bot recommended products */}
                      {msg.sender === "bot" && msg.recommendations && (
                        <div className="grid sm:grid-cols-2 gap-3 mt-2">
                          {msg.recommendations.map(rec => {
                            const hasAllergen = checkProductAllergens(rec, selectedAllergens).hasRisk;
                            return (
                              <div key={rec.id} className={`flex flex-col justify-between gap-3 rounded-2xl border p-4 ${hasAllergen ? "border-[#C41E19]/20 bg-[#C41E19]/5" : "border-[#ECECEC] bg-white shadow-sm"}`}>
                                <div className="flex gap-3">
                                  <img src={rec.image} alt={rec.name} className="size-14 rounded-lg object-cover shrink-0" />
                                  <div className="min-w-0">
                                    <h5 className="truncate text-xs font-bold text-[#1F1F1F]">{rec.name}</h5>
                                    <span className="mt-0.5 block text-[10px] text-[#6B7280]">{rec.cal} Cal · {rec.protein} P</span>
                                    {hasAllergen && (
                                      <span className="text-[9px] text-[#C41E19] font-bold block mt-1 flex items-center gap-1"><ShieldAlert size={10} /> Contains allergen</span>
                                    )}
                                  </div>
                                </div>
                                <div className="mt-2 flex items-center justify-between border-t border-[#ECECEC] pt-2">
                                  <b className="font-mono text-xs text-[#C41E19]">${rec.price.toFixed(2)}</b>
                                  <button
                                    onClick={() => executeNoriCartActions([{
                                      type: "add_to_cart",
                                      actionId: `manual-${rec.id}-${Date.now()}`,
                                      productId: rec.id,
                                      quantity: 1,
                                      customizations: [],
                                      label: `Add ${rec.name}`,
                                    }], { addItem })}
                                    className="rounded-lg bg-[#C41E19] px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-[#A8161A]"
                                  >
                                    Add to Cart
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Bot Upsell Banner */}
                      {msg.sender === "bot" && msg.upsellItem && (
                        <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#C41E19]/20 bg-[#C41E19]/5 p-4">
                          <div className="flex items-center gap-3">
                            <span className="rounded-xl bg-white p-2 text-[#C41E19] shadow-sm"><Award size={16} /></span>
                            <div>
                              <b className="block text-xs text-[#1F1F1F]">Special cross-sell upgrade</b>
                              <span className="mt-0.5 block text-[10px] text-[#6B7280]">Pair with {msg.upsellItem.name} for only +${msg.upsellItem.price.toFixed(2)}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              if (msg.upsellItem) executeNoriCartActions([{
                                type: "add_to_cart",
                                actionId: `upsell-${msg.upsellItem.id}-${Date.now()}`,
                                productId: msg.upsellItem.id,
                                quantity: 1,
                                customizations: [],
                                label: `Add ${msg.upsellItem.name}`,
                              }], { addItem });
                            }}
                            className="rounded-lg bg-[#C41E19] px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-[#A8161A]"
                          >
                            Add Bundle
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            {activeTab === "presets" && (
              <div className="space-y-6">
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "healthy", label: "Healthy Meals" },
                    { id: "vegetarian", label: "Vegetarian Selections" },
                    { id: "kids", label: "Kids Combo" },
                    { id: "protein", label: "High Protein gym Picks" }
                  ].map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setPresetCategory(cat.id as any)}
                      className={`px-4 py-2 text-xs rounded-full border transition ${presetCategory === cat.id
                        ? "border-[#C41E19] bg-[#C41E19]/5 text-[#C41E19]"
                        : "border-[#ECECEC] bg-white text-[#6B7280] hover:border-[#C41E19]/25 hover:text-[#C41E19]"
                        }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {getPresetList()?.map(item => (
                    <div key={item.id} className="group relative flex gap-4 overflow-hidden rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-sm">
                      <img src={item.image} alt={item.name} className="size-20 rounded-xl object-cover shrink-0" />
                      <div className="flex-1 flex flex-col justify-between min-w-0">
                        <div>
                          <h4 className="truncate text-sm font-bold text-[#1F1F1F]">{item.name}</h4>
                          <p className="mt-1 text-[11px] text-[#6B7280]">{item.cal} Cal · {item.protein} Protein</p>
                        </div>
                        <div className="flex justify-between items-center mt-4">
                          <b className="font-mono text-xs text-[#C41E19]">${item.price.toFixed(2)}</b>
                          <button
                            onClick={() => executeNoriCartActions([{
                              type: "add_to_cart",
                              actionId: `preset-${item.id}-${Date.now()}`,
                              productId: item.id,
                              quantity: 1,
                              customizations: [],
                              label: `Add ${item.name}`,
                            }], { addItem })}
                            className="rounded-lg bg-[#C41E19] px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-[#A8161A]"
                          >
                            Quick Add
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "allergies" && (
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 text-sm font-bold text-[#1F1F1F]">Select Active Allergens</h3>
                  <p className="mb-4 text-xs text-[#6B7280]">Flag ingredients you are allergic to. Nori AI will automatically highlight warning signs on matching menu items.</p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {noriSupportedAllergens.map(all => {
                      const active = selectedAllergens.includes(all);
                      return (
                        <button
                          key={all}
                          onClick={() => toggleAllergenFilter(all)}
                          className={`p-4 rounded-xl border text-center transition-all ${active
                            ? "border-[#C41E19]/30 bg-[#C41E19]/5 text-[#C41E19]"
                            : "border-[#ECECEC] bg-white text-[#6B7280] hover:border-[#ECECEC] hover:bg-[#F8F9FA]"
                            }`}
                        >
                          <b className="text-xs block">{all}</b>
                          <span className="text-[9px] block mt-1">{active ? "Flagged Unsafe" : "No allergy"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-[#ECECEC] pt-6">
                  <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-[#6B7280]">Allergy Risk Detection Preview</h4>
                  <div className="space-y-2">
                    {noriMenuProducts.map(item => {
                      const allergenCheck = checkProductAllergens(item, selectedAllergens);
                      const containsAllergen = allergenCheck.hasRisk;
                      return (
                        <div key={item.id} className={`flex items-center justify-between rounded-xl border p-3 ${containsAllergen ? "border-[#C41E19]/20 bg-[#C41E19]/5 text-[#C41E19]" : "border-[#ECECEC] bg-[#F8F9FA] text-[#1F1F1F]"}`}>
                          <span className="text-xs font-semibold">{item.name}</span>
                          {containsAllergen ? (
                            <span className="text-[10px] font-bold font-mono text-[#C41E19] uppercase flex items-center gap-1"><AlertTriangle size={12} /> Risk ({[...allergenCheck.contains, ...allergenCheck.mayContain, ...allergenCheck.crossContact].join(", ")})</span>
                          ) : (
                            <span className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase text-[#C41E19]"><ShieldCheck size={12} /> Safe</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Large Chat Input Bar / Voice Soundwave */}
          <form className="flex items-center gap-3 border-t border-[#ECECEC] bg-[#F8F9FA] p-4" onSubmit={event => { event.preventDefault(); handleQuery(inputVal); }}>
            {isListening ? (
              <div className="flex flex-1 items-center gap-4 rounded-2xl border border-[#ECECEC] bg-white p-3 px-5">
                <span className="size-2.5 rounded-full bg-[#C41E19]/50 animate-ping shrink-0" />
                <div className="flex-1 h-6 flex items-center justify-center gap-1">
                  {[1, 2, 3, 4, 3, 2, 4, 1, 2, 3, 4, 2, 3, 1, 4, 2, 3, 4, 2, 1].map((h, i) => (
                    <span
                      key={i}
                      className="w-1 animate-pulse rounded-full bg-[#C41E19]"
                      style={{
                        height: `${h * 6}px`,
                        animationDelay: `${i * 0.05}s`
                      }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsListening(false);
                    handleQuery("I want two spicy chicken burgers with fries.");
                  }}
                  className="rounded-xl bg-[#C41E19] px-4 py-2 text-xs font-bold text-white hover:bg-[#A8161A]"
                >
                  Process Voice
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsListening(true)}
                  className="shrink-0 rounded-2xl border border-[#ECECEC] bg-white p-3.5 text-[#C41E19] transition hover:border-[#C41E19]/25 hover:bg-[#C41E19]/5"
                >
                  <Mic size={20} />
                </button>
                <input
                  type="text"
                  placeholder="Ask Nori: 'I want something under $12' or 'Show me kids combos'"
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  onKeyDown={e => {
                    if (shouldSubmitNoriKey({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  className="flex-1 rounded-2xl border border-[#ECECEC] bg-white px-5 py-3.5 text-sm text-[#1F1F1F] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#C41E19] focus:ring-2 focus:ring-[#C41E19]/10"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-2xl bg-[#C41E19] p-3.5 text-white transition hover:bg-[#A8161A]"
                >
                  <Send size={18} />
                </button>
              </>
            )}
          </form>

        </div>

        {/* Right Side: Natural Language Suggestions & Up/Cross-Sell Cart Preview (Lg: col-span-5) */}
        <div className="lg:col-span-5 space-y-6 flex flex-col justify-between">

          {/* Quick Mock Prompt Examples */}
          <div className="rounded-2xl border border-[#ECECEC] bg-white p-6 shadow-[0_8px_28px_rgba(31,31,31,.05)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(31,31,31,.08)]">
            <h4 className="mb-4 flex items-center gap-2 text-sm font-bold tracking-tight text-[#1F1F1F]">
              <Sparkles size={16} className="text-[#C41E19]" /> Natural Language Prompts
            </h4>
            <p className="mb-4 text-xs text-[#6B7280]">Tap any pre-built query to test Nori's NLP parsing and catalog suggestions instantly:</p>

            <div className="space-y-2.5">
              {[
                "I want two spicy chicken burgers with fries.",
                "I need something healthy under $12.",
                "Find me high protein gym meals.",
                "Is there anything suitable for kids?",
                "Warning: Gluten and Dairy allergy alert."
              ].map(ex => (
                <button
                  key={ex}
                  onClick={() => sendSuggested(ex)}
                  className="group flex w-full items-center justify-between rounded-xl border border-[#ECECEC] bg-[#F8F9FA] p-3.5 text-left text-xs text-[#1F1F1F] transition hover:border-[#C41E19]/25 hover:bg-[#C41E19]/5 hover:text-[#C41E19]"
                >
                  <span className="truncate">{ex}</span>
                  <ChevronRight size={14} className="shrink-0 text-[#9CA3AF] transition-all group-hover:translate-x-0.5 group-hover:text-[#C41E19]" />
                </button>
              ))}
            </div>
          </div>

          {/* Cart Live Preview & Estimated Total Checkout */}
          <div className="flex min-h-[300px] flex-1 flex-col justify-between rounded-2xl border border-[#ECECEC] bg-white p-6 shadow-[0_8px_28px_rgba(31,31,31,.05)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(31,31,31,.08)]">
            <div>
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-bold uppercase tracking-wider text-[#1F1F1F]">AI Order Tray</h4>
                <button onClick={clearCart} className="text-[10px] text-[#6B7280] hover:text-[#C41E19] hover:underline">Clear Tray</button>
              </div>

              {cart.length === 0 ? (
                <div className="text-center py-10">
                  <ShoppingCart size={32} className="mx-auto mb-3 text-[#9CA3AF]" />
                  <p className="text-xs text-[#6B7280]">Ask Nori to add items or select presets to fill your tray.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl border border-[#ECECEC] bg-[#F8F9FA] p-2.5">
                      <div className="flex items-center gap-3">
                        <img src={item.image} alt="" className="size-10 rounded-lg object-cover" />
                        <div>
                          <b className="block text-xs text-[#1F1F1F]">{item.qty}x {item.name}</b>
                          <span className="font-mono text-[9px] text-[#C41E19]">${(item.price * item.qty).toFixed(2)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="rounded p-1 text-[#9CA3AF] hover:bg-[#C41E19]/5 hover:text-[#C41E19]"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Total Block */}
            <div className="mt-6 border-t border-[#ECECEC] pt-6">
              <div className="mb-2 flex justify-between text-xs text-[#6B7280]"><span>Estimated Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
              <div className="mb-4 flex justify-between text-xs text-[#6B7280]"><span>Estimated Taxes (8%)</span><span>${(subtotal * 0.08).toFixed(2)}</span></div>
              <div className="mb-6 flex justify-between text-base font-semibold text-[#1F1F1F]">
                <span>Total Cost</span>
                <span className="font-mono text-[#C41E19]">${(subtotal * 1.08).toFixed(2)}</span>
              </div>
              <button
                onClick={() => {
                  if (cart.length === 0) return;
                  alert("Proceeding to Kiosk payment station!");
                  clearCart();
                }}
                disabled={cart.length === 0}
                className={`w-full py-4 rounded-2xl font-bold text-center text-sm transition ${cart.length > 0
                  ? "bg-[#C41E19] text-white hover:bg-[#A8161A] shadow-lg shadow-[#C41E19]/10 active:scale-95"
                  : "cursor-not-allowed border border-[#ECECEC] bg-[#F8F9FA] text-[#9CA3AF]"
                  }`}
              >
                Continue to Payment
              </button>
            </div>

          </div>

        </div>

      </section>

    </main>
  );
}
