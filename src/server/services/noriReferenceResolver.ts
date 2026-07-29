import { noriMenuProducts } from "../../app/services/noriMenuEngine";
import type { NoriConversationState } from "../types/noriChat";
import { healthyNoriScore } from "./noriRecommendationRanker";
import {
  extractNoriUnderstanding,
  normalizeNoriText,
} from "./noriUnderstandingService";

export type NoriReferenceResolution = {
  phrase: string;
  resolvedType: "product" | "products" | "cart_item" | "ambiguous" | "none";
  resolvedIds: string[];
  ambiguous: boolean;
  clarificationQuestion?: string;
};

export function resolveNoriReference(
  input: string,
  state: NoriConversationState,
): NoriReferenceResolution {
  const phrase = normalizeNoriText(input, state.preferredLanguage);
  const signals = extractNoriUnderstanding(input, state.preferredLanguage, state);
  const plannerIds = state.plannerSnapshot
    && state.plannerSnapshot.createdAt >= (state.recentRecommendationContext?.createdAt ?? 0)
    ? state.plannerSnapshot.selectedProductIds
    : [];
  const recentIds = (plannerIds.length
    ? plannerIds
    : state.recentRecommendationContext?.productIds
      ?? state.lastMultiOptionContext?.productIds
      ?? []).filter(isKnownProductId);
  const comparedIds = (state.comparisonContext?.productIds
    ?? (state.lastComparedProductIds?.length === 2
      ? [state.lastComparedProductIds[0], state.lastComparedProductIds[1]]
      : undefined))?.filter(isKnownProductId);
  let ids: string[] = [];

  if (signals.referenceOrdinal !== null) {
    const referenced = recentIds[signals.referenceOrdinal - 1];
    if (referenced) ids = [referenced];
  } else if (signals.bothReference) {
    ids = comparedIds ? [...comparedIds] : recentIds.slice(0, 2);
  } else if (signals.comparativePreference && (comparedIds?.length || recentIds.length >= 2)) {
    const sourceIds = comparedIds ? [...comparedIds] : recentIds.slice(0, 3);
    const products = sourceIds.flatMap(id => noriMenuProducts.find(item => item.id === id) ?? []);
    const sorted = [...products].sort((first, second) => {
      if (signals.comparativePreference === "price") return first.price - second.price;
      if (signals.comparativePreference === "protein") return second.proteinGrams - first.proteinGrams;
      if (signals.comparativePreference === "light") return first.cal - second.cal;
      return healthyNoriScore(second) - healthyNoriScore(first);
    });
    if (sorted[0]) ids = [sorted[0].id];
  } else if (signals.alternativeReference) {
    const currentId = state.selectedProductId ?? state.currentRecommendation?.primaryProductId;
    const alternatives = recentIds.filter(id => id !== currentId);
    if (currentId && alternatives.length) ids = [alternatives[0]];
    else if (recentIds.length === 2) ids = [recentIds[1]];
    else if (recentIds.length > 2) {
      return ambiguous(
        phrase,
        recentIds,
        state.preferredLanguage === "tr"
          ? "Hangi diğer seçeneği kastettiğinizi söyler misiniz?"
          : "Which other option do you mean?",
      );
    }
  } else if (/(?:^|\s)(?:the meal|yemek)(?=$|[\s,.!?])/u.test(phrase)) {
    ids = state.selectedMealId ? [state.selectedMealId] : [];
  } else if (/(?:^|\s)(?:the drink|içecek)(?=$|[\s,.!?])/u.test(phrase)) {
    ids = state.selectedDrinkId ? [state.selectedDrinkId] : [];
  } else if (signals.refersToLastProduct) {
    const active = [state.selectedMealId, state.selectedDrinkId].filter((id): id is string => Boolean(id));
    if (active.length > 1) {
      return ambiguous(
        phrase,
        active,
        state.preferredLanguage === "tr"
          ? "Yemeği mi yoksa içeceği mi kastettiniz?"
          : "Would you like me to use the meal or the drink?",
      );
    }
    ids = active.length
      ? active
      : state.selectedProductId
        ? [state.selectedProductId]
        : state.lastReferencedCartItemId
          ? [state.lastReferencedCartItemId]
          : [];
  }

  return {
    phrase,
    resolvedType: ids.length > 1 ? "products" : ids.length === 1 ? "product" : "none",
    resolvedIds: ids,
    ambiguous: false,
  };
}

function isKnownProductId(productId: string) {
  return noriMenuProducts.some(product => product.id === productId);
}

function ambiguous(
  phrase: string,
  resolvedIds: string[],
  clarificationQuestion: string,
): NoriReferenceResolution {
  return {
    phrase,
    resolvedType: "ambiguous",
    resolvedIds,
    ambiguous: true,
    clarificationQuestion,
  };
}
