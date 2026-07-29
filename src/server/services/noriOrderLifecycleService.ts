import type {
  NoriChatRequest,
  NoriConversationStage,
  NoriConversationState,
  NoriLanguage,
} from "../types/noriChat";
import type { NoriOrderLifecycleContext, NoriPaymentStatus } from "../../shared/noriOrderLifecycle";

export function synchronizeNoriOrderLifecycle(
  state: NoriConversationState,
  incoming?: NoriOrderLifecycleContext,
  hasCart = false,
) {
  if (!incoming?.paymentStatus) return;
  if (incoming.paymentStatus === "idle") {
    state.orderLifecycle = { ...incoming };
    state.lastAcknowledgedPaymentStatus = undefined;
    state.lastAcknowledgedOrderId = null;
    state.lastAcknowledgedOrderNumber = null;
    state.lastLifecycleMessageTemplateId = null;
    state.conversationStage = hasCart ? "cart_review" : "discovering_needs";
    state.closingStatus = "open";
    return;
  }
  const current = state.orderLifecycle;
  if (isStaleLifecycle(current, incoming)) return;
  state.orderLifecycle = { ...current, ...incoming };
  synchronizeStageFromLifecycle(state, incoming.paymentStatus);
}

export function lifecycleDrivenStage(
  state: NoriConversationState,
): NoriConversationStage | null {
  const status = state.orderLifecycle?.paymentStatus;
  if (status === "completed" || status === "pay_at_cashier_pending") return "completed";
  if (status === "processing") return "payment_processing";
  if (status === "pending" || status === "failed") return "checkout_ready";
  if (status === "cancelled") return "cart_review";
  return null;
}

export function lifecycleNeedsAcknowledgement(state: NoriConversationState) {
  const lifecycle = state.orderLifecycle;
  if (!lifecycle?.paymentStatus || lifecycle.paymentStatus === "idle") return false;
  return lifecycle.paymentStatus !== state.lastAcknowledgedPaymentStatus
    || lifecycle.orderId !== (state.lastAcknowledgedOrderId ?? undefined)
    || lifecycle.orderNumber !== (state.lastAcknowledgedOrderNumber ?? undefined);
}

export function shouldHandleLifecycleTurn(request: NoriChatRequest, state: NoriConversationState) {
  return asksAboutLifecycle(request.message)
    || (state.orderLifecycle?.paymentStatus === "failed"
      && /\b(?:what happened|why did it fail|ne oldu|neden olmadı)\b/u.test(request.message.toLocaleLowerCase("tr-TR")))
    || lifecycleNeedsAcknowledgement(state);
}

export function buildNoriLifecycleResponse(
  state: NoriConversationState,
  language: NoriLanguage,
  message = "",
) {
  const lifecycle = state.orderLifecycle;
  const status = lifecycle?.paymentStatus ?? "idle";
  const tr = language === "tr";
  const number = lifecycle?.orderNumber?.trim();
  const safeError = safeCustomerError(lifecycle?.paymentErrorMessage);
  const response = status === "idle" && asksToPayAtCashier(message)
    ? tr
      ? "Kasada ödeme seçeneğini ödeme ekranında seçebilirsiniz. Siparişiniz oluşturulduğunda ödemenizi kasada tamamlayabilirsiniz."
      : "You can select pay at cashier on the payment screen. Once the order is created, you can complete payment at the cashier."
    : lifecycleTemplate(status, tr, number, lifecycle?.paymentMethod, safeError);
  state.lastAcknowledgedPaymentStatus = status;
  state.lastAcknowledgedOrderId = lifecycle?.orderId ?? null;
  state.lastAcknowledgedOrderNumber = number ?? null;
  state.lastLifecycleMessageTemplateId = `lifecycle.${status}.${language}.${number ? "number" : "no-number"}`;
  return response;
}

function asksToPayAtCashier(message: string) {
  const text = message.toLocaleLowerCase("tr-TR");
  return /(?:kasada öde|pay at (?:the )?cashier|pay with cash)/u.test(text);
}

export function completedOrderGuardResponse(
  message: string,
  language: NoriLanguage,
) {
  const text = message.toLocaleLowerCase(language === "tr" ? "tr-TR" : "en-US");
  const wantsNewOrder = /\b(?:new order|start another|add something else|yeni sipariş|başka bir şey eklemek)\b/u.test(text);
  if (wantsNewOrder) return language === "tr"
    ? "Tamamlanan siparişi değiştiremeyiz. Yeni bir sipariş için yeni bir oturum başlatabiliriz."
    : "The completed order cannot be changed. We can start a new session for another order.";
  return null;
}

