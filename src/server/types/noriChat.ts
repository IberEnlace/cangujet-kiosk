import type { AIFoodItem, AINutrition } from "../../app/data/aiMenu";
import type { SupportedLanguage } from "../../shared/languages";

export type NoriLanguage = SupportedLanguage;

export type NoriCartItem = {
  productId: string;
  quantity: number;
  customizations?: Record<string, string>;
  name?: string;
  unitPrice?: number;
  customizationObjects?: NoriSelectedCustomization[];
  actionId?: string;
};

export type NoriIntent =
  | "greeting" | "help" | "menu_search" | "recommendation" | "product_details"
  | "product_comparison" | "customization_question" | "allergen_check"
  | "nutrition_question" | "add_to_cart" | "remove_from_cart" | "update_quantity"
  | "show_cart" | "cart_total" | "clear_cart" | "undo" | "checkout" | "payment_methods"
  | "ordering_help" | "healthy_recommendation" | "bundle_recommendation" | "review_order"
  | "compare_products" | "comparison_follow_up" | "comparative_add"
  | "highest_protein" | "lowest_calories" | "lowest_fat" | "lowest_sugar" | "lowest_sodium" | "highest_fiber"
  | "restaurant_information" | "opening_hours" | "order_timing" | "staff_assistance"
  | "confirmation" | "cancellation" | "clarification_answer" | "constraint_update" | "unsupported" | "unknown";
  // Constraint-only turns update request context before a product is requested.

export type NoriSelectedCustomization = {
  productId: string;
  groupId: string;
  optionId: string;
  optionName: string;
  priceAdjustment: number;
  nutritionAdjustment: AINutrition;
  allergensAdded: string[];
  allergensRemoved: string[];
};

export type NoriCurrentRecommendation = {
  primaryProductId: string;
  companionProductIds: string[];
  totalPrice?: number;
  reason?: string;
};

export type NoriRecentRecommendationContext = {
  contextId: string;
  createdAt: number;
  queryType: "recommendation" | "healthy" | "budget" | "high_protein" | "lowest_calories" | "kids" | "bundle" | "comparison";
  productIds: string[];
  pairs?: Array<{ foodProductId: string; drinkProductId: string; totalPrice: number }>;
  category?: string;
};

export type NoriComparisonContext = { productIds: [string, string]; createdAt: number };

export type NoriClarificationStatus = "awaiting_answer" | "answered" | "superseded" | "cancelled" | "expired";
export type NoriClarificationState = {
  clarificationId: string;
  clarificationType: "recommendation_kind" | "drink_temperature" | "product" | "other";
  expectedAnswerTypes: string[];
  relatedIntent: NoriIntent;
  relatedConstraints: Record<string, unknown>;
  createdAt: number;
  status: NoriClarificationStatus;
};

export type NoriPendingActionStatus = "pending" | "proposed" | "awaiting_confirmation" | "modified_awaiting_confirmation" | "executing" | "confirmed" | "completed" | "cancelled" | "executed" | "expired" | "failed";
type NoriPendingActionMeta = { id: string; createdAt: number; status: NoriPendingActionStatus; version?: number };

export type NoriPendingAction = (
  | { type: "clarify_product"; topic: string }
  | { type: "apply_customization"; customization: NoriSelectedCustomization }
  | { type: "clarify_recommendation"; primaryProductId: string; companionProductIds: string[]; quantity: number }
  | { type: "confirm_checkout" }
  | { type: "confirm_clear_cart" }
  | { type: "confirm_bundle"; productIds: string[]; quantity: number }
  | {
    type: "confirm_cart_change";
    operation: "add" | "remove" | "update";
    productId: string;
    productName?: string;
    quantity: number;
    customizations: NoriSelectedCustomization[];
    basePrice?: number;
    unitPrice?: number;
    adjustedNutrition?: AINutrition;
    adjustedAllergens?: string[];
  }
) & NoriPendingActionMeta | null;

