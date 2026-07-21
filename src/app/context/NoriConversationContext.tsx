import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { NoriChatRequest, NoriConversationState } from "../../server/types/noriChat";
import { executeNoriCartActions, serializeNoriCart } from "../services/noriCartActions";
import { postNoriChat } from "../services/noriChatClient";
import { useCart } from "./CartContext";
import { useLanguage } from "./LanguageContext";

export interface NoriMessage { id: string; sender: "user" | "nori"; text: string; }
interface NoriConversationValue { messages: NoriMessage[]; isProcessing: boolean; activeAllergens: string[]; sendMessage(text: string): Promise<string | null>; resetConversation(): void; }
const greeting: NoriMessage = { id: "nori-greeting", sender: "nori", text: "Hello! I’m Nori. Tell me what you feel like eating, your budget, or any dietary needs." };
const NoriConversationContext = createContext<NoriConversationValue | null>(null);

export function NoriConversationProvider({ children }: { children: ReactNode }) {
  const cart = useCart(); const { language } = useLanguage();
  const cartRef = useRef(cart.items); useEffect(() => { cartRef.current = cart.items; }, [cart.items]);
  const executedActionIds = useRef(new Set<string>()); const actionResults = useRef<NoriChatRequest["actionResults"]>([]);
  const conversationState = useRef<NoriConversationState>(); const sending = useRef(false);
  const [messages, setMessages] = useState<NoriMessage[]>([greeting]); const [isProcessing, setIsProcessing] = useState(false);
  const [activeAllergens] = useState<string[]>([]);
  const sendMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim(); if (!text || sending.current) return null; sending.current = true; setIsProcessing(true);
    setMessages(value => [...value, { id: crypto.randomUUID(), sender: "user", text }]);
    try {
      const result = await postNoriChat({ message: text, cart: serializeNoriCart(cartRef.current), activeAllergens, language, conversationState: conversationState.current, actionResults: actionResults.current });
      conversationState.current = result.conversationState;
      const executions = executeNoriCartActions(result.actions, { addItem: cart.addItem, updateCustomizations: cart.updateCustomizations, removeItem: cart.removeItem, updateQty: cart.updateQty, clearCart: cart.clearCart }, { executedActionIds: executedActionIds.current, cartRef });
      actionResults.current = executions.map(({ actionId, status }) => ({ actionId, status }));
      const reply = executions.some(item => item.status === "failed") ? "I couldn’t complete that cart action. Your cart has not been changed for that item." : result.reply;
      setMessages(value => [...value, { id: crypto.randomUUID(), sender: "nori", text: reply }]); return reply;
    } catch { const reply = "I couldn’t reach the Nori service. Please try again."; setMessages(value => [...value, { id: crypto.randomUUID(), sender: "nori", text: reply }]); return reply; }
    finally { sending.current = false; setIsProcessing(false); }
  }, [activeAllergens, cart.addItem, cart.clearCart, cart.removeItem, cart.updateCustomizations, cart.updateQty, language]);
  const resetConversation = useCallback(() => { conversationState.current = undefined; actionResults.current = []; executedActionIds.current.clear(); sending.current = false; setIsProcessing(false); setMessages([greeting]); }, []);
  const value = useMemo(() => ({ messages, isProcessing, activeAllergens, sendMessage, resetConversation }), [activeAllergens, isProcessing, messages, resetConversation, sendMessage]);
  return <NoriConversationContext.Provider value={value}>{children}</NoriConversationContext.Provider>;
}
export function useNoriConversation() { const value = useContext(NoriConversationContext); if (!value) throw new Error("useNoriConversation must be used within NoriConversationProvider"); return value; }