export function completedOrderLockedResponse(language: NoriLanguage) {
  return language === "tr"
    ? "Bu sipariş tamamlandı; mevcut siparişe ürün ekleyemem veya yeni öneri uygulayamam. Yeni bir sipariş için yeni bir oturum başlatabilirsiniz."
    : "This order is complete, so I cannot add items or apply new recommendations to it. Start a new session for another order.";
}

export function asksAboutLifecycle(message: string) {
  const text = message.toLocaleLowerCase("tr-TR");
  return /\b(?:payment|paid|order number|payment fail|payment go through|cashier|ödemem|ödeme|sipariş numaram|siparişim tamam|kasada)\b/u.test(text);
}

function synchronizeStageFromLifecycle(state: NoriConversationState, status: NoriPaymentStatus) {
  if (status === "completed") {
    state.conversationStage = "completed";
    state.closingStatus = "order_completed";
    state.pendingAction = null;
    return;
  }
  if (status === "pay_at_cashier_pending") {
    state.conversationStage = "completed";
    state.closingStatus = "pay_at_cashier_pending";
    state.pendingAction = null;
    return;
  }
  if (status === "processing") {
    state.conversationStage = "payment_processing";
    state.closingStatus = "checkout_ready";
    return;
  }
  if (status === "pending" || status === "failed") {
    state.conversationStage = "checkout_ready";
    state.closingStatus = "checkout_ready";
    return;
  }
  if (status === "cancelled") {
    state.conversationStage = "cart_review";
    state.closingStatus = "open";
  }
}

function lifecycleTemplate(
  status: NoriPaymentStatus,
  tr: boolean,
  orderNumber?: string,
  method?: NoriOrderLifecycleContext["paymentMethod"],
  error?: string,
) {
  if (status === "pending") return tr
    ? "Ödeme işleminiz henüz tamamlanmadı. Ödemeyi tamamladığınızda siparişinizi onaylayabilirim."
    : "Your payment has not been completed yet. Once payment is complete, I can confirm the order.";
  if (status === "processing") return tr
    ? "Ödemeniz işleniyor. Lütfen kısa bir süre bekleyin."
    : "Your payment is being processed. Please wait a moment.";
  if (status === "completed") {
    const cash = method === "cash";
    if (tr) {
      if (orderNumber) return `${cash ? "Nakit ödemeniz" : "Ödemeniz"} tamamlandı. Sipariş numaranız ${orderNumber}. Afiyet olsun!`;
      return `${cash ? "Nakit ödemeniz" : "Ödemeniz"} tamamlandı ve siparişiniz alındı. Afiyet olsun!`;
    }
    if (orderNumber) return `Your ${cash ? "cash payment" : "payment"} is complete. Your order number is ${orderNumber}. Enjoy your meal!`;
    return `Your ${cash ? "cash payment" : "payment"} is complete and your order has been placed. Enjoy your meal!`;
  }
  if (status === "pay_at_cashier_pending") {
    if (tr) return `Siparişiniz oluşturuldu. Ödemenizi kasada tamamlayabilirsiniz.${orderNumber ? ` Sipariş numaranız ${orderNumber}.` : ""}`;
    return `Your order has been created. You can complete payment at the cashier.${orderNumber ? ` Your order number is ${orderNumber}.` : ""}`;
  }
  if (status === "failed") {
    const base = tr
      ? "Ödeme tamamlanamadı. Tekrar deneyebilir veya farklı bir ödeme yöntemi seçebilirsiniz."
      : "The payment could not be completed. You can try again or choose another payment method.";
    return error ? `${base} ${error}` : base;
  }
  if (status === "cancelled") return tr
    ? "Ödeme iptal edildi. Sepetinize dönebilir veya farklı bir ödeme yöntemi seçebilirsiniz."
    : "The payment was cancelled. You can return to your cart or choose another payment method.";
  return tr
    ? "Henüz başlatılmış bir ödeme işlemi görünmüyor."
    : "There is no payment in progress yet.";
}

function isStaleLifecycle(
  current: NoriOrderLifecycleContext | undefined,
  incoming: NoriOrderLifecycleContext,
) {
  if (current?.orderId && incoming.orderId && current.orderId !== incoming.orderId) return true;
  if (current?.updatedAt && incoming.updatedAt
    && Date.parse(incoming.updatedAt) < Date.parse(current.updatedAt)) return true;
  if (current?.paymentStatus === "completed" && incoming.paymentStatus !== "completed") return true;
  return false;
}

function safeCustomerError(value?: string) {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact || /stack|token|provider|payload|sql|exception|cvv|card number/i.test(compact)) return undefined;
  return compact.slice(0, 160);
}