export type NoriConversationState = {
  preferredLanguage: NoriLanguage;
  activeAllergens: string[];
  maxBudget: number | null;
  minProtein: number | null;
  maxCalories: number | null;
  dietaryPreferences: string[];
  persistentDietaryPreferences: string[];
  requestedCategory: string | null;
  requestedDrink: boolean;
  requestedSpicy: boolean;
  requestedKids: boolean;
  requestedDessert: boolean;
  selectedProductId: string | null;
  selectedCustomizations: NoriSelectedCustomization[];
  currentRecommendation: NoriCurrentRecommendation | null;
  selectedCartItemId: string | null;
  latestAddedCartItemId: string | null;
  latestSuccessfulMutation: NoriAction | null;
  executedActionIds: string[];
  recentlyRecommendedProductIds: string[];
  pendingAction: NoriPendingAction;
  lastComparedProductIds?: string[];
  selectedMealId?: string | null;
  selectedDrinkId?: string | null;
  lastReferencedCartItemId?: string | null;
  lastRemovedCartItemSnapshot?: NoriCartItem | null;
  lastExecutedActionId?: string | null;
  excludedIngredients?: string[];
  awaitingConstraintClarification?: boolean;
  clarificationState?: NoriClarificationState | null;
  afterTaxBudget?: boolean;
  pendingActionHistory?: Array<Exclude<NoriPendingAction, null>>;
  recentRecommendationContext?: NoriRecentRecommendationContext | null;
  lastMultiOptionContext?: NoriRecentRecommendationContext | null;
  comparisonContext?: NoriComparisonContext | null;
};

export type NoriChatRequest = {
  message: string;
  cart: NoriCartItem[];
  activeAllergens: string[];
  language: NoriLanguage;
  conversationState?: NoriConversationState;
  actionResults?: Array<{ actionId: string; status: "success" | "failed" }>;
};

export type NoriAction =
  | {
    type: "add_to_cart";
    actionId: string;
    productId: string;
    quantity: number;
    customizations: NoriSelectedCustomization[];
    unitPrice?: number;
    label: string;
  }
  | {
    type: "update_cart_customization";
    actionId: string;
    productId: string;
    customizations: NoriSelectedCustomization[];
    label: string;
  }
  | { type: "remove_from_cart"; actionId: string; productId: string; cartItemId?: string; quantity: number; customizations: NoriSelectedCustomization[]; adjustedUnitPrice: number; label: string }
  | { type: "update_quantity"; actionId: string; productId: string; cartItemId?: string; quantity: number; customizations: NoriSelectedCustomization[]; adjustedUnitPrice: number; label: string }
  | { type: "replace_cart_item"; actionId: string; productId: string; replacementProductId: string; cartItemId?: string; quantity: number; customizations: NoriSelectedCustomization[]; adjustedUnitPrice: number; label: string }
  | { type: "clear_cart"; actionId: string; productId: ""; quantity: 0; customizations: []; adjustedUnitPrice: 0; label: string }
  | { type: "REVIEW_ALLERGENS"; productIds: string[]; label: string }
  | { type: "OPEN_CART"; label: string }
  | { type: "CONFIRM_CHECKOUT"; label: string }
  | { type: "REMOVE_PRODUCT"; productId: string; label: string }
  | { type: "UPDATE_QUANTITY"; productId: string; quantity: number; label: string }
  | { type: "APPLY_CUSTOMIZATION"; productId: string; groupId: string; optionId: string; label: string };

export type NoriWarning = {
  type: "contains" | "may_contain" | "cross_contact";
  productId: string;
  productName: string;
  allergens: string[];
  message: string;
};

export type NoriChatResponse = {
  intent: NoriIntent;
  reply: string;
  recommendedProducts: AIFoodItem[];
  actions: NoriAction[];
  warnings: NoriWarning[];
  conversationState: NoriConversationState;
};

export type NoriChatError = {
  error: string;
};
