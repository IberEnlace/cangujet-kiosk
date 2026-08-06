import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, LoaderCircle, Mic, MicOff, Plus, RefreshCw, ShoppingBag, X } from "lucide-react";
import { useCart, type CartModifierSelection } from "../../context/CartContext";
import { useLanguage } from "../../context/LanguageContext";
import MorrowLogo from "../../components/branding/MorrowLogo";
import { useBootstrap } from "../../context/BootstrapContext";
import { useNoriConversation } from "../../context/NoriConversationContext";
import { getLanguageOption, LANGUAGE_CONFIG, type SupportedLanguage } from "../../config/languages";
import { BrowserSpeechRecognitionService } from "../../services/voice/BrowserSpeechRecognitionService";
import type { NoriConversationReply } from "../../context/NoriConversationContext";
import type { NormalizedMenu, NormalizedMenuProduct } from "../../services/supabase/menuModels";
import {
  cartLineId,
  defaultModifierSelections,
  selectedModifiersForProduct,
  toModifierRequirements,
} from "../../services/orders/cartModifierPipeline";

function createProductImage(symbol: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#F8F9FA"/><circle cx="200" cy="200" r="112" fill="#C41E19"/><text x="200" y="228" text-anchor="middle" font-family="Plus Jakarta Sans,sans-serif" font-size="112" font-weight="700" fill="white">${symbol}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

interface MenuCatalogProps { onBack: () => void; onCheckout: () => void; onLanguage: () => void; onNori: () => void; onNoriChat: () => void; }

export default function MenuCatalog({ onBack, onCheckout, onLanguage, onNori, onNoriChat }: MenuCatalogProps) {
  const bootstrap = useBootstrap();
  const { kiosk, menu: sharedMenu } = bootstrap;
  const { language, direction } = useLanguage();
  const { items, addItem, removeItem } = useCart();
  const { isProcessing, sendMessage } = useNoriConversation();
  const [category, setCategory] = useState(() => sessionStorage.getItem("morrow:nori-entry-category") ?? "");
  const [view, setView] = useState<"categories" | "products">("categories");
  const [toast, setToast] = useState("");
  const [customizing, setCustomizing] = useState<NormalizedMenuProduct | null>(null);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [selectionError, setSelectionError] = useState("");
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const toastTimerRef = useRef<number>();
  useEffect(() => {
    if (!sharedMenu) return;
    setCategory(current => sharedMenu.categories.some(item => item.id === current)
      ? current
      : sharedMenu.categories[0]?.id || "");
  }, [sharedMenu]);
  const menuCategories = useMemo(() => (sharedMenu?.categories ?? []).map(item => ({
    ...item,
    name: item.localizedNames?.[language] || item.name,
  })), [language, sharedMenu]);
  const products = (sharedMenu?.products ?? []).filter(product => product.category.replace(/_/g, "-") === menuCategories.find(item => item.id === category)?.slug);
  useEffect(() => {
    if (!sharedMenu) return;
    let lineId = "";
    try { lineId = sessionStorage.getItem("morrow:edit-cart-line") ?? ""; } catch { return; }
    if (!lineId) return;
    const item = items.find(value => value.id === lineId);
    const product = sharedMenu.products.find(value => value.id === (item?.productId ?? item?.id.split("::")[0]));
    if (!item || !product) return;
    setCategory(sharedMenu.categories.find(value => value.slug.replace(/-/g, "_") === product.category)?.id ?? category);
    setView("products");
    const defaults = defaultModifierSelections(product);
    setSelections(Object.fromEntries(product.customizationGroups.map(group => {
      const groupId = group.databaseId ?? group.id;
      const restored = (item.selectedModifiers ?? [])
        .filter(value => value.modifierGroupId === groupId)
        .map(value => value.modifierId);
      return [groupId, restored.length ? restored : defaults[groupId] ?? []];
    })));
    setEditingLineId(item.id);
    setCustomizing(product);
    try { sessionStorage.removeItem("morrow:edit-cart-line"); } catch { /* One-time restoration is best effort. */ }
  }, [category, items, sharedMenu]);
  const count = items.reduce((sum, item) => sum + item.qty, 0);
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const currency = useMemo(() => new Intl.NumberFormat(LANGUAGE_CONFIG[language].locale, { style: "currency", currency: sharedMenu?.currency ?? bootstrap.branch?.currency ?? "USD" }), [bootstrap.branch?.currency, language, sharedMenu?.currency]);

  const chooseCategory = (id: string) => { setCategory(id); sessionStorage.setItem("morrow:nori-entry-category", id); setView("products"); };
  const selectedCategory = menuCategories.find(item => item.id === category);
  const addConfiguredProduct = (product: NormalizedMenuProduct, selectedModifiers: CartModifierSelection[]) => {
    const cartItem = {
      id: cartLineId(product.id, selectedModifiers),
      productId: product.id,
      name: product.name,
      price: product.price + selectedModifiers.reduce((sum, value) => sum + value.priceAdjustment, 0),
      basePrice: product.price,
      calories: product.calories,
      category: selectedCategory?.name ?? "",
      image: product.image || createProductImage(product.name.charAt(0)),
      customizations: Object.fromEntries(selectedModifiers.map(value => [value.groupName, value.optionName])),
      selectedModifiers,
      requiredModifierGroups: toModifierRequirements(product),
    };
    const edited = editingLineId ? items.find(value => value.id === editingLineId) : null;
    if (edited) removeItem(edited.id);
    for (let count = 0; count < (edited?.qty ?? 1); count += 1) addItem(cartItem);
    setToast(`${product.name} added`);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 1800);
    setCustomizing(null);
    setSelections({});
    setSelectionError("");
    setEditingLineId(null);
  };
  const addProduct = (product: NormalizedMenuProduct) => {
    if (!product.customizationGroups.length) {
      addConfiguredProduct(product, []);
      return;
    }
    setSelections(defaultModifierSelections(product));
    setSelectionError("");
    setCustomizing(product);
  };
  const confirmCustomizations = () => {
    if (!customizing) return;
    for (const group of customizing.customizationGroups) {
      const groupId = group.databaseId ?? group.id;
      const count = selections[groupId]?.length ?? 0;
      if (count < group.minSelections || (group.required && count === 0)) {
        setSelectionError(`${group.name} requires a selection.`);
        return;
      }
      if (count > group.maxSelections) {
        setSelectionError(`${group.name} has too many selections.`);
        return;
      }
    }
    const selectedModifiers = selectedModifiersForProduct(customizing, selections);
    addConfiguredProduct(customizing, selectedModifiers);
  };

  const BackIcon = ChevronLeft;
  return (
    <main dir={direction} className="min-h-[100dvh] bg-[#F8F9FA] text-[#1F1F1F]">
      <div className="relative mx-auto min-h-[100dvh] w-full max-w-[900px] overflow-hidden bg-[#FFFFFF] shadow-[0_0_30px_rgba(31,31,31,.06)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_10%,rgba(196,30,25,.035),transparent_30%)]" aria-hidden="true" />
        <header className="sticky top-0 z-30 flex h-[clamp(4.6rem,7vh,6rem)] items-center justify-between border-b border-[#ECECEC] bg-[#FFFFFF]/95 px-3 backdrop-blur-xl sm:px-5">
          <button type="button" onClick={onBack} aria-label="Back to service selection" className="grid size-12 place-items-center rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] text-[#1F1F1F] shadow-[0_3px_10px_rgba(31,31,31,.04)] transition hover:-translate-y-0.5 hover:bg-[#F8F9FA] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C41E19]"><BackIcon size={23} aria-hidden="true" /></button>
          <div className="text-center" dir="ltr"><MorrowLogo variant="full" className="hidden h-auto w-28 sm:block" /><MorrowLogo variant="symbol" className="mx-auto size-9 object-contain sm:hidden" alt="" /><p className="mt-0.5 text-[10px] text-[#9CA3AF]">{language === "tr" ? "Yeni siparişiniz" : "Your new order"}</p></div>
          <div className="flex items-center gap-2">{kiosk?.ai.enabled && <button type="button" onClick={onNori} className="hidden min-h-11 rounded-xl border border-[#C41E19]/25 bg-[#FFFFFF] px-3 text-xs font-bold text-[#C41E19] transition hover:bg-[#C41E19]/5 min-[560px]:block">Ask Nori</button>}<button type="button" onClick={onLanguage} className="min-h-11 min-w-11 rounded-xl border border-[#ECECEC] bg-[#FFFFFF] px-2 text-xs font-bold uppercase text-[#6B7280] transition hover:bg-[#F8F9FA] hover:text-[#1F1F1F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C41E19]">{language}</button><button type="button" onClick={onCheckout} aria-label={`Open cart with ${count} items`} className="relative grid size-12 place-items-center rounded-2xl bg-[#C41E19] text-[#FFFFFF] shadow-[0_6px_16px_rgba(196,30,25,.18)] transition hover:-translate-y-0.5 hover:bg-[#A8161A] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C41E19]"><ShoppingBag size={20} aria-hidden="true" />{count > 0 && <span className="absolute -end-1 -top-1 grid size-5 place-items-center rounded-full border border-[#C41E19] bg-[#FFFFFF] text-[10px] font-bold text-[#C41E19]">{count}</span>}</button></div>
        </header>

        <div className="grid min-h-[calc(100dvh-5rem)] grid-cols-[88px_minmax(0,1fr)] sm:grid-cols-[120px_minmax(0,1fr)]">
          <aside className="relative border-e border-[#ECECEC] bg-[#FFFFFF] p-2 pb-28"><p className="px-2 pb-2 pt-2 text-[8px] tracking-[.14em] text-[#9CA3AF]">MENU</p><nav className="space-y-2" aria-label="Menu categories">{menuCategories.map(item => <button type="button" key={item.id} onClick={() => chooseCategory(item.id)} aria-pressed={category === item.id} className={`flex min-h-[78px] w-full flex-col items-center justify-center rounded-2xl border px-1 py-2 transition hover:-translate-y-0.5 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C41E19] ${category === item.id ? "border-[#C41E19]/30 bg-[#C41E19]/5 shadow-[0_5px_16px_rgba(31,31,31,.05)]" : "border-transparent hover:bg-[#F8F9FA]"}`}><span className={`grid size-11 place-items-center rounded-full text-xl ${category === item.id ? "bg-[#C41E19] text-[#FFFFFF]" : "bg-[#F8F9FA] text-[#6B7280]"}`}>{item.image ? <img src={item.image} alt="" className="size-10 rounded-full object-cover" /> : item.icon || item.name.charAt(0)}</span><span className={`mt-1.5 text-[9px] leading-3 sm:text-[10px] ${category === item.id ? "font-bold text-[#C41E19]" : "text-[#6B7280]"}`}>{item.name}</span></button>)}</nav></aside>

          <section className="relative min-w-0 bg-[#F8F9FA] pb-28"><div className="p-3 sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[8px] tracking-[.14em] text-[#C41E19] sm:text-[9px]">{view === "products" ? "CATEGORY SELECTED" : "CHOOSE A CATEGORY"}</p><h1 className="mt-1 text-[clamp(1.45rem,4vw,2.2rem)] font-semibold tracking-[-.04em] text-[#1F1F1F]">{view === "products" ? selectedCategory?.name : "What are you craving?"}</h1></div><button type="button" onClick={() => setView("categories")} className="shrink-0 rounded-xl border border-[#ECECEC] bg-[#FFFFFF] px-3 py-2 text-xs text-[#6B7280] transition hover:-translate-y-0.5 hover:text-[#1F1F1F] active:scale-[.98]">Categories</button></div>
            {kiosk?.ai.enabled && <NoriBanner onOpen={onNori} onOpenChat={onNoriChat} isProcessing={isProcessing} sendMessage={sendMessage} language={language} voiceEnabled={kiosk.ai.voiceEnabled} />}
            {!sharedMenu ? <div className="mt-8 animate-pulse rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] p-6 text-sm text-[#6B7280] shadow-[0_5px_16px_rgba(31,31,31,.04)]">Loading menu...</div> : view === "categories" ? <CategoryLanding menu={{ ...sharedMenu, categories: menuCategories }} onChoose={chooseCategory} selected={category} /> : <ProductGrid products={products} currency={currency} onAdd={addProduct} />}
          </div></section>
        </div>

        <footer className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[900px] border-t border-[#ECECEC] bg-[#FFFFFF]/95 p-3 shadow-[0_-6px_20px_rgba(31,31,31,.05)] backdrop-blur-xl"><div className="flex items-center gap-3"><div className="min-w-0 flex-1">{count ? <><p className="truncate text-xs text-[#6B7280]">{`${count} item${count > 1 ? "s" : ""} in your order`}</p><p className="text-xl font-semibold text-[#1F1F1F]">{currency.format(total)}</p></> : <><p className="text-xs text-[#9CA3AF]">Not sure what to order?</p>{kiosk?.ai.enabled && <button type="button" onClick={onNori} className="mt-0.5 min-h-8 text-start text-xs font-semibold text-[#C41E19] underline decoration-[#C41E19]/25 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C41E19]">Ask Nori for a recommendation.</button>}</>}</div><button type="button" onClick={onCheckout} disabled={!count} className="min-h-14 rounded-2xl bg-[#C41E19] px-4 text-sm font-bold text-[#FFFFFF] shadow-[0_6px_16px_rgba(196,30,25,.16)] transition hover:-translate-y-0.5 hover:bg-[#A8161A] active:scale-[.98] disabled:bg-[#ECECEC] disabled:text-[#9CA3AF] disabled:shadow-none sm:px-6">{count ? `Checkout · ${currency.format(total)}` : "Checkout"}</button></div></footer>
        {customizing && <CustomizationModal product={customizing} selections={selections} error={selectionError} currency={currency} onChange={(groupId, optionId, multiple) => setSelections(current => {
          const selected = current[groupId] ?? [];
          return {
            ...current,
            [groupId]: multiple
              ? selected.includes(optionId) ? selected.filter(value => value !== optionId) : [...selected, optionId]
              : [optionId],
          };
        })} onCancel={() => { setCustomizing(null); setSelections({}); setSelectionError(""); setEditingLineId(null); }} onConfirm={confirmCustomizations} />}
        {toast && <div role="status" className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-2xl bg-[#C41E19] px-4 py-3 text-sm text-[#FFFFFF] shadow-[0_8px_22px_rgba(196,30,25,.2)]"><span className="grid size-6 place-items-center rounded-lg bg-[#FFFFFF] text-[#C41E19]"><Check size={14} aria-hidden="true" /></span>{toast}</div>}
      </div>
    </main>
  );
}

type BannerVoiceStatus = "idle" | "requesting" | "listening" | "processing" | "error";
const quickPrompts = [
  ["Healthy", "Recommend something healthy."],
  ["High Protein", "Recommend a high-protein meal."],
  ["Under €15", "Recommend a meal under €15."],
  ["Vegetarian", "Show me vegetarian options."],
  ["Kids", "Recommend something for kids."],
  ["Surprise Me", "Surprise me with a meal recommendation."],
] as const;

function NoriBanner({ onOpenChat, isProcessing, sendMessage, language, voiceEnabled }: { onOpen: () => void; onOpenChat: () => void; isProcessing: boolean; sendMessage: (text: string) => Promise<NoriConversationReply | null>; language: SupportedLanguage; voiceEnabled: boolean }) {
  const recognition = useMemo(() => new BrowserSpeechRecognitionService(), []);
  const recognitionRequestRef = useRef(0);
  const recognitionActiveRef = useRef(false);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<BannerVoiceStatus>("idle");
  const [error, setError] = useState("");
  const busy = status === "requesting" || status === "processing" || isProcessing;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recognitionRequestRef.current += 1;
      recognitionActiveRef.current = false;
      recognition.cancel();
    };
  }, [recognition]);
  useEffect(() => { if (isProcessing) setStatus("processing"); else if (status === "processing") setStatus("idle"); }, [isProcessing, status]);

  const listen = async () => {
    if (recognitionActiveRef.current) { recognitionRequestRef.current += 1; recognitionActiveRef.current = false; recognition.cancel(); setStatus("idle"); return; }
    if (!voiceEnabled || !recognition.isSupported()) { setError("Microphone access is unavailable. You can still type your request."); setStatus("error"); return; }
    const requestId = ++recognitionRequestRef.current;
    recognitionActiveRef.current = true;
    setError(""); setStatus("requesting");
    try {
      const pending = recognition.start(getLanguageOption(language).speechLocale);
      setStatus("listening");
      const result = await pending;
      if (!mountedRef.current || requestId !== recognitionRequestRef.current) return;
      recognitionActiveRef.current = false;
      if (!result.transcript) { setError("I didn’t hear anything. Please try again."); setStatus("error"); return; }
      setStatus("processing");
      await sendMessage(result.transcript);
      if (!mountedRef.current || requestId !== recognitionRequestRef.current) return;
      onOpenChat();
    } catch (reason) {
      if (!mountedRef.current || requestId !== recognitionRequestRef.current) return;
      recognitionActiveRef.current = false;
      const code = reason instanceof Error ? reason.message : "error";
      if (code === "aborted") { setStatus("idle"); return; }
      setError(code === "permission_denied" || code === "service_unavailable" || code === "microphone_not_found"
        ? "Microphone access is unavailable. You can still type your request."
        : code === "no_speech"
          ? "I didn’t hear anything. Please try again."
          : code === "network"
            ? "Voice recognition could not connect. Please try again."
            : "Something went wrong with the microphone. Please try again.");
      setStatus("error");
    }
  };
  const submitPrompt = (request: string) => { if (busy) return; void sendMessage(request); onOpenChat(); };
  const label = status === "listening" ? "Listening..." : status === "requesting" ? "Connecting..." : busy ? "Finding your meal..." : "Tap to talk";

  return <section aria-labelledby="nori-banner-title" className="relative mt-5 overflow-hidden rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] p-4 shadow-[0_8px_24px_rgba(31,31,31,.06)] transition duration-300 hover:-translate-y-0.5 hover:border-[#C41E19]/20 hover:shadow-[0_12px_30px_rgba(31,31,31,.08)] sm:p-5">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_42%,rgba(196,30,25,.045),transparent_34%)]" aria-hidden="true" />
    <div className="relative flex flex-col gap-4 min-[680px]:flex-row min-[680px]:items-center min-[680px]:justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#C41E19]">Hi, I’m Nori! 👋</p>
        <h2 id="nori-banner-title" className="mt-1.5 text-[clamp(1.35rem,3.6vw,2rem)] font-semibold tracking-[-.035em] text-[#1F1F1F]">Need a recommendation?</h2>
        <p className="mt-1 max-w-xl text-xs leading-5 text-[#6B7280] sm:text-sm">Tell me what you like, and I’ll help you find the perfect meal.</p>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Quick recommendation prompts">{quickPrompts.map(([title, request]) => <button key={title} type="button" disabled={busy} onClick={() => submitPrompt(request)} className="min-h-12 rounded-full border border-[#ECECEC] bg-[#FFFFFF] px-3 text-[11px] font-semibold text-[#6B7280] transition hover:-translate-y-0.5 hover:border-[#C41E19]/35 hover:bg-[#C41E19]/5 hover:text-[#1F1F1F] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C41E19] disabled:opacity-40">{title}</button>)}</div>
        {error && <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#C41E19]/20 bg-[#C41E19]/5 px-3 py-2 text-[11px] leading-4 text-[#C41E19]"><span className="flex-1">{error}</span><button type="button" onClick={() => void listen()} className="flex min-h-12 items-center gap-1.5 rounded-lg border border-[#C41E19] bg-[#FFFFFF] px-3 font-bold text-[#C41E19] transition hover:bg-[#C41E19] hover:text-[#FFFFFF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C41E19]"><RefreshCw size={14} aria-hidden="true" />Retry</button><button type="button" onClick={onOpenChat} className="min-h-12 rounded-lg border border-[#ECECEC] bg-[#FFFFFF] px-3 font-bold text-[#1F1F1F] transition hover:bg-[#F8F9FA] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C41E19]">Type instead</button></div>}
      </div>
      <div className="flex shrink-0 flex-row items-center justify-center gap-3 min-[680px]:w-40 min-[680px]:flex-col">
        <div className={`nori-voice-orbit relative grid size-[5.75rem] shrink-0 place-items-center rounded-full ${status === "listening" ? "is-listening" : ""}`}>
          {status === "listening" && <><span className="nori-listening-ring absolute inset-0 rounded-full border border-[#C41E19]/35" aria-hidden="true" /><span className="nori-listening-ring nori-listening-ring-delay absolute inset-0 rounded-full border border-[#C41E19]/20" aria-hidden="true" /></>}
          <button type="button" onClick={() => void listen()} disabled={busy} aria-label={status === "listening" ? "Stop listening to my request" : "Talk to Nori for a meal recommendation"} aria-pressed={status === "listening"} className="nori-mic-button relative z-10 grid size-[4.75rem] place-items-center rounded-full bg-[#C41E19] text-[#FFFFFF] shadow-[0_8px_22px_rgba(196,30,25,.18)] transition hover:-translate-y-0.5 hover:bg-[#A8161A] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C41E19] disabled:cursor-wait disabled:opacity-70">{busy ? <LoaderCircle className="animate-spin" size={29} aria-hidden="true" /> : status === "listening" ? <MicOff size={29} aria-hidden="true" /> : <Mic size={30} aria-hidden="true" />}</button>
        </div>
        <div className="min-w-0 text-start min-[680px]:text-center"><p role="status" aria-live="polite" className="text-sm font-bold text-[#1F1F1F]">{label}</p><p className="mt-0.5 text-[10px] text-[#9CA3AF]">{status === "listening" ? "Tap again to stop" : "Speak naturally"}</p></div>
      </div>
    </div>
  </section>;
}

function CategoryLanding({ menu, onChoose, selected }: { menu: NormalizedMenu; onChoose: (id: string) => void; selected: string }) {
  return <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-5 min-[560px]:grid-cols-2">{menu.categories.map(category => {
    const isSelected = selected === category.id;
    const itemCount = menu.products.filter(product => product.category.replace(/_/g, "-") === category.slug).length;
    return <button type="button" key={category.id} onClick={() => onChoose(category.id)} aria-pressed={isSelected} className="group relative h-[clamp(11rem,20vh,13.5rem)] overflow-visible rounded-2xl text-start transition duration-300 ease-out hover:-translate-y-1 hover:scale-[1.015] active:scale-[.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#C41E19]">
      <span className={`absolute inset-0 overflow-hidden rounded-2xl border bg-[#FFFFFF] transition duration-300 ${isSelected ? "border-[#C41E19]/40 shadow-[0_10px_26px_rgba(31,31,31,.08)]" : "border-[#ECECEC] shadow-[0_6px_18px_rgba(31,31,31,.05)] group-hover:border-[#C41E19]/25 group-hover:shadow-[0_12px_28px_rgba(31,31,31,.08)]"}`}>
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_76%_30%,rgba(196,30,25,.055),transparent_43%)]" aria-hidden="true" />
        <span className="absolute inset-x-0 bottom-0 z-10 h-[72%] bg-gradient-to-t from-[#FFFFFF] via-[#FFFFFF]/90 to-transparent" aria-hidden="true" />
        {isSelected && <span className="absolute inset-x-5 top-0 z-30 h-0.5 rounded-b-full bg-[#C41E19]" aria-hidden="true" />}
      </span>
      {category.image && <img src={category.image} alt="" className="pointer-events-none absolute -end-[4%] -top-[10%] z-[5] h-[82%] w-[62%] object-contain drop-shadow-[0_10px_10px_rgba(31,31,31,.14)] transition duration-500 ease-out group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:scale-[1.025]" />}
      <span className="absolute inset-x-5 bottom-5 z-20">
        <span className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-xl border border-[#C41E19]/20 bg-[#C41E19]/5 text-[#C41E19]">{category.name.charAt(0)}</span><strong className="text-xl font-bold tracking-[-.025em] text-[#1F1F1F]">{category.name}</strong></span>
        <span className="mt-2 block max-w-[72%] text-[11px] leading-4 text-[#6B7280]">{category.description}</span>
        <span className="mt-2 block text-[9px] font-bold uppercase tracking-[.13em] text-[#C41E19]">{itemCount} Items</span>
      </span>
    </button>;
  })}</div>;
}

