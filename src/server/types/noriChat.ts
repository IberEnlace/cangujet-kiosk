import type { AIFoodItem, AINutrition } from "../../app/data/aiMenu";
import type { SupportedLanguage } from "../../shared/languages";
import type { NoriOrderLifecycleContext } from "../../shared/noriOrderLifecycle";
import type { NoriSpeechDirectives, NoriSpeechRate } from "../../shared/noriSpeech";

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
  | "lifecycle_status"
  | "confirmation" | "cancellation" | "clarification_answer" | "constraint_update"
  | "conversation" | "unsupported" | "unknown";
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

export type NoriRankingPriority =
  | "healthy"
  | "protein"
  | "price"
  | "light"
  | "filling"
  | "refreshing"
  | "popular"
  | "quick";

export type NoriPreferenceMemory = {
  dislikedIngredients: string[];
  avoidSpicy: boolean;
  preferredFlavors: string[];
  updatedAt: number;
};

export type NoriPlannerConfidenceBand = "high" | "medium" | "low";

export type NoriPlannerDiagnostics = {
  planId: string;
  detectedIntent: NoriIntent;
  constraints: {
    hard: string[];
    soft: NoriRankingPriority[];
  };
  reasoningPlan: {
    goal: NoriIntent;
    rankingSignals: NoriRankingPriority[];
    deprioritizedCategories: string[];
    referenceProductIds: string[];
    reusedPreviousResults: boolean;
  };
  executionSteps: Array<{
    tool: string;
    order: number;
    parallelGroup: number;
    source: "deterministic" | "provider";
  }>;
  validationStatus: "pending" | "passed" | "repaired" | "failed";
  confidence: {
    score: number;
    band: NoriPlannerConfidenceBand;
  };
  recommendationConfidence: Array<{
    productId: string;
    score: number;
    band: NoriPlannerConfidenceBand;
    matchedSignals: NoriRankingPriority[];
  }>;
  recoveryActions: string[];
};

export type NoriPlannerSnapshot = {
  planId: string;
  createdAt: number;
  constraintFingerprint: string;
  goal: NoriIntent;
  candidateProductIds: string[];
  selectedProductIds: string[];
};

export type NoriConversationAct =
  | "greeting"
  | "introduction"
  | "ask_capabilities"
  | "general_recommendation"
  | "request_help"
  | "indecision"
  | "hesitation"
  | "acknowledgement"
  | "gratitude"
  | "praise"
  | "complaint"
  | "rejection"
  | "correction"
  | "misunderstanding"
  | "request_repetition"
  | "request_simplification"
  | "confirmation"
  | "cancellation"
  | "change_mind"
  | "pause_request"
  | "resume_conversation"
  | "checkout_transition"
  | "farewell"
  | "unrelated_request"
  | "abusive_or_inappropriate_language"
  | "empty_or_noise_input";

export type NoriConversationStage =
  | "new_session"
  | "welcomed"
  | "discovering_needs"
  | "recommending"
  | "comparing"
  | "customizing"
  | "awaiting_confirmation"
  | "cart_review"
  | "checkout_ready"
  | "payment_processing"
  | "completed"
  | "closing";

export type NoriClosingStatus =
  | "open"
  | "paused"
  | "awaiting_checkout_decision"
  | "checkout_ready"
  | "order_completed"
  | "pay_at_cashier_pending"
  | "completed"
  | "closed";

export type NoriAssistantResponseSummary = {
  purpose: NoriIntent;
  productIds: string[];
  requestedClarification: string | null;
  proposedActions: NoriAction["type"][];
  documentedValues: Array<{
    productId: string;
    price: number;
    proteinGrams: number;
    calories: number;
  }>;
};

export type NoriRepairContext = {
  type: "repeat" | "simplify" | "correction";
  originalIntent: NoriIntent | null;
  productIds: string[];
  createdAt: number;
};

export type NoriUnderstandingDiagnostics = {
  detectedLanguage: NoriLanguage;
  deterministicIntent: NoriIntent;
  deterministicConfidence: number;
  semanticIntent: NoriIntent | null;
  semanticConfidence: number | null;
  providerFallbackUsed: boolean;
  extractedSignals: string[];
  selectedTools: string[];
  clarificationReason: string | null;
  finalRoute: NoriIntent;
  fallbackReason: string | null;
  planner?: NoriPlannerDiagnostics;
};

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
  preferenceMemory?: NoriPreferenceMemory;
  rankingPriorities?: NoriRankingPriority[];
  preferredFlavors?: string[];
  suggestedCompanionProductIds?: string[];
  lastDiscussedProductId?: string | null;
  previousCustomerIntent?: NoriIntent | null;
  previousAssistantQuestion?: string | null;
  understandingDiagnostics?: NoriUnderstandingDiagnostics;
  plannerSnapshot?: NoriPlannerSnapshot | null;
  conversationStage?: NoriConversationStage;
  lastConversationActs?: NoriConversationAct[];
  lastAssistantResponseSummary?: NoriAssistantResponseSummary | null;
  lastAssistantTemplateId?: string | null;
  socialResponseRotationIndex?: number;
  misunderstandingCount?: number;
  consecutiveNoiseCount?: number;
  temporaryRejectedProductIds?: string[];
  lastAcknowledgedIntent?: NoriIntent | null;
  closingStatus?: NoriClosingStatus;
  activeRepairContext?: NoriRepairContext | null;
  orderLifecycle?: NoriOrderLifecycleContext;
  lastAcknowledgedPaymentStatus?: NoriOrderLifecycleContext["paymentStatus"];
  lastAcknowledgedOrderId?: string | null;
  lastAcknowledgedOrderNumber?: string | null;
  lastLifecycleMessageTemplateId?: string | null;
  speechRate?: NoriSpeechRate;
  lastTtsInterrupted?: boolean;
};

export type NoriChatRequest = {
  message: string;
  cart: NoriCartItem[];
  activeAllergens: string[];
  language: NoriLanguage;
  conversationState?: NoriConversationState;
  actionResults?: Array<{ actionId: string; status: "success" | "failed" }>;
  orderLifecycle?: NoriOrderLifecycleContext;
  lifecycleEvent?: boolean;
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
  speechDirectives?: NoriSpeechDirectives;
};

export type NoriChatError = {
  error: string;
};
