import {
  answerMenuQuery,
  checkProductAllergens,
} from "../../../app/services/noriMenuEngine";
import type { AIProvider, AIProviderContext, AIToolCall } from "../../types/aiProvider";
import type { NoriAction, NoriChatRequest, NoriChatResponse, NoriWarning } from "../../types/noriChat";
import { getNoriLanguageInstruction } from "../../../shared/languages";

function createWarnings(products: NoriChatResponse["recommendedProducts"], allergens: string[]): NoriWarning[] {
  return products.flatMap(product => {
    const check = checkProductAllergens(product, allergens);
    const warnings: NoriWarning[] = [];
    if (check.contains.length) warnings.push({ type: "contains", productId: product.id, productName: product.name, allergens: check.contains, message: product.allergenSafetyMessage });
    if (check.mayContain.length) warnings.push({ type: "may_contain", productId: product.id, productName: product.name, allergens: check.mayContain, message: product.allergenSafetyMessage });
    if (check.crossContact.length) warnings.push({ type: "cross_contact", productId: product.id, productName: product.name, allergens: check.crossContact, message: product.allergenSafetyMessage });
    return warnings;
  });
}

export class MockAIProvider implements AIProvider {
  buildPrompt(request: NoriChatRequest): string {
    return [
      "You are Nori, cangujet Restaurant's menu assistant.",
      "Use only approved menu tools. Never invent menu facts.",
      getNoriLanguageInstruction(request.language),
      `Active allergens: ${request.activeAllergens.join(", ") || "none"}.`,
      `Active preferences: ${JSON.stringify(request.conversationState ? {
        allergens: request.conversationState.activeAllergens,
        dietary: request.conversationState.dietaryPreferences,
        excluded: request.conversationState.excludedIngredients,
        priorities: request.conversationState.rankingPriorities,
      } : {})}.`,
      `Customer message: ${request.message}`,
    ].join("\n");
  }

  async callTools(context: AIProviderContext): Promise<AIToolCall[]> {
    return [{ name: "recommendProducts", arguments: { query: context.request.message, allergens: context.request.activeAllergens, limit: 4 } }];
  }

  async generateResponse(context: AIProviderContext): Promise<NoriChatResponse> {
    const result = answerMenuQuery(context.request.message, context.request.activeAllergens);
    const warnings = createWarnings(result.recommendations, result.allergiesFlagged);
    const actions: NoriAction[] = result.recommendations.map(product => ({
      type: "add_to_cart",
      actionId: `mock-add-${product.id}`,
      productId: product.id,
      quantity: 1,
      customizations: [],
      label: context.request.language === "tr" ? `${product.name} ürününü ekle` : `Add ${product.name}`,
    }));
    if (result.upsellItem) actions.push({
      type: "add_to_cart",
      actionId: `mock-upsell-${result.upsellItem.id}`,
      productId: result.upsellItem.id,
      quantity: 1,
      customizations: [],
      label: context.request.language === "tr" ? `${result.upsellItem.name} ile eşleştir` : `Pair with ${result.upsellItem.name}`,
    });
    if (warnings.length) actions.push({ type: "REVIEW_ALLERGENS", productIds: [...new Set(warnings.map(warning => warning.productId))], label: context.request.language === "tr" ? "Alerjen uyarılarını incele" : "Review allergen warnings" });
    if (context.request.cart.length) actions.push({ type: "OPEN_CART", label: context.request.language === "tr" ? "Sepeti incele" : "Review cart" });
    const conversationState = context.request.conversationState ?? {
      preferredLanguage: context.request.language,
      activeAllergens: context.request.activeAllergens,
      maxBudget: null, minProtein: null, maxCalories: null, dietaryPreferences: [],
      persistentDietaryPreferences: [], requestedCategory: null, requestedDrink: false,
      requestedSpicy: false, requestedKids: false, requestedDessert: false, selectedProductId: null,
      selectedCustomizations: [], currentRecommendation: null, pendingAction: null,
      selectedCartItemId: null, latestAddedCartItemId: null, latestSuccessfulMutation: null, executedActionIds: [],
      recentlyRecommendedProductIds: [],
    };
    const reply = context.request.language === "tr"
      ? result.recommendations.length
        ? `Menüde ${result.recommendations.map(product => product.name).join(", ")} seçeneklerini buldum.`
        : "Bu isteğe uyan uygun bir menü ürünü bulamadım."
      : result.response;
    return { intent: "recommendation", reply, recommendedProducts: result.recommendations, actions, warnings, conversationState };
  }
}