function ProductGrid({ products, currency, onAdd }: { products: NormalizedMenuProduct[]; currency: Intl.NumberFormat; onAdd: (product: NormalizedMenuProduct) => void }) {
  return <div className="mt-5 grid grid-cols-1 gap-3 min-[560px]:grid-cols-2">{products.map(product => {const badge=product.dietaryTags.includes("vegetarian")?"VEGETARIAN":undefined;return <article key={product.id} className="relative overflow-hidden rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] p-3 shadow-[0_6px_18px_rgba(31,31,31,.05)] transition duration-300 hover:-translate-y-1 hover:scale-[1.01] hover:border-[#C41E19]/20 hover:shadow-[0_12px_28px_rgba(31,31,31,.08)]"><div className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-2xl bg-[#F8F9FA]">{product.image ? <img src={product.image} alt={product.name} className="absolute inset-0 size-full object-contain p-2" /> : <span className="grid size-20 place-items-center rounded-full bg-[#C41E19] text-4xl font-black text-[#FFFFFF] shadow-[0_8px_20px_rgba(196,30,25,.16)]">{product.name.charAt(0)}</span>}{badge && <span className="absolute start-2 top-2 z-10 rounded-full bg-[#C41E19] px-2 py-1 text-[8px] font-bold tracking-wider text-[#FFFFFF]">{badge}</span>}</div><h2 className="mt-3 text-[15px] font-semibold leading-5 text-[#1F1F1F]">{product.name}</h2><p className="mt-1 min-h-8 text-[11px] leading-4 text-[#6B7280]">{product.description}</p><div className="mt-3 flex items-end justify-between"><div><b className="text-[#C41E19]">{currency.format(product.price)}</b><small className="block text-[10px] text-[#9CA3AF]">{product.calories} kcal</small></div><button type="button" onClick={() => onAdd(product)} aria-label={`Add ${product.name}`} className="grid size-12 place-items-center rounded-xl bg-[#C41E19] text-[#FFFFFF] shadow-[0_5px_14px_rgba(196,30,25,.16)] transition hover:-translate-y-0.5 hover:bg-[#A8161A] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C41E19]"><Plus size={20} aria-hidden="true" /></button></div></article>})}</div>;
}

function CustomizationModal({product,selections,error,currency,onChange,onCancel,onConfirm}:{product:NormalizedMenuProduct;selections:Record<string,string[]>;error:string;currency:Intl.NumberFormat;onChange:(groupId:string,optionId:string,multiple:boolean)=>void;onCancel:()=>void;onConfirm:()=>void}){
  return <div className="fixed inset-0 z-50 grid animate-in place-items-center bg-[#1F1F1F]/35 p-4 backdrop-blur-sm fade-in-0 duration-150" role="dialog" aria-modal="true" aria-label={`Customize ${product.name}`}><div className="max-h-[90dvh] w-full max-w-lg animate-in overflow-y-auto rounded-2xl border border-[#ECECEC] bg-[#FFFFFF] p-5 text-[#1F1F1F] shadow-[0_18px_50px_rgba(31,31,31,.16)] fade-in-0 zoom-in-95 duration-150"><div className="mb-5 flex items-center"><div><h2 className="text-xl font-bold tracking-[-.025em]">Customize {product.name}</h2><p className="text-xs text-[#6B7280]">Required choices must be selected before adding.</p></div><button type="button" onClick={onCancel} className="ml-auto grid size-10 place-items-center rounded-xl border border-[#ECECEC] bg-[#FFFFFF] transition hover:bg-[#F8F9FA] active:scale-[.98]" aria-label="Close customization"><X size={18}/></button></div>{product.customizationGroups.map(group=>{const groupId=group.databaseId??group.id;const multiple=group.maxSelections>1;return <fieldset key={groupId} className="mb-5"><legend className="mb-2 text-sm font-bold">{group.name}{(group.required||group.minSelections>0)&&<span className="ml-2 text-xs text-[#C41E19]">Required</span>}</legend><div className="space-y-2">{group.options.filter(option=>option.available).map(option=>{const optionId=option.databaseId??option.id;const checked=(selections[groupId]??[]).includes(optionId);return <label key={optionId} className={`flex min-h-12 cursor-pointer items-center justify-between rounded-xl border p-3 text-sm transition hover:border-[#C41E19]/25 ${checked?"border-[#C41E19]/40 bg-[#C41E19]/5":"border-[#ECECEC] bg-[#FFFFFF]"}`}><span><input type={multiple?"checkbox":"radio"} name={groupId} checked={checked} onChange={()=>onChange(groupId,optionId,multiple)} className="mr-3 accent-[#C41E19]"/>{option.name}{option.default&&<small className="ml-2 text-[#9CA3AF]">Default</small>}</span>{option.priceAdjustment!==0&&<span className="text-[#6B7280]">+{currency.format(option.priceAdjustment)}</span>}</label>})}</div></fieldset>})}{error&&<p role="alert" className="mb-4 rounded-xl border border-[#C41E19]/25 bg-[#C41E19]/5 p-3 text-sm text-[#C41E19]">{error}</p>}<div className="flex gap-3"><button type="button" onClick={onCancel} className="min-h-12 flex-1 rounded-xl border border-[#ECECEC] bg-[#FFFFFF] font-bold text-[#1F1F1F] transition hover:-translate-y-0.5 hover:bg-[#F8F9FA] active:scale-[.98]">Cancel</button><button type="button" onClick={onConfirm} className="min-h-12 flex-1 rounded-xl bg-[#C41E19] font-bold text-[#FFFFFF] shadow-[0_6px_16px_rgba(196,30,25,.16)] transition hover:-translate-y-0.5 hover:bg-[#A8161A] active:scale-[.98]">Add to Order</button></div></div></div>;
}
