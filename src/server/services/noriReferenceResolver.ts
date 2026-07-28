import { noriMenuProducts } from "../../app/services/noriMenuEngine";
import type { NoriConversationState } from "../types/noriChat";

export type NoriReferenceResolution = { phrase: string; resolvedType: "product" | "products" | "cart_item" | "ambiguous" | "none"; resolvedIds: string[]; ambiguous: boolean; clarificationQuestion?: string };

export function resolveNoriReference(input: string, state: NoriConversationState): NoriReferenceResolution {
  const phrase = input.toLowerCase().trim();
  let ids: string[] = [];
  if (/\b(first one|first option)\b/.test(phrase)) ids = state.recentlyRecommendedProductIds.slice(-3, -2);
  else if (/\b(second one|second option)\b/.test(phrase)) ids = state.recentlyRecommendedProductIds.slice(-2, -1);
  else if (/\b(both|them)\b/.test(phrase)) ids = state.lastComparedProductIds ?? [];
  else if (/\bthe meal\b/.test(phrase)) ids = state.selectedMealId ? [state.selectedMealId] : [];
  else if (/\bthe drink\b/.test(phrase)) ids = state.selectedDrinkId ? [state.selectedDrinkId] : [];
  else if (/\b(cheaper one|higher protein one)\b/.test(phrase) && state.lastComparedProductIds?.length === 2) {
    const products = state.lastComparedProductIds.flatMap(id => noriMenuProducts.find(item => item.id === id) ?? []);
    products.sort((a, b) => phrase.includes("cheaper") ? a.price - b.price : b.proteinGrams - a.proteinGrams);
    ids = products[0] ? [products[0].id] : [];
  } else if (/\b(it|this|that|that one)\b/.test(phrase)) {
    const active = [state.selectedMealId, state.selectedDrinkId].filter((id): id is string => Boolean(id));
    if (active.length > 1) {
      const result: NoriReferenceResolution = { phrase, resolvedType: "ambiguous", resolvedIds: active, ambiguous: true, clarificationQuestion: "Would you like me to use the meal or the drink?" };
      return result;
    }
    ids = active.length ? active : state.selectedProductId ? [state.selectedProductId] : [];
  }
  const result: NoriReferenceResolution = { phrase, resolvedType: ids.length > 1 ? "products" : ids.length === 1 ? "product" : "none", resolvedIds: ids, ambiguous: false };
  return result;
}
