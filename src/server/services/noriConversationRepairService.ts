import { noriMenuProducts } from "../../app/services/noriMenuEngine";
import type {
  NoriAssistantResponseSummary,
  NoriChatResponse,
  NoriConversationState,
} from "../types/noriChat";

export function summarizeNoriAssistantResponse(response: NoriChatResponse): NoriAssistantResponseSummary {
  return {
    purpose: response.intent,
    productIds: response.recommendedProducts.map(product => product.id).slice(0, 3),
    requestedClarification: response.reply.includes("?") ? response.reply : null,
    proposedActions: response.actions.map(action => action.type),
    documentedValues: response.recommendedProducts.slice(0, 3).map(product => ({
      productId: product.id,
      price: product.price,
      proteinGrams: product.proteinGrams,
      calories: product.cal,
    })),
  };
}

export function buildNoriRepairResponse(
  state: NoriConversationState,
  mode: "repeat" | "simplify",
) {
  const summary = state.lastAssistantResponseSummary;
  const tr = state.preferredLanguage === "tr";
  state.activeRepairContext = {
    type: mode,
    originalIntent: summary?.purpose ?? state.previousCustomerIntent ?? null,
    productIds: summary?.productIds ?? [],
    createdAt: Date.now(),
  };
  state.misunderstandingCount = (state.misunderstandingCount ?? 0) + 1;
  if (!summary) {
    return tr
      ? "Önceki yanıtın özeti elimde değil. Ürün, fiyat, besin değeri veya sepet konusunda neyi tekrar açıklamamı istersiniz?"
      : "I don’t have a previous response summary. What should I explain again: a product, price, nutrition, or your cart?";
  }
  const products = summary.productIds.flatMap(id => noriMenuProducts.find(product => product.id === id) ?? []);
  if (products.length) {
    const details = products.map(product => tr
      ? `${product.name}: $${product.price.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}, ${product.proteinGrams.toLocaleString("tr-TR")} g protein`
      : `${product.name}: $${product.price.toFixed(2)}, ${product.proteinGrams}g protein`);
    const prefix = mode === "simplify"
      ? tr ? "Daha basit söyleyeyim: " : "More simply: "
      : tr ? "Kısaca tekrar edeyim: " : "Briefly: ";
    return `${prefix}${details.join("; ")}.`;
  }
  if (summary.requestedClarification) {
    return `${tr ? "Kısaca sorum şu: " : "My question, briefly: "}${summary.requestedClarification}`;
  }
  if (summary.proposedActions.length) {
    return tr
      ? "Kısaca: İşlemi uygulamadan önce onayınızı istedim."
      : "Briefly: I asked for your confirmation before applying the action.";
  }
  return tr
    ? "Kısaca: Menü veya siparişinizle ilgili nasıl yardımcı olabileceğimi açıkladım."
    : "Briefly: I explained how I can help with the menu or your order.";
}
