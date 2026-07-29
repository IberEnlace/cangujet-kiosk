import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { NoriChatRequest, NoriConversationState } from "../../server/types/noriChat";
import type { NoriSpeechDirectives } from "../../shared/noriSpeech";
import type { NoriOrderLifecycleState } from "../../shared/noriOrderLifecycle";
import { executeNoriCartActions, serializeNoriCart } from "../services/noriCartActions";
import { postNoriChat } from "../services/noriChatClient";
import { useCart } from "./CartContext";
import { useLanguage } from "./LanguageContext";
import type { SupportedLanguage } from "../config/languages";

export interface NoriMessage { id: string; sender: "user" | "nori"; text: string; }
export type NoriConversationReply = { text: string; speechDirectives: NoriSpeechDirectives };
interface NoriConversationValue {
  messages: NoriMessage[];
  isProcessing: boolean;
  activeAllergens: string[];
  sendMessage(text: string): Promise<NoriConversationReply | null>;
  reportTtsInterrupted(): void;
  resetConversation(): void;
}
const conversationCopy: Record<SupportedLanguage, { greeting: string; actionFailed: string; unavailable: string }> = {
  en: {
    greeting: "Hello! I’m Nori. Tell me what you feel like eating, your budget, or any dietary needs.",
    actionFailed: "I couldn’t complete that cart action. Your cart has not been changed for that item.",
    unavailable: "Nori could not respond right now. Please try again.",
  },
  tr: {
    greeting: "Merhaba! Ben Nori. Ne yemek istediğinizi, bütçenizi veya beslenme ihtiyaçlarınızı söyleyin.",
    actionFailed: "Bu sepet işlemini tamamlayamadım. İlgili ürün için sepetiniz değiştirilmedi.",
    unavailable: "Nori şu anda yanıt veremiyor. Lütfen tekrar deneyin.",
  },
};
function greeting(language: SupportedLanguage): NoriMessage {
  return { id: "nori-greeting", sender: "nori", text: conversationCopy[language].greeting };
}
const NoriConversationContext = createContext<NoriConversationValue | null>(null);

