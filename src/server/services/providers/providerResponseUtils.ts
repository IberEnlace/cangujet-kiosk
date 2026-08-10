import type { AIFoodItem } from "../../../app/data/aiMenu";
import { checkProductAllergens } from "../../../app/services/noriMenuEngine";
import type { NoriAction, NoriChatRequest, NoriChatResponse, NoriWarning } from "../../types/noriChat";
import { executeNoriTool, type NoriToolResult } from "../noriToolLayer";
import type { AIToolCall } from "../../types/aiProvider";

function productsFromResult(result: NoriToolResult): AIFoodItem[] {
  if (Array.isArray(result)) return result.flatMap(item => "product" in item ? [item.product] : [item]);
  return "product" in result ? [result.product] : [];
}

export function productsFromToolCalls(toolCalls: AIToolCall[]): AIFoodItem[] {
  const products = toolCalls.flatMap(call => productsFromResult(executeNoriTool(call)));
  return [...new Map(products.map(product => [product.id, product])).values()]
    .sort((first, second) => second.recommendationScore - first.recommendationScore)
    .slice(0, 4);
}

export function warningsForProducts(products: AIFoodItem[], allergens: string[]): NoriWarning[] {
  return products.flatMap(product => {
    const check = checkProductAllergens(product, allergens);
    return [
      ...(check.contains.length ? [{ type: "contains" as const, allergens: check.contains }] : []),
      ...(check.mayContain.length ? [{ type: "may_contain" as const, allergens: check.mayContain }] : []),
      ...(check.crossContact.length ? [{ type: "cross_contact" as const, allergens: check.crossContact }] : []),
    ].map(risk => ({ ...risk, productId: product.id, productName: product.name, message: product.allergenSafetyMessage }));
  });
}

export function buildProviderResponse(toolCalls: AIToolCall[], request: NoriChatRequest): NoriChatResponse {
  const products = productsFromToolCalls(toolCalls);
  const warnings = warningsForProducts(products, request.activeAllergens);
  const actions: NoriAction[] = products.map(product => ({
    type: "add_to_cart",
    actionId: `provider-add-${product.id}`,
    productId: product.id,
    quantity: 1,
    customizations: [],
    label: request.language === "tr" ? `${product.name} ürününü ekle` : `Add ${product.name}`,
  }));
  if (warnings.length) actions.push({ type: "REVIEW_ALLERGENS", productIds: [...new Set(warnings.map(warning => warning.productId))], label: request.language === "tr" ? "Alerjen uyarılarını incele" : "Review allergen warnings" });
  if (request.cart.length) actions.push({ type: "OPEN_CART", label: request.language === "tr" ? "Sepeti incele" : "Review cart" });
  const reply = request.language === "tr"
    ? products.length
      ? `cangujet menüsünde ${products.length} uygun seçenek buldum.${warnings.length ? " Bir ürün eklemeden önce alerjen ve çapraz temas uyarılarını inceleyin." : ""}`
      : "Bu isteğe uyan uygun bir menü ürünü bulamadım. Filtrelerden birini değiştirmeyi deneyin."
    : products.length
      ? `I found ${products.length} available menu option${products.length === 1 ? "" : "s"} using the cangujet menu.${warnings.length ? " Please review the allergen and cross-contact warnings before adding an item." : ""}`
      : "I could not find an available menu item matching that request. Try changing one of your filters.";
  const conversationState = request.conversationState ?? {
    preferredLanguage: request.language,
    activeAllergens: request.activeAllergens,
    maxBudget: null, minProtein: null, maxCalories: null, dietaryPreferences: [],
    persistentDietaryPreferences: [], requestedCategory: null, requestedDrink: false,
    requestedSpicy: false, requestedKids: false, requestedDessert: false, selectedProductId: null,
    selectedCustomizations: [], currentRecommendation: null, pendingAction: null,
    selectedCartItemId: null, latestAddedCartItemId: null, latestSuccessfulMutation: null, executedActionIds: [],
    recentlyRecommendedProductIds: [],
  };
  return { intent: "recommendation", reply, recommendedProducts: products, actions, warnings, conversationState };
}
