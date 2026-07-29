import type {
  NoriChatRequest,
  NoriChatResponse,
  NoriConversationStage,
  NoriConversationState,
} from "../types/noriChat";
import { lifecycleDrivenStage } from "./noriOrderLifecycleService";

export function currentNoriConversationStage(
  state: NoriConversationState,
  cart: NoriChatRequest["cart"],
): NoriConversationStage {
  const lifecycleStage = lifecycleDrivenStage(state);
  if (lifecycleStage) return lifecycleStage;
  if (state.conversationStage) return state.conversationStage;
  if (state.pendingAction) return "awaiting_confirmation";
  if (cart.length) return "cart_review";
  if (state.recentRecommendationContext) return "recommending";
  return "new_session";
}

export function advanceNoriConversationStage(
  response: NoriChatResponse,
  request: NoriChatRequest,
): NoriConversationStage {
  const state = response.conversationState;
  const lifecycleStage = lifecycleDrivenStage(state);
  if (lifecycleStage) return lifecycleStage;
  if (state.closingStatus === "order_completed" || state.closingStatus === "pay_at_cashier_pending") return "completed";
  if (state.closingStatus === "closed" || state.closingStatus === "awaiting_checkout_decision") return "closing";
  if (state.pendingAction) return "awaiting_confirmation";
  if (response.intent === "checkout") return response.actions.some(action => action.type === "CONFIRM_CHECKOUT")
    ? "checkout_ready"
    : request.cart.length ? "cart_review" : "discovering_needs";
  if (["show_cart", "cart_total", "review_order"].includes(response.intent)) return "cart_review";
  if (["product_comparison", "compare_products", "comparison_follow_up"].includes(response.intent)) return "comparing";
  if (response.intent === "customization_question") return "customizing";
  if (["recommendation", "healthy_recommendation", "bundle_recommendation", "menu_search"].includes(response.intent)) return "recommending";
  if (response.intent === "greeting"
    || (response.intent === "conversation" && state.lastConversationActs?.includes("greeting"))) {
    return currentNoriConversationStage(state, request.cart) === "new_session"
    ? "welcomed"
    : currentNoriConversationStage(state, request.cart);
  }
  if (response.intent === "add_to_cart" || request.cart.length) return "cart_review";
  return currentNoriConversationStage(state, request.cart) === "new_session"
    ? "discovering_needs"
    : currentNoriConversationStage(state, request.cart);
}