export function NoriConversationProvider({ children }: { children: ReactNode }) {
  const cart = useCart(); const { language } = useLanguage();
  const cartRef = useRef(cart.items); useEffect(() => { cartRef.current = cart.items; }, [cart.items]);
  const executedActionIds = useRef(new Set<string>()); const actionResults = useRef<NoriChatRequest["actionResults"]>([]);
  const conversationState = useRef<NoriConversationState>(); const sending = useRef(false);
  const acknowledgedLifecycleKey = useRef("");
  const lifecycleSyncing = useRef(false);
  const latestLifecycle = useRef<NoriOrderLifecycleState>(cart.orderLifecycle);
  const requestQueue = useRef<Promise<void>>(Promise.resolve());
  const [messages, setMessages] = useState<NoriMessage[]>(() => [greeting(language)]); const [isProcessing, setIsProcessing] = useState(false);
  const [activeAllergens] = useState<string[]>([]);
  const enqueueNoriRequest = useCallback(<T,>(task: () => Promise<T>) => {
    const pending = requestQueue.current.then(task, task);
    requestQueue.current = pending.then(() => undefined, () => undefined);
    return pending;
  }, []);
  const sendMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim(); if (!text || sending.current) return null; sending.current = true; setIsProcessing(true);
    setMessages(value => [...value, { id: crypto.randomUUID(), sender: "user", text }]);
    try {
      const result = await enqueueNoriRequest(() => postNoriChat({
        message: text,
        cart: serializeNoriCart(cartRef.current),
        activeAllergens,
        language,
        conversationState: conversationState.current,
        actionResults: actionResults.current,
        orderLifecycle: cart.orderLifecycle,
      }));
      conversationState.current = result.conversationState;
      const executions = executeNoriCartActions(result.actions, { addItem: cart.addItem, updateCustomizations: cart.updateCustomizations, removeItem: cart.removeItem, updateQty: cart.updateQty, clearCart: cart.clearCart }, { executedActionIds: executedActionIds.current, cartRef });
      actionResults.current = executions.map(({ actionId, status }) => ({ actionId, status }));
      const reply = executions.some(item => item.status === "failed") ? conversationCopy[language].actionFailed : result.reply;
      setMessages(value => [...value, { id: crypto.randomUUID(), sender: "nori", text: reply }]);
      return {
        text: reply,
        speechDirectives: result.speechDirectives ?? {
          rate: result.conversationState.speechRate ?? "normal",
          shouldSpeak: true,
        },
      };
    } catch { const reply = conversationCopy[language].unavailable; setMessages(value => [...value, { id: crypto.randomUUID(), sender: "nori", text: reply }]); return null; }
    finally { sending.current = false; setIsProcessing(false); }
  }, [activeAllergens, cart.addItem, cart.clearCart, cart.orderLifecycle, cart.removeItem, cart.updateCustomizations, cart.updateQty, enqueueNoriRequest, language]);

  const synchronizeLifecycle = useCallback(async () => {
    if (lifecycleSyncing.current) return;
    lifecycleSyncing.current = true;
    try {
      while (true) {
        const lifecycle = latestLifecycle.current;
        if (lifecycle.paymentStatus === "idle") break;
        const key = [lifecycle.paymentStatus, lifecycle.orderId, lifecycle.orderNumber].join(":");
        if (acknowledgedLifecycleKey.current === key) break;
        const result = await enqueueNoriRequest(() => postNoriChat({
          message: "",
          cart: serializeNoriCart(cartRef.current),
          activeAllergens,
          language,
          conversationState: conversationState.current,
          actionResults: actionResults.current,
          orderLifecycle: lifecycle,
          lifecycleEvent: true,
        }));
        conversationState.current = result.conversationState;
        acknowledgedLifecycleKey.current = key;
        if (result.reply) {
          setMessages(value => [...value, { id: crypto.randomUUID(), sender: "nori", text: result.reply }]);
        }
      }
    } catch {
      // A later customer turn will carry the lifecycle again and can acknowledge it.
    } finally {
      lifecycleSyncing.current = false;
    }
  }, [activeAllergens, enqueueNoriRequest, language]);

  useEffect(() => {
    latestLifecycle.current = cart.orderLifecycle;
    if (cart.orderLifecycle.paymentStatus === "idle") {
      acknowledgedLifecycleKey.current = "";
      if (conversationState.current) {
        conversationState.current.orderLifecycle = cart.orderLifecycle;
        conversationState.current.lastAcknowledgedPaymentStatus = undefined;
        conversationState.current.lastAcknowledgedOrderId = null;
        conversationState.current.lastAcknowledgedOrderNumber = null;
        conversationState.current.lastLifecycleMessageTemplateId = null;
        conversationState.current.conversationStage = cartRef.current.length ? "cart_review" : "discovering_needs";
        conversationState.current.closingStatus = "open";
      }
      return;
    }
    void synchronizeLifecycle();
  }, [cart.orderLifecycle, synchronizeLifecycle]);

  const reportTtsInterrupted = useCallback(() => {
    if (conversationState.current) conversationState.current.lastTtsInterrupted = true;
  }, []);
  const resetConversation = useCallback(() => {
    conversationState.current = undefined;
    actionResults.current = [];
    executedActionIds.current.clear();
    acknowledgedLifecycleKey.current = "";
    sending.current = false;
    setIsProcessing(false);
    setMessages([greeting(language)]);
  }, [language]);
  const value = useMemo(() => ({
    messages, isProcessing, activeAllergens, sendMessage, reportTtsInterrupted, resetConversation,
  }), [activeAllergens, isProcessing, messages, reportTtsInterrupted, resetConversation, sendMessage]);
  return <NoriConversationContext.Provider value={value}>{children}</NoriConversationContext.Provider>;
}
export function useNoriConversation() { const value = useContext(NoriConversationContext); if (!value) throw new Error("useNoriConversation must be used within NoriConversationProvider"); return value; }
