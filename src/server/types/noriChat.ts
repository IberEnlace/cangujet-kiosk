import type { AIFoodItem, AINutrition } from "../../app/data/aiMenu";

export type NoriLanguage = "en" | "ar" | "tr" | string;

export type NoriCartItem = {
  productId: string;
  quantity: number;
  customizations?: Record<string, string>;
};

export type NoriIntent =
  | "greeting" | "help" | "menu_search" | "recommendation" | "product_details"
  | "product_comparison" | "customization_question" | "allergen_check"
  | "nutrition_question" | "add_to_cart" | "remove_from_cart" | "update_quantity"
  | "show_cart" | "clear_cart" | "undo" | "checkout" | "payment_methods" | "unknown";

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

export type NoriPendingActionStatus = "pending" | "confirmed" | "cancelled" | "executed" | "failed";
type NoriPendingActionMeta = { id: string; createdAt: number; status: NoriPendingActionStatus };

export type NoriPendingAction = (
  | { type: "clarify_product"; topic: string }
  | { type: "apply_customization"; customization: NoriSelectedCustomization }
  | { type: "clarify_recommendation"; primaryProductId: string; companionProductIds: string[]; quantity: number }
  | { type: "confirm_checkout" }
  | { type: "confirm_clear_cart" }
  | {
    type: "confirm_cart_change";
    operation: "add" | "remove" | "update";
    productId: string;
    quantity: number;
    customizations: NoriSelectedCustomization[];
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
