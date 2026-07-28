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
    <main className="min-h-screen bg-[#070906] text-[#f7f5ee] font-['DM_Sans'] flex flex-col justify-between relative selection:bg-[#d7ff7a]/20">

      {/* Background Ambience */}
      <div className="absolute top-0 left-1/3 w-[600px] h-[600px] bg-[#d7ff7a]/5 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[500px] h-[500px] bg-[#3be2ff]/3 rounded-full blur-[120px] pointer-events-none" />

      {/* Top Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between border-b border-white/5 relative z-10">
        <div className="flex items-center gap-4">
          {onBackToSelection && (
            <button
              onClick={onBackToSelection}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-white/80 transition flex items-center justify-center border border-white/10"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#d7ff7a]/15 text-[#d7ff7a] border border-[#d7ff7a]/30 shadow-lg shadow-[#d7ff7a]/10">
              <Sparkles size={20} />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Nori AI Assistant</h1>
              <span className="text-[10px] text-[#d7ff7a] font-mono tracking-widest uppercase block mt-0.5">Conversational ordering</span>
            </div>
          </div>
        </div>

        {/* Cart counter */}
        <div className="flex items-center gap-3">
          <button
            onClick={resetConversation}
            className="text-xs bg-white/5 border border-white/10 px-4 py-2 rounded-full font-mono text-white/60 flex items-center gap-2 hover:bg-white/10 transition"
            title="Reset conversation"
          >
            <RefreshCw size={14} className="text-[#d7ff7a]" /> Reset
          </button>
          <span className="text-xs bg-white/5 border border-white/10 px-4 py-2 rounded-full font-mono text-white/60 flex items-center gap-2">
            <ShoppingCart size={14} className="text-[#d7ff7a]" /> Cart: {cart.reduce((sum, item) => sum + item.qty, 0)} item(s)
          </span>
        </div>
      </header>

      {/* Simulator Core Layout */}
      <section className="flex-1 w-full max-w-7xl mx-auto px-6 py-8 grid lg:grid-cols-12 gap-8 items-stretch relative z-10">

        {/* Left Side: Chat Simulator & Voice Mic (Lg: col-span-7) */}
        <div className="lg:col-span-7 flex flex-col justify-between border border-white/10 bg-white/[0.01] rounded-[36px] overflow-hidden shadow-2xl relative min-h-[600px]">

          {/* Chat Panel Switcher Tabs */}
          <div className="flex border-b border-white/10 bg-white/[0.02]">
            {[
              { id: "chat", label: "AI Conversational Chat" },
              { id: "presets", label: "Category Presets" },
              { id: "allergies", label: "Allergy Filters" }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-4 text-xs font-mono uppercase tracking-wider font-semibold border-b-2 transition-all ${activeTab === tab.id
                  ? "border-[#d7ff7a] text-[#d7ff7a] bg-[#d7ff7a]/5"
                  : "border-transparent text-white/45 hover:text-white"
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
                      <span className="size-9 rounded-xl bg-[#d7ff7a]/15 text-[#d7ff7a] flex items-center justify-center shrink-0 border border-[#d7ff7a]/20"><Sparkles size={16} /></span>
                    )}

                    <div className="space-y-4 max-w-[80%]">
                      <div className={`p-4 rounded-3xl text-sm leading-relaxed border ${msg.sender === "user"
                        ? "bg-[#d7ff7a]/10 border-[#d7ff7a]/20 rounded-tr-none text-white/95"
                        : "bg-white/5 border-white/10 rounded-tl-none text-white/80"
                        }`}>
                        {msg.text}
                        <span className="block text-[9px] text-white/30 font-mono mt-2 text-right">{msg.timestamp}</span>
                      </div>

                      {/* Display bot recommended products */}
                      {msg.sender === "bot" && msg.recommendations && (
                        <div className="grid sm:grid-cols-2 gap-3 mt-2">
                          {msg.recommendations.map(rec => {
                            const hasAllergen = checkProductAllergens(rec, selectedAllergens).hasRisk;
                            return (
                              <div key={rec.id} className={`p-4 rounded-2xl border ${hasAllergen ? "border-red-500/30 bg-red-500/5" : "border-white/10 bg-white/[0.02]"} flex flex-col justify-between gap-3`}>
                                <div className="flex gap-3">
                                  <img src={rec.image} alt={rec.name} className="size-14 rounded-lg object-cover shrink-0" />
                                  <div className="min-w-0">
                                    <h5 className="font-bold text-xs text-white truncate">{rec.name}</h5>
                                    <span className="text-[10px] text-white/45 block mt-0.5">{rec.cal} Cal · {rec.protein} P</span>
                                    {hasAllergen && (
                                      <span className="text-[9px] text-red-400 font-bold block mt-1 flex items-center gap-1"><ShieldAlert size={10} /> Contains allergen</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex justify-between items-center mt-2 border-t border-white/5 pt-2">
                                  <b className="font-mono text-[#d7ff7a] text-xs">${rec.price.toFixed(2)}</b>
                                  <button
                                    onClick={() => executeNoriCartActions([{
                                      type: "add_to_cart",
                                      actionId: `manual-${rec.id}-${Date.now()}`,
                                      productId: rec.id,
                                      quantity: 1,
                                      customizations: [],
                                      label: `Add ${rec.name}`,
                                    }], { addItem })}
                                    className="px-3 py-1.5 bg-white text-black hover:bg-[#d7ff7a] transition rounded-lg text-[10px] font-bold"
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
                        <div className="p-4 rounded-2xl border border-[#d7ff7a]/30 bg-[#d7ff7a]/5 flex justify-between items-center gap-4">
                          <div className="flex items-center gap-3">
                            <span className="p-2 rounded-xl bg-[#d7ff7a]/15 text-[#d7ff7a]"><Award size={16} /></span>
                            <div>
                              <b className="text-xs text-white block">Special cross-sell upgrade</b>
                              <span className="text-[10px] text-white/55 block mt-0.5">Pair with {msg.upsellItem.name} for only +${msg.upsellItem.price.toFixed(2)}</span>
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
                            className="bg-[#d7ff7a] hover:bg-[#c3ec60] text-black text-[10px] font-bold px-3 py-1.5 rounded-lg transition"
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
                        ? "border-[#d7ff7a] bg-[#d7ff7a]/10 text-white"
                        : "border-white/10 bg-white/5 text-white/60 hover:border-white/20"
                        }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {getPresetList()?.map(item => (
                    <div key={item.id} className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] flex gap-4 relative overflow-hidden group">
                      <img src={item.image} alt={item.name} className="size-20 rounded-xl object-cover shrink-0" />
                      <div className="flex-1 flex flex-col justify-between min-w-0">
                        <div>
                          <h4 className="font-bold text-sm text-white truncate">{item.name}</h4>
                          <p className="text-[11px] text-white/45 mt-1">{item.cal} Cal · {item.protein} Protein</p>
                        </div>
                        <div className="flex justify-between items-center mt-4">
                          <b className="font-mono text-[#d7ff7a] text-xs">${item.price.toFixed(2)}</b>
                          <button
                            onClick={() => executeNoriCartActions([{
                              type: "add_to_cart",
                              actionId: `preset-${item.id}-${Date.now()}`,
                              productId: item.id,
                              quantity: 1,
                              customizations: [],
                              label: `Add ${item.name}`,
                            }], { addItem })}
                            className="px-3.5 py-1.5 bg-white text-black hover:bg-[#d7ff7a] rounded-lg text-xs font-bold transition"
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
                  <h3 className="text-sm font-bold text-white mb-2">Select Active Allergens</h3>
                  <p className="text-xs text-white/45 mb-4">Flag ingredients you are allergic to. Nori AI will automatically highlight warning signs on matching menu items.</p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {noriSupportedAllergens.map(all => {
                      const active = selectedAllergens.includes(all);
                      return (
                        <button
                          key={all}
                          onClick={() => toggleAllergenFilter(all)}
                          className={`p-4 rounded-xl border text-center transition-all ${active
                            ? "border-red-500 bg-red-500/10 text-white"
                            : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                            }`}
                        >
                          <b className="text-xs block">{all}</b>
                          <span className="text-[9px] block mt-1">{active ? "Flagged Unsafe" : "No allergy"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-white/5 pt-6">
                  <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider mb-4">Allergy Risk Detection Preview</h4>
                  <div className="space-y-2">
                    {noriMenuProducts.map(item => {
                      const allergenCheck = checkProductAllergens(item, selectedAllergens);
                      const containsAllergen = allergenCheck.hasRisk;
                      return (
                        <div key={item.id} className={`flex items-center justify-between p-3 rounded-xl border ${containsAllergen ? "border-red-500/20 bg-red-500/5 text-red-300" : "border-white/5 bg-white/[0.01]"}`}>
                          <span className="text-xs font-semibold">{item.name}</span>
                          {containsAllergen ? (
                            <span className="text-[10px] font-bold font-mono text-red-400 uppercase flex items-center gap-1"><AlertTriangle size={12} /> Risk ({[...allergenCheck.contains, ...allergenCheck.mayContain, ...allergenCheck.crossContact].join(", ")})</span>
                          ) : (
                            <span className="text-[10px] font-bold font-mono text-[#d7ff7a] uppercase flex items-center gap-1"><ShieldCheck size={12} /> Safe</span>
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
          <form className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center gap-3" onSubmit={event => { event.preventDefault(); handleQuery(inputVal); }}>
            {isListening ? (
              <div className="flex-1 flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-3 px-5">
                <span className="size-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
                <div className="flex-1 h-6 flex items-center justify-center gap-1">
                  {[1, 2, 3, 4, 3, 2, 4, 1, 2, 3, 4, 2, 3, 1, 4, 2, 3, 4, 2, 1].map((h, i) => (
                    <span
                      key={i}
                      className="w-1 bg-[#d7ff7a] rounded-full animate-pulse"
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
                  className="bg-[#d7ff7a] hover:bg-[#c9f059] text-black text-xs font-bold px-4 py-2 rounded-xl"
                >
                  Process Voice
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsListening(true)}
                  className="p-3.5 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 text-[#d7ff7a] transition shrink-0"
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
                  className="flex-1 bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-[#d7ff7a] transition"
                />
                <button
                  type="submit"
                  className="p-3.5 bg-[#d7ff7a] hover:bg-[#bde650] text-[#17200f] rounded-2xl transition shrink-0"
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
          <div className="p-6 rounded-[32px] border border-white/10 bg-white/[0.01]">
            <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-2 mb-4">
              <Sparkles size={16} className="text-[#d7ff7a]" /> Natural Language Prompts
            </h4>
            <p className="text-xs text-white/45 mb-4">Tap any pre-built query to test Nori's NLP parsing and catalog suggestions instantly:</p>

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
                  className="w-full p-3.5 text-left text-xs rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/5 hover:border-white/10 text-white/80 transition flex justify-between items-center group"
                >
                  <span className="truncate">{ex}</span>
                  <ChevronRight size={14} className="text-white/20 group-hover:text-[#d7ff7a] group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Cart Live Preview & Estimated Total Checkout */}
          <div className="p-6 rounded-[32px] border border-white/10 bg-white/[0.01] flex-1 flex flex-col justify-between min-h-[300px]">
            <div>
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">AI Order Tray</h4>
                <button onClick={clearCart} className="text-[10px] text-white/40 hover:underline">Clear Tray</button>
              </div>

              {cart.length === 0 ? (
                <div className="text-center py-10">
                  <ShoppingCart size={32} className="mx-auto text-white/20 mb-3" />
                  <p className="text-xs text-white/45">Ask Nori to add items or select presets to fill your tray.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-2.5 rounded-xl border border-white/5 bg-white/[0.01]">
                      <div className="flex items-center gap-3">
                        <img src={item.image} alt="" className="size-10 rounded-lg object-cover" />
                        <div>
                          <b className="text-xs text-white block">{item.qty}x {item.name}</b>
                          <span className="text-[9px] text-[#d7ff7a] font-mono">${(item.price * item.qty).toFixed(2)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="p-1 hover:bg-white/5 rounded text-white/40 hover:text-white"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Total Block */}
            <div className="border-t border-white/5 pt-6 mt-6">
              <div className="flex justify-between text-xs text-white/45 mb-2"><span>Estimated Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-xs text-white/45 mb-4"><span>Estimated Taxes (8%)</span><span>${(subtotal * 0.08).toFixed(2)}</span></div>
              <div className="flex justify-between text-base font-semibold text-white mb-6">
                <span>Total Cost</span>
                <span className="text-[#d7ff7a] font-mono">${(subtotal * 1.08).toFixed(2)}</span>
              </div>
              <button
                onClick={() => {
                  if (cart.length === 0) return;
                  alert("Proceeding to Kiosk payment station!");
                  clearCart();
                }}
                disabled={cart.length === 0}
                className={`w-full py-4 rounded-2xl font-bold text-center text-sm transition ${cart.length > 0
                  ? "bg-[#d7ff7a] text-[#17200f] hover:bg-[#c3ec60] shadow-lg shadow-[#d7ff7a]/15 active:scale-95"
                  : "bg-white/5 border border-white/10 text-white/20 cursor-not-allowed"
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
