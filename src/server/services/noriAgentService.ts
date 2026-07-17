import { restaurantAIConfig, type AIFoodItem } from "../../app/data/aiMenu";
import {
  checkProductAllergens,
  noriMenuProducts,
  noriSupportedAllergens,
  searchProducts,
} from "../../app/services/noriMenuEngine";
import type { AIProvider, AIToolCall } from "../types/aiProvider";
import type {
  NoriAction, NoriChatRequest, NoriChatResponse, NoriConversationState,
  NoriIntent, NoriRecentRecommendationContext, NoriSelectedCustomization, NoriWarning,
} from "../types/noriChat";
import { executeNoriTool, validateNoriToolCall } from "./noriToolLayer";
import {
  interpretNoriRequest,
  isStableDietaryStatement,
  type NoriRequestInterpretation,
} from "./noriRequestInterpreter";
import {
  calculateCustomizedProduct,
  interpretCustomization,
  validateSelectedCustomizations,
} from "./noriCustomizationService";
import {
  buildAllergyResponse,
  buildCartConfirmationResponse,
  buildCheckoutResponse,
  buildClarificationResponse,
  buildCustomizationResponse,
  buildRecommendationResponse,
} from "./noriResponseService";
import { logIntentDecision, normalizeNoriInput, routeNoriIntent } from "./noriIntentRouter";

const CATEGORY_NAMES = ["burger", "pizza", "pasta", "healthy_bowl", "salad", "side", "dessert", "hot_drink", "cold_drink", "kids_meal"];
const CUSTOMIZATION_SYNONYMS: Record<string, string[]> = {
  sauce: ["sauce", "dressing", "mayonnaise", "mayo"],
  cheese: ["cheddar", "mozzarella", "parmesan", "cheese"],
  bread: ["bun", "crust", "wrap"],
  milk: ["milk", "dairy", "cream", "yogurt"],
  spicy: ["spice", "chili", "jalapeno", "hot"],
  onion: ["onion", "red onion"],
};

export class NoriAgentService {
  constructor(private readonly provider?: AIProvider) {}

  async process(request: NoriChatRequest): Promise<NoriChatResponse> {
    const state = createState(request);
    for (const result of request.actionResults ?? []) {
      console.log("[NORI][CART_ACTION]");
      console.log("action:", result.actionId);
      console.log("execution result:", result.status);
      if (result.status === "success" && !state.executedActionIds.includes(result.actionId)) {
        state.executedActionIds.push(result.actionId);
      }
      const historical = state.pendingActionHistory?.find(item => item.id === result.actionId);
      if (historical) historical.status = result.status === "success" ? "completed" : "failed";
    }
    const pendingResult = this.handlePendingAction(request, state);
    if (pendingResult) return pendingResult;
    if (isConfirmation(normalize(request.message)) && state.pendingActionHistory?.some(item =>
      item.type === "confirm_cart_change" && item.operation === "add" && item.status === "completed")) {
      return response("add_to_cart", "That item has already been added to your cart.", state);
    }
    const decision = routeNoriIntent(request.message, state);
    logIntentDecision(request.message, decision);
    const clarificationTransition = transitionClarification(state, request.message, decision.intent);
    console.log("[NORI][STATE]", {
      usedPersistentConstraints: { allergens: state.activeAllergens, dietaryPreferences: state.persistentDietaryPreferences },
      usedRequestConstraints: ["recommendation", "menu_search", "nutrition_question"].includes(decision.intent) ? { maxBudget: state.maxBudget, minProtein: state.minProtein, maxCalories: state.maxCalories } : {},
      ignoredStaleConstraints: !["recommendation", "menu_search", "nutrition_question"].includes(decision.intent),
      selectedProductId: state.selectedProductId,
      pendingActionId: state.pendingAction?.id ?? null,
    });
    if (decision.intent === "clarification_answer") return this.resetState(request.message, state);
    if (decision.intent === "constraint_update") return this.constraintUpdate(request, state, clarificationTransition === "superseded");
    const continuesConstraintContext = state.awaitingConstraintClarification
      || (clarificationTransition === "superseded" && ["recommendation", "menu_search", "nutrition_question"].includes(decision.intent));
    const freshQuery = isIndependentMenuQuery(request.message);
    if (freshQuery && !continuesConstraintContext) clearTransientSearchState(state);
    updateState(state, request.message);
    const intent = decision.intent;
    const interpretation = interpretNoriRequest(request.message, state);
    if (intent === "recommendation" || intent === "menu_search") applyInterpretation(state, interpretation, request.message);
    state.awaitingConstraintClarification = false;
    const selectedProduct = resolveSelectedProduct(request.message, state, request.cart);
    if (process.env.NODE_ENV !== "production") console.log("[NORI][REFERENCE_RESOLUTION]", { input: request.message, resolvedProductId: selectedProduct?.id ?? null });
    console.log("[NORI][CONTEXT_RESOLUTION]", {
      intent,
      activePersistentConstraints: { allergens: state.activeAllergens, dietaryPreferences: state.persistentDietaryPreferences, budget: state.maxBudget },
      requestScopedConstraints: { category: state.requestedCategory, drink: state.requestedDrink, kids: state.requestedKids },
      recentRecommendationContext: state.recentRecommendationContext,
      comparisonContext: state.comparisonContext,
      resolvedReferences: selectedProduct ? [selectedProduct.id] : [],
      ignoredStaleContext: !selectedProduct,
    });
    if (selectedProduct && selectedProduct.id !== state.selectedProductId) {
      state.selectedProductId = selectedProduct.id;
      state.selectedCustomizations = [];
    }

    switch (intent) {
      case "greeting": return response(intent, "Hello! I’m Nori. I can help with menu recommendations, allergies, nutrition, customizations, your cart, and checkout.", state);
      case "help": return response(intent, "Tell me your budget, dietary needs, allergies, protein or calorie goal, or ask about a product. I can also help manage your cart and prepare checkout.", state);
      case "payment_methods": return response(intent, "I do not have verified payment-method information. Please check with restaurant staff.", state);
      case "opening_hours": return response(intent, "I do not have verified opening-hours information. Please check with restaurant staff.", state);
      case "order_timing": return response(intent, "I do not have a verified preparation-time estimate. Please check with restaurant staff.", state);
      case "restaurant_information": return response(intent, "I do not have verified halal certification information. Please check with restaurant staff.", state);
      case "staff_assistance": return response(intent, "Please use the staff assistance button or ask a team member nearby.", state);
      case "ordering_help": return response(intent, "Tell me what you would like or ask for a recommendation. You can set a budget, dietary preference, allergy, or nutrition goal. Choose a product, customize it, confirm the addition, review your cart, and proceed to checkout.", state);
      case "show_cart": return this.cartSummary(intent, request, state, false);
      case "cart_total": return this.cartTotal(request, state);
      case "review_order": return this.orderReview(request, state);
      case "clear_cart": {
        state.pendingAction = createPendingAction({ type: "confirm_clear_cart" });
        return response(intent, "Please confirm clearing every item from your cart.", state);
      }
      case "undo": return this.undoLastMutation(state);
      case "checkout": return this.cartSummary(intent, request, state, true);
      case "customization_question": return this.customizationAnswer(request.message, selectedProduct, state);
      case "product_comparison":
      case "compare_products":
      case "comparison_follow_up": return this.comparisonAnswer(request.message, state, intent);
      case "comparative_add": return this.comparativeAdd(request.message, state);
      case "highest_protein":
      case "lowest_calories":
      case "lowest_fat":
      case "lowest_sugar":
      case "lowest_sodium":
      case "highest_fiber": return this.nutritionSuperlative(request.message, state, intent);
      case "healthy_recommendation": return this.healthyRecommendation(request.message, state);
      case "bundle_recommendation": return this.bundleRecommendation(request.message, state);
      case "product_details": return /\b(?:first|second|third) pair\b/.test(normalize(request.message)) ? this.selectBundlePair(request.message, state) : this.productDetails(selectedProduct, state);
      case "nutrition_question": return this.nutritionAnswer(request.message, selectedProduct, state);
      case "allergen_check": return this.allergenAnswer(selectedProduct, state);
      case "add_to_cart": return this.cartAction(intent, request.message, selectedProduct, state, "add");
      case "remove_from_cart": return this.cartAction(intent, request.message, selectedProduct, state, "remove");
      case "update_quantity": return this.cartAction(intent, request.message, selectedProduct, state, "update");
      case "menu_search":
      case "recommendation": return this.recommend(request, state, intent, interpretation);
      default: return response(intent, "I’m not sure what you want me to do. You can ask for a recommendation, product details, allergy information, a customization, your cart, or checkout.", state);
    }
  }

  private resetState(message: string, state: NoriConversationState): NoriChatResponse {
    const text = normalizeNoriInput(message);
    state.maxBudget = null;
    state.afterTaxBudget = false;
    if (text.includes("forget my budget")) {
      state.awaitingConstraintClarification = false;
      return response("clarification_answer", "Okay. I removed your budget limit.", state);
    }
    {
      state.minProtein = null; state.maxCalories = null; state.requestedCategory = null;
      state.requestedDrink = false; state.requestedSpicy = false; state.requestedKids = false;
      state.requestedDessert = false; state.selectedProductId = null; state.selectedCustomizations = [];
      state.currentRecommendation = null; state.pendingAction = null; state.lastComparedProductIds = [];
      state.recentRecommendationContext = null; state.lastMultiOptionContext = null; state.comparisonContext = null;
      if (text.includes("clear my preferences") || text.includes("start over")) {
        state.dietaryPreferences = []; state.persistentDietaryPreferences = [];
      }
    }
    return response("clarification_answer", "Okay. I cleared those temporary preferences.", state);
  }

  private async constraintUpdate(request: NoriChatRequest, state: NoriConversationState, interrupted: boolean): Promise<NoriChatResponse> {
    const interpretation = interpretNoriRequest(request.message, state);
    applyInterpretation(state, interpretation, request.message);
    state.excludedIngredients = interpretation.constraints.excludedIngredients;
    if (interrupted) {
      state.awaitingConstraintClarification = false;
      return this.recommend(request, state, "recommendation", interpretation);
    }
    state.awaitingConstraintClarification = true;
    const constraints = interpretation.constraints;
    let reply = "What kind of menu item would you like?";
    if (constraints.maxBudget !== null) reply = `I can help you stay within $${constraints.maxBudget}. Would you like food, a hot drink, or a cold drink?`;
    else if (constraints.excludedIngredients.includes("beef")) reply = "Got it. Would you prefer chicken, vegetarian, or another non-beef option?";
    else if (constraints.excludedIngredients.includes("spicy")) reply = "Got it. Would you prefer a burger, bowl, or another non-spicy option?";
    else if (constraints.excludedIngredients.includes("fried")) reply = "Got it. Would you prefer a burger, salad, or bowl that is not documented as fried?";
    else if (constraints.maxCalories !== null) reply = `I can keep documented options under ${constraints.maxCalories} calories. Would you prefer a meal, snack, or drink?`;
    else if (constraints.minProtein !== null) reply = `I can look for at least ${constraints.minProtein}g of protein. Would you prefer a burger, bowl, or another meal?`;
    state.clarificationState = {
      clarificationId: createActionId("clarification", "recommendation"),
      clarificationType: "recommendation_kind",
      expectedAnswerTypes: ["food", "meal", "burger", "bowl", "hot_drink", "cold_drink", "vegetarian", "vegan"],
      relatedIntent: "recommendation",
      relatedConstraints: {
        maxBudget: state.maxBudget, minProtein: state.minProtein, maxCalories: state.maxCalories,
        dietaryPreferences: state.dietaryPreferences, excludedIngredients: state.excludedIngredients,
        activeAllergens: state.activeAllergens, afterTax: state.afterTaxBudget,
      },
      createdAt: Date.now(),
      status: "awaiting_answer",
    };
    return response("constraint_update", reply.endsWith("?") ? reply : `${reply}?`, state);
  }

  private handlePendingAction(request: NoriChatRequest, state: NoriConversationState): NoriChatResponse | null {
    const pending = state.pendingAction;
    if (!pending) return null;
    const text = normalize(request.message);
    if (isCancellation(text)) {
      logPendingStatus(pending.id, pending.type, "cancelled");
      pending.status = "cancelled";
      archivePendingAction(state, pending);
      state.pendingAction = null;
      state.selectedCustomizations = [];
      return response("unknown", "Okay, I cancelled that action.", state);
    }
    if (pending.type === "confirm_cart_change" && pending.operation === "add" && !isConfirmation(text)) {
      const product = noriMenuProducts.find(item => item.id === pending.productId);
      const matched = product ? interpretCustomization(product, request.message) : null;
      const removable = product ? matchRequestedRemovableIngredient(product, request.message) : null;
      console.log("[NORI][CUSTOMIZATION_MATCH]", { input: request.message, normalizedInput: text, requestedConcept: removable?.ingredient ?? null, selectedOption: matched?.selection.optionName ?? removable?.selection.optionName ?? null });
      if (product && (matched || removable)) {
        const customization = matched?.selection ?? removable!.selection;
        pending.customizations = [...pending.customizations.filter(item => item.groupId !== customization.groupId), customization];
        pending.status = "modified_awaiting_confirmation";
        pending.version = (pending.version ?? 1) + 1;
        state.selectedCustomizations = pending.customizations;
        const calculation = calculateCustomizedProduct(product, pending.customizations);
        pending.productName = product.name;
        pending.basePrice = product.price;
        pending.unitPrice = calculation.adjustedPrice;
        pending.adjustedNutrition = calculation.adjustedNutrition;
        pending.adjustedAllergens = calculation.adjustedAllergens;
        logPendingStatus(pending.id, pending.type, pending.status);
        return response("customization_question", `Updated. Please confirm: add ${pending.quantity} ${product.name} with ${pending.customizations.map(item => item.optionName).join(", ")} for $${(calculation.adjustedPrice * pending.quantity).toFixed(2)}.`, state, [product]);
      }
      if (product && isIngredientRemovalRequest(text)) {
        return response("customization_question", `I cannot confirm that ingredient is removable from ${product.name} based on the menu data. You can choose one of the documented customizations: ${product.customizations.join(", ")}.`, state, [product]);
      }
    }
    if (pending.type === "apply_customization" && isCustomizationConfirmation(text)) {
      logPendingStatus(pending.id, pending.type, "confirmed");
      const customization = pending.customization;
      state.selectedCustomizations = [
        ...state.selectedCustomizations.filter(item =>
          item.productId !== customization.productId || item.groupId !== customization.groupId),
        customization,
      ];
      state.pendingAction = null;
      const productInCart = request.cart.some(item => item.productId === customization.productId);
      return {
        ...response(
          "customization_question",
          `${customization.optionName} is now selected for ${productName(customization.productId)}.`,
          state,
        ),
        actions: productInCart ? [{
          type: "update_cart_customization",
          actionId: createActionId("customize", customization.productId),
          productId: customization.productId,
          customizations: customizationsFor(state, customization.productId),
          label: `Apply ${customization.optionName}`,
        }] : [],
      };
    }
    if (pending.type === "clarify_recommendation") {
      if (wantsFullRecommendation(text)) {
        logPendingStatus(pending.id, pending.type, "confirmed");
        const productIds = [pending.primaryProductId, ...pending.companionProductIds];
        state.pendingAction = null;
        state.selectedCustomizations = [];
        return {
          ...response("add_to_cart", "Please confirm adding the full recommendation.", state),
          actions: productIds.map(productId => addAction(productId, pending.quantity, [])),
        };
      }
      if (wantsPrimaryOnly(text)) {
        logPendingStatus(pending.id, pending.type, "confirmed");
        state.pendingAction = null;
        const customizations = customizationsFor(state, pending.primaryProductId);
        state.selectedCustomizations = [];
        return {
          ...response("add_to_cart", `Please confirm adding ${productName(pending.primaryProductId)}.`, state),
          actions: [addAction(pending.primaryProductId, pending.quantity, customizations)],
        };
      }
      return null;
    }
    if (pending.type === "confirm_checkout" && isConfirmation(text)) {
      logPendingStatus(pending.id, pending.type, "confirmed");
      state.pendingAction = null;
      return {
        ...response("checkout", "Checkout is ready. Continue in the secure payment screen; do not enter card details in chat.", state),
        actions: [{ type: "CONFIRM_CHECKOUT", label: "Open secure checkout" }],
      };
    }
    if (pending.type === "confirm_clear_cart" && isConfirmation(text)) {
      pending.status = "executing";
      logPendingStatus(pending.id, pending.type, "executing");
      const action: NoriAction = {
        type: "clear_cart", actionId: pending.id, productId: "",
        quantity: 0, customizations: [], adjustedUnitPrice: 0, label: "Clear cart",
      };
      state.latestSuccessfulMutation = action;
      pending.status = "completed";
      logPendingStatus(pending.id, pending.type, "completed");
      archivePendingAction(state, pending);
      state.pendingAction = null;
      return { ...response("clear_cart", "Your cart has been cleared.", state), actions: [action] };
    }
    if (pending.type === "confirm_bundle" && isConfirmation(text)) {
      pending.status = "executing";
      logPendingStatus(pending.id, pending.type, "executing");
      const actions = pending.productIds.map(productId => addAction(productId, pending.quantity, customizationsFor(state, productId)));
      pending.status = "completed";
      archivePendingAction(state, pending);
      state.pendingAction = null;
      return { ...response("add_to_cart", `Added ${productNames(pending.productIds).join(" and ")} to your cart.`, state), actions };
    }
    if (pending.type !== "confirm_cart_change" || !isConfirmation(text)) return null;
    pending.status = "executing";
    logPendingStatus(pending.id, pending.type, "executing");
    if (pending.operation === "add") {
      const product = noriMenuProducts.find(item => item.id === pending.productId);
      if (!product || !validateSelectedCustomizations(product, pending.customizations)) {
        pending.status = "failed";
        archivePendingAction(state, pending);
        state.pendingAction = null;
        return response("add_to_cart", "I could not add that item because its documented product or customization data is invalid.", state);
      }
      if (state.executedActionIds.includes(pending.id)) {
        pending.status = "completed";
        archivePendingAction(state, pending);
        state.pendingAction = null;
        return response("add_to_cart", "That item has already been added to your cart.", state);
      }
      const action = addAction(pending.productId, pending.quantity, pending.customizations, pending.id);
      state.selectedCustomizations = [];
      state.latestSuccessfulMutation = action;
      state.executedActionIds.push(action.actionId);
      pending.status = "completed";
      archivePendingAction(state, pending);
      state.pendingAction = null;
      const customizationText = action.customizations.length ? ` with ${action.customizations.map(item => item.optionName).join(", ")}` : "";
      return {
        ...response("add_to_cart", `Added ${action.quantity} ${product.name}${customizationText} to your cart.`, state),
        actions: [action],
      };
    }
    state.pendingAction = null;
    pending.status = "completed";
    archivePendingAction(state, pending);
    const action: NoriAction = pending.operation === "remove"
      ? { type: "REMOVE_PRODUCT", productId: pending.productId, label: `Remove ${productName(pending.productId)}` }
      : { type: "UPDATE_QUANTITY", productId: pending.productId, quantity: pending.quantity, label: `Set ${productName(pending.productId)} quantity to ${pending.quantity}` };
    return { ...response(pending.operation === "remove" ? "remove_from_cart" : "update_quantity", `${action.label}.`, state), actions: [action] };
  }

  private async recommend(
    request: NoriChatRequest,
    state: NoriConversationState,
    intent: NoriIntent,
    interpretation = interpretNoriRequest(request.message, state),
  ): Promise<NoriChatResponse> {
    logInterpretation(interpretation);
    if (interpretation.clarificationNeeded) {
      return response(
        intent,
        buildClarificationResponse(
          interpretation.clarificationQuestion ?? "Could you clarify what kind of meal you prefer?",
          state.preferredLanguage,
        ),
        state,
      );
    }
    const calls = buildRecommendationToolCalls(request.message, state, interpretation);
    if (this.provider) {
      try {
        console.log(`[NORI] Planning source: ${this.provider.constructor.name}`);
        const context = { request: { ...request, conversationState: state }, systemPrompt: this.provider.buildPrompt(request) };
        const providerCalls = await this.provider.callTools(context);
        providerCalls.forEach(validateNoriToolCall);
      } catch (error) {
        console.log("[NORI] Planning source: deterministic fallback");
        console.warn("Nori provider planning failed; using deterministic agent plan.", error);
      }
    } else {
      console.log("[NORI] Planning source: deterministic fallback");
    }
    const resultSets = calls.map(call => productsFromToolResult(executeNoriTool(validateNoriToolCall(call))));
    let candidates = intersectResults(resultSets);
    if (candidates.length === 0) candidates = unionResults(resultSets);
    const independentQuery = isIndependentMenuQuery(request.message);
    const previousSelection = (!independentQuery || hasSelectionReference(request.message)) && state.selectedProductId
      ? noriMenuProducts.find(product => product.id === state.selectedProductId)
      : undefined;
    if (previousSelection && productMatchesState(previousSelection, state, request.message)) {
      candidates = unionResults([[previousSelection], candidates]);
    }
    const validation = validateRecommendations(candidates, interpretation);
    const nutrition = interpretation.constraints;
    if (nutrition.minFiber !== null) validation.valid.sort((a, b) => b.nutrition.fiberGrams - a.nutrition.fiberGrams);
    else if (nutrition.maxSugars !== null) validation.valid.sort((a, b) => a.nutrition.sugarsGrams - b.nutrition.sugarsGrams);
    else if (nutrition.maxFat !== null) validation.valid.sort((a, b) => a.nutrition.totalFatGrams - b.nutrition.totalFatGrams);
    candidates = independentQuery
      ? prioritizeFreshRecommendations(
        validation.valid,
        state.recentlyRecommendedProductIds,
      )
      : validation.valid;
    if (!independentQuery && previousSelection
      && candidates.some(product => product.id === previousSelection.id)) {
      candidates = [
        previousSelection,
        ...candidates.filter(product => product.id !== previousSelection.id),
      ];
    }
    logValidation(candidates.length + validation.rejected.length, validation);

    const riskLevels = candidates.map(product => ({ product, check: checkProductAllergens(product, state.activeAllergens) }));
    const safe = riskLevels.filter(item => item.check.contains.length === 0 && item.check.mayContain.length === 0 && item.check.crossContact.length === 0);
    const noContains = riskLevels.filter(item => item.check.contains.length === 0);
    let selected = (interpretation.constraints.kids && state.activeAllergens.length ? safe : (safe.length ? safe : noContains)).slice(0, 3).map(item => item.product);
    if (interpretation.constraints.partySize === 2 && interpretation.constraints.maxBudget !== null) {
      const pool = (safe.length ? safe : noContains).map(item => item.product);
      const pair = pool.flatMap((first, index) => pool.slice(index).map(second => [first, second] as const))
        .filter(([first, second]) => first.price + second.price <= interpretation.constraints.maxBudget!)
        .sort((a, b) => (b[0].recommendationScore + b[1].recommendationScore) - (a[0].recommendationScore + a[1].recommendationScore))[0];
      selected = pair ? [...pair] : [];
    }
    const main = selected.find(product => !isDrink(product)) ?? selected[0];
    const proposedDrink = wantsExplicitPairing(request.message) ? chooseDrink(main, selected, state) : undefined;
    const explicitNumericConstraint = /\d+(?:\.\d+)?\s*g(?:rams?)?\s*(?:of\s*)?(?:protein|fat|sugar|fiber|carb)|\d+(?:\.\d+)?\s*(?:calories|cal)\b/i.test(request.message);
    const drink = proposedDrink && (!explicitNumericConstraint || validateRecommendations([proposedDrink], interpretation).valid.length) ? proposedDrink : undefined;
    const recommendations = drink && !selected.some(product => product.id === drink.id) ? [main, drink, ...selected.filter(product => product.id !== main.id)].slice(0, 3) : selected;
    const warnings = warningsFor(recommendations, state.activeAllergens);
    state.recentlyRecommendedProductIds = [
      ...new Set([
        ...state.recentlyRecommendedProductIds,
        ...recommendations.map(product => product.id),
      ]),
    ].slice(-12);
    if (recommendations.length) setRecentContext(
      state,
      interpretation.constraints.kids ? "kids" : interpretation.constraints.minProtein !== null ? "high_protein" : interpretation.constraints.maxBudget !== null ? "budget" : "recommendation",
      recommendations,
      interpretation.constraints.categories[0],
    );
    if (main) {
      if (state.selectedProductId !== main.id) state.selectedCustomizations = [];
      state.selectedProductId = main.id;
      state.currentRecommendation = {
        primaryProductId: main.id,
        companionProductIds: drink ? [drink.id] : [],
        totalPrice: main.price + (drink?.price ?? 0),
        reason: "Matches the active menu constraints and recommendation ranking.",
      };
    } else {
      state.currentRecommendation = null;
    }

    const replyProducts = drink
      ? recommendations.filter(product => product.id !== drink.id)
      : recommendations;
    const reply = recommendations.length ? buildRecommendationResponse({
      products: replyProducts,
      interpretation,
      language: state.preferredLanguage,
      companion: drink,
      warnings,
      noMatchReason: validation.rejected[0]?.reasons[0],
    }) : interpretation.constraints.kids && state.activeAllergens.length
      ? `I could not find a kids meal without documented ${state.activeAllergens.join(" or ")} allergen or cross-contact risk. Would you like to review non-kids options or ask staff about cross-contact?`
      : informativeNoMatch(interpretation, validation.rejected);
    return {
      intent,
      reply,
      recommendedProducts: recommendations,
      actions: recommendationActions(recommendations, warnings),
      warnings,
      conversationState: state,
    };
  }

  private customizationAnswer(message: string, product: AIFoodItem | undefined, state: NoriConversationState): NoriChatResponse {
    if (!product) {
      state.pendingAction = createPendingAction({ type: "clarify_product", topic: "customization" });
      return response("customization_question", "Which product would you like to customize?", state);
    }
    const matched = interpretCustomization(product, message);
    const removesBaseCheese = /\b(remove|without|no)\s+(?:the\s+)?(?:base\s+)?cheese\b/.test(normalize(message)) && !/\b(no extra|remove extra)\s+cheese\b/.test(normalize(message));
    const terms = customizationTerms(message);
    const removable = product.removableIngredients.find(ingredient => terms.some(term => normalize(ingredient).includes(term)));
    const documentedCustomization = product.customizations.find(item => terms.some(term => normalize(item).includes(term)));
    const ingredient = product.ingredients.find(item => terms.some(term => normalize(item).includes(term)));
    if (removesBaseCheese && !matched && !removable) {
      return response("customization_question", `Removing the base cheese is not listed as a documented customization for ${product.name}.`, state);
    }
    if (!matched && !removable && !documentedCustomization) {
      const suffix = ingredient ? ` ${ingredient} is an ingredient, but the menu does not document it as removable.` : "";
      return response("customization_question", `${product.name} does not list that customization as available.${suffix}`, state);
    }
    state.pendingAction = null;
    if (matched) {
      const customization = matched.selection;
      state.pendingAction = createPendingAction({ type: "apply_customization", customization });
      const calculation = calculateCustomizedProduct(product, [customization]);
      return {
        ...response(
          "customization_question",
          buildCustomizationResponse(
            product,
            customization,
            calculation,
            state.preferredLanguage,
          ),
          state,
        ),
        actions: [{ type: "APPLY_CUSTOMIZATION", productId: product.id, groupId: customization.groupId, optionId: customization.optionId, label: `Apply ${customization.optionName}` }],
      };
    }
    if (removesBaseCheese && removable) return response("customization_question", `Yes. Removing ${removable} is documented for ${product.name}. No numeric nutrition adjustment is documented. Cross-contact risks remain, so removal does not make it allergy-safe.`, state);
    return response("customization_question", `Yes, ${removable ?? documentedCustomization} is listed as an available customization for ${product.name}. The menu database does not provide a numeric price or nutrition adjustment for it. Cross-contact risks remain, so removal does not make it allergy-safe.`, state);
  }

  private comparisonAnswer(message: string, state: NoriConversationState, intent: NoriIntent = "product_comparison"): NoriChatResponse {
    const text = normalize(message);
    const comparisonIds = state.comparisonContext?.productIds;
    if (intent === "comparison_follow_up" && !comparisonIds) return response(intent, "Please compare two products first, or tell me which two products you mean.", state);
    let products = (comparisonIds && intent === "comparison_follow_up")
      ? comparisonIds.flatMap(id => noriMenuProducts.find(item => item.id === id) ?? [])
      : searchProducts(message).slice(0, 2);
    if (products.length < 2 && /\b(first two|first and second)\b/.test(text)) products = productsFromComparisonSource(state).slice(0, 2);
    if (products.length < 2 && /\bfirst and third\b/.test(text)) {
      const recent = productsFromComparisonSource(state);
      products = [recent[0], recent[2]].filter((item): item is AIFoodItem => Boolean(item));
    }
    if (products.length < 2 && /two best burgers/.test(text)) products = noriMenuProducts.filter(item => item.category === "burger").sort(scoreSort).slice(0, 2);
    if (products.length < 2) return response(intent, "Which two burgers or menu items would you like to compare?", state);
    const [first, second] = products;
    state.selectedProductId = first.id;
    state.lastComparedProductIds = products.map(item => item.id);
    state.comparisonContext = { productIds: [first.id, second.id], createdAt: Date.now() };
    setRecentContext(state, "comparison", [first, second]);
    console.log("[NORI][COMPARISON]", { productIds: [first.id, second.id], followUp: intent === "comparison_follow_up" });
    if (/more protein/.test(text)) return response(intent, `${first.proteinGrams >= second.proteinGrams ? first.name : second.name} has more protein (${Math.max(first.proteinGrams, second.proteinGrams)}g versus ${Math.min(first.proteinGrams, second.proteinGrams)}g).`, state, products);
    if (/cheaper/.test(text)) return response(intent, `${first.price <= second.price ? first.name : second.name} is cheaper ($${Math.min(first.price, second.price).toFixed(2)} versus $${Math.max(first.price, second.price).toFixed(2)}).`, state, products);
    if (/fewer calories/.test(text)) return response(intent, `${first.cal <= second.cal ? first.name : second.name} has fewer calories (${Math.min(first.cal, second.cal)} versus ${Math.max(first.cal, second.cal)}).`, state, products);
    if (/less fat/.test(text)) return response(intent, `${first.nutrition.totalFatGrams <= second.nutrition.totalFatGrams ? first.name : second.name} has less total fat (${Math.min(first.nutrition.totalFatGrams, second.nutrition.totalFatGrams)}g versus ${Math.max(first.nutrition.totalFatGrams, second.nutrition.totalFatGrams)}g).`, state, products);
    if (/less sodium/.test(text)) return response(intent, `${first.nutrition.sodiumMilligrams <= second.nutrition.sodiumMilligrams ? first.name : second.name} has less sodium (${Math.min(first.nutrition.sodiumMilligrams, second.nutrition.sodiumMilligrams)}mg versus ${Math.max(first.nutrition.sodiumMilligrams, second.nutrition.sodiumMilligrams)}mg).`, state, products);
    if (/better for (?:the )?gym/.test(text)) {
      const winner = first.proteinGrams === second.proteinGrams ? (fitnessScore(first) >= fitnessScore(second) ? first : second) : (first.proteinGrams > second.proteinGrams ? first : second);
      const other = winner.id === first.id ? second : first;
      return response(intent, `For a gym-focused choice, ${winner.name} is the better fit because it has ${winner.proteinGrams}g protein compared with ${other.proteinGrams}g. This is a nutrition comparison, not a performance guarantee.`, state, products);
    }
    if (/healthier|recommend/.test(text)) return response(intent, `${healthyScore(first) >= healthyScore(second) ? first.name : second.name} ranks as the healthier documented option based on calories, protein, fiber, fat, sodium, and sugar.`, state, products);
    return {
      ...response(intent, `${first.name} costs $${first.price.toFixed(2)} and has ${first.cal} calories, ${first.proteinGrams}g protein, ${first.nutrition.totalFatGrams}g fat, ${first.nutrition.fiberGrams}g fiber, ${first.nutrition.sugarsGrams}g sugar, and ${first.nutrition.sodiumMilligrams}mg sodium. ${second.name} costs $${second.price.toFixed(2)} and has ${second.cal} calories, ${second.proteinGrams}g protein, ${second.nutrition.totalFatGrams}g fat, ${second.nutrition.fiberGrams}g fiber, ${second.nutrition.sugarsGrams}g sugar, and ${second.nutrition.sodiumMilligrams}mg sodium.`, state),
      recommendedProducts: products,
      warnings: warningsFor(products, state.activeAllergens),
    };
  }

  private productDetails(product: AIFoodItem | undefined, state: NoriConversationState): NoriChatResponse {
    if (!product) return response("product_details", "Which product would you like details about?", state);
    return { ...response("product_details", `${product.name}: ${product.description}. It costs $${product.price.toFixed(2)} and has ${product.cal} calories with ${product.proteinGrams}g protein.`, state), recommendedProducts: [product], warnings: warningsFor([product], state.activeAllergens) };
  }

  private async nutritionAnswer(message: string, product: AIFoodItem | undefined, state: NoriConversationState): Promise<NoriChatResponse> {
    const text = normalize(message);
    if (/\b(i'm|i am|im) diabetic\b/.test(text)) return response("nutrition_question", "I can compare documented sugars, carbohydrates, calories, and fiber, but I cannot determine whether a meal is medically suitable for diabetes. Which of those values would you like to prioritize?", state);
    if (/\btrying to lose weight\b/.test(text)) return response("nutrition_question", "I can compare documented calories, protein, and fiber without making a medical suitability claim. Would you prefer a calorie limit or simply lower-calorie choices?", state);
    if (/\b(high fiber|low (?:in )?sugar|less than .*fat|under .*fat)\b/.test(text)) {
      const interpretation = interpretNoriRequest(message, state);
      const validation = validateRecommendations(noriMenuProducts, interpretation);
      const field = interpretation.constraints.minFiber !== null ? "fiber" : interpretation.constraints.maxSugars !== null ? "sugar" : "fat";
      validation.valid.sort((a, b) => field === "fiber" ? b.nutrition.fiberGrams - a.nutrition.fiberGrams : field === "sugar" ? a.nutrition.sugarsGrams - b.nutrition.sugarsGrams : a.nutrition.totalFatGrams - b.nutrition.totalFatGrams);
      const products = validation.valid.slice(0, 3);
      if (!products.length) return response("nutrition_question", "No documented item matches all of those conditions.", state);
      const value = (item: AIFoodItem) => field === "fiber" ? item.nutrition.fiberGrams : field === "sugar" ? item.nutrition.sugarsGrams : item.nutrition.totalFatGrams;
      return response("nutrition_question", products.map(item => `${item.name} has ${value(item)}g of ${field}.`).join(" "), state, products);
    }
    if (!product) return this.recommend({ message, cart: [], activeAllergens: state.activeAllergens, language: state.preferredLanguage, conversationState: state }, state, "nutrition_question");
    return response("nutrition_question", `${product.name} has ${product.cal} calories and ${product.proteinGrams}g protein per standard serving.`, state, [product]);
  }

  private allergenAnswer(product: AIFoodItem | undefined, state: NoriConversationState): NoriChatResponse {
    if (!product) return response("allergen_check", `I saved your active allergens: ${state.activeAllergens.join(", ") || "none"}. Name a product and I’ll check contains, may-contain, and cross-contact risks.`, state);
    const warnings = warningsFor([product], state.activeAllergens);
    return {
      ...response(
        "allergen_check",
        buildAllergyResponse(
          product,
          checkProductAllergens(product, state.activeAllergens),
          state.preferredLanguage,
        ),
        state,
        [product],
      ),
      warnings,
    };
  }

  private cartSummary(intent: NoriIntent, request: NoriChatRequest, state: NoriConversationState, checkout: boolean): NoriChatResponse {
    const lines = request.cart.flatMap(item => {
      const product = noriMenuProducts.find(candidate => candidate.id === item.productId);
      if (!product) return [];
      const selections = selectionsFromCart(product, item.customizations);
      const calculation = calculateCustomizedProduct(product, selections);
      return [{
        product,
        selections,
        quantity: item.quantity,
        unitPrice: calculation.adjustedPrice,
        lineTotal: calculation.adjustedPrice * item.quantity,
        warnings: warningsFor([product], state.activeAllergens),
      }];
    });
    if (!lines.length) return response(intent, checkout ? "Your cart is empty. Add at least one item before checkout." : "Your cart is empty.", state);
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const tax = subtotal * restaurantAIConfig.defaultTaxRate;
    const total = subtotal + tax;
    if (checkout) state.pendingAction = createPendingAction({ type: "confirm_checkout" });
    return {
      ...response(
        intent,
        buildCheckoutResponse({
          lines: lines.map(line => ({
            product: line.product,
            quantity: line.quantity,
            customizationNames: line.selections.map(item => item.optionName),
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
            warnings: line.warnings,
          })),
          subtotal,
          tax,
          total,
          language: state.preferredLanguage,
          confirmation: checkout,
        }),
        state,
      ),
      actions: checkout ? [{ type: "CONFIRM_CHECKOUT", label: "Confirm and open checkout" }] : [{ type: "OPEN_CART", label: "Open cart" }],
    };
  }

  private comparativeAdd(message: string, state: NoriConversationState): NoriChatResponse {
    const ids = state.comparisonContext?.productIds;
    if (!ids) return response("comparative_add", "I need two compared products before I can choose the healthier one. Please compare two products first.", state);
    const products = ids.flatMap(id => noriMenuProducts.find(product => product.id === id) ?? []);
    if (products.length !== 2) return response("comparative_add", "I need two compared products before I can choose the healthier one. Please compare two products first.", state);
    const [first, second] = products;
    const text = normalize(message);
    const winner = /higher[ -]protein/.test(text) ? (first.proteinGrams >= second.proteinGrams ? first : second)
      : /lower[ -]calorie/.test(text) ? (first.cal <= second.cal ? first : second)
        : /cheaper/.test(text) ? (first.price <= second.price ? first : second)
          : /better (?:one )?for (?:the )?gym/.test(text)
            ? (first.proteinGrams === second.proteinGrams ? (fitnessScore(first) >= fitnessScore(second) ? first : second) : (first.proteinGrams > second.proteinGrams ? first : second))
            : (healthyScore(first) >= healthyScore(second) ? first : second);
    state.selectedProductId = winner.id;
    return this.cartAction("add_to_cart", message, winner, state, "add");
  }

  private cartTotal(request: NoriChatRequest, state: NoriConversationState): NoriChatResponse {
    if (!request.cart.length) return response("cart_total", "Your cart is empty.", state);
    const subtotal = request.cart.reduce((sum, item) => sum + item.quantity * (item.unitPrice ?? 0), 0);
    const tax = subtotal * restaurantAIConfig.defaultTaxRate;
    const total = subtotal + tax;
    return response(
      "cart_total",
      `Your subtotal is $${subtotal.toFixed(2)}, estimated tax is $${tax.toFixed(2)}, and total is $${total.toFixed(2)}.`,
      state,
    );
  }

  private orderReview(request: NoriChatRequest, state: NoriConversationState): NoriChatResponse {
    if (!request.cart.length) return response("review_order", "Your cart is empty. Add an item before reviewing your order.", state);
    const lines = request.cart.map(item => {
      const product = noriMenuProducts.find(candidate => candidate.id === item.productId);
      const name = item.name ?? product?.name ?? item.productId;
      const unitPrice = item.unitPrice ?? product?.price ?? 0;
      const customizations = Object.values(item.customizations ?? {});
      return { item, product, name, unitPrice, lineTotal: unitPrice * item.quantity, customizations };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const tax = subtotal * restaurantAIConfig.defaultTaxRate;
    const details = lines.map(line => `${line.item.quantity} ${line.name}${line.customizations.length ? ` with ${line.customizations.join(", ")}` : ""}: $${line.lineTotal.toFixed(2)}.`).join(" ");
    const warnings = warningsFor(lines.flatMap(line => line.product ?? []), state.activeAllergens);
    const warningText = warnings.length ? ` ${formatWarnings(warnings)}` : "";
    return { ...response("review_order", `${details} Subtotal: $${subtotal.toFixed(2)}. Estimated tax: $${tax.toFixed(2)}. Total: $${(subtotal + tax).toFixed(2)}.${warningText}`, state), warnings };
  }

  private healthyRecommendation(_message: string, state: NoriConversationState): NoriChatResponse {
    const eligible = recommendationPool(state).filter(product => product.category !== "kids_meal" && !["dessert", "hot_drink", "cold_drink"].includes(product.category));
    const products = eligible.sort((a, b) => healthyScore(b) - healthyScore(a)).slice(0, 3);
    console.log("[NORI][CONTEXT_RESOLUTION]", { intent: "healthy_recommendation", recentRecommendationContext: state.recentRecommendationContext, ignoredStaleContext: true });
    if (!products.length) return response("healthy_recommendation", specificNoMatch("healthy option", state, noriMenuProducts), state);
    setRecentContext(state, "healthy", products);
    const [first, ...others] = products;
    state.selectedProductId = first.id;
    state.currentRecommendation = { primaryProductId: first.id, companionProductIds: [], reason: "Highest deterministic healthy score." };
    const reply = `A strong healthy option is ${first.name} at $${first.price.toFixed(2)} with ${first.cal} calories, ${first.proteinGrams}g protein, and ${first.nutrition.fiberGrams}g fiber.${others.length ? ` Other balanced options are ${others.map(item => `${item.name} (${item.cal} calories, ${item.proteinGrams}g protein)`).join(" and ")}.` : ""}`;
    return { ...response("healthy_recommendation", reply, state, products), warnings: warningsFor(products, state.activeAllergens) };
  }

  private nutritionSuperlative(message: string, state: NoriConversationState, intent: NoriIntent): NoriChatResponse {
    const category = explicitCategory(message);
    let products = recommendationPool(state).filter(product => !category || product.category === category || (category === "meal" && !isSecondary(product)) || (category === "drink" && isDrink(product)));
    const field = intent === "highest_protein" ? "proteinGrams" : intent === "lowest_calories" ? "calories" : intent === "lowest_fat" ? "totalFatGrams" : intent === "lowest_sugar" ? "sugarsGrams" : intent === "lowest_sodium" ? "sodiumMilligrams" : "fiberGrams";
    const value = (product: AIFoodItem) => field === "proteinGrams" ? product.proteinGrams : product.nutrition[field];
    const descending = intent === "highest_protein" || intent === "highest_fiber";
    products.sort((a, b) => descending ? value(b) - value(a) : value(a) - value(b));
    const winner = products[0];
    console.log("[NORI][NUTRITION_SUPERLATIVE]", { intent, category, winner: winner?.id, value: winner ? value(winner) : null });
    if (!winner) return response(intent, specificNoMatch(category ?? "menu item", state, noriMenuProducts), state);
    const unit = field === "calories" ? "calories" : field === "sodiumMilligrams" ? "mg sodium" : `g ${field === "proteinGrams" ? "protein" : field === "totalFatGrams" ? "fat" : field === "sugarsGrams" ? "sugar" : "fiber"}`;
    const label = intent === "highest_protein" ? "highest-protein" : intent === "lowest_calories" ? "lowest-calorie" : intent.replace(/_/g, "-");
    setRecentContext(state, intent === "lowest_calories" ? "lowest_calories" : intent === "highest_protein" ? "high_protein" : "recommendation", [winner], category ?? undefined);
    state.selectedProductId = winner.id;
    state.currentRecommendation = { primaryProductId: winner.id, companionProductIds: [], reason: `${intent} deterministic ranking.` };
    return { ...response(intent, `The ${label} available ${category ?? "item"} is ${winner.name} with ${value(winner)} ${unit} per standard serving.`, state, [winner]), warnings: warningsFor([winner], state.activeAllergens) };
  }

  private bundleRecommendation(message: string, state: NoriConversationState): NoriChatResponse {
    const text = normalize(message);
    const maxBudget = Number(text.match(/\$\s*(\d+(?:\.\d+)?)/)?.[1] ?? state.maxBudget ?? Number.POSITIVE_INFINITY);
    const subtotalLimit = state.afterTaxBudget ? maxBudget / (1 + restaurantAIConfig.defaultTaxRate) : maxBudget;
    const pool = recommendationPool(state);
    const foods = pool.filter(product => !isSecondary(product));
    const requestedTemperature = /\bcold drink\b/.test(text) ? "cold_drink" : /\b(hot drink|coffee)\b/.test(text) ? "hot_drink" : null;
    const drinks = pool.filter(product => isDrink(product) && (!requestedTemperature || product.category === requestedTemperature));
    const pairs = foods.flatMap(food => drinks.map(drink => ({ food, drink, totalPrice: food.price + drink.price })))
      .filter(pair => pair.totalPrice <= subtotalLimit)
      .sort((a, b) => (healthyScore(b.food) + b.drink.recommendationScore) - (healthyScore(a.food) + a.drink.recommendationScore));
    console.log("[NORI][BUNDLE_CANDIDATES]", { count: pairs.length, top: pairs.slice(0, 10).map(pair => ({ food: pair.food.id, drink: pair.drink.id, totalPrice: pair.totalPrice })) });
    const pair = pairs[0];
    if (!pair) return response("bundle_recommendation", `No documented food-and-drink pair fits the active constraints${Number.isFinite(maxBudget) ? ` within $${maxBudget.toFixed(2)}` : ""}. Would you like to raise the budget or change the drink preference?`, state);
    const products = [pair.food, pair.drink];
    state.currentRecommendation = { primaryProductId: pair.food.id, companionProductIds: [pair.drink.id], totalPrice: pair.totalPrice, reason: "Valid food-and-drink bundle." };
    state.selectedProductId = pair.food.id;
    const bundleContext: NoriRecentRecommendationContext = { contextId: createActionId("context", "bundle"), createdAt: Date.now(), queryType: "bundle", productIds: products.map(item => item.id), pairs: pairs.slice(0, 3).map(item => ({ foodProductId: item.food.id, drinkProductId: item.drink.id, totalPrice: item.totalPrice })) };
    state.recentRecommendationContext = bundleContext;
    state.lastMultiOptionContext = bundleContext;
    return { ...response("bundle_recommendation", `The best match within your ${Number.isFinite(maxBudget) ? `$${maxBudget.toFixed(2)} budget` : "request"} is ${pair.food.name} for $${pair.food.price.toFixed(2)} with ${pair.drink.name} for $${pair.drink.price.toFixed(2)}, totaling $${pair.totalPrice.toFixed(2)} before tax.`, state, products), warnings: warningsFor(products, state.activeAllergens) };
  }

  private selectBundlePair(message: string, state: NoriConversationState): NoriChatResponse {
    const pairs = state.recentRecommendationContext?.pairs ?? [];
    const index = /\bsecond\b/.test(normalize(message)) ? 1 : /\bthird\b/.test(normalize(message)) ? 2 : 0;
    const pair = pairs[index];
    if (!pair) return response("product_details", "Which documented bundle pair would you like?", state);
    state.currentRecommendation = { primaryProductId: pair.foodProductId, companionProductIds: [pair.drinkProductId], totalPrice: pair.totalPrice, reason: "Selected recent bundle pair." };
    state.selectedProductId = pair.foodProductId;
    const products = [pair.foodProductId, pair.drinkProductId].flatMap(id => noriMenuProducts.find(product => product.id === id) ?? []);
    return response("product_details", `Selected ${productName(pair.foodProductId)} with ${productName(pair.drinkProductId)} for $${pair.totalPrice.toFixed(2)}.`, state, products);
  }

  private undoLastMutation(state: NoriConversationState): NoriChatResponse {
    const latest = state.latestSuccessfulMutation;
    if (!latest || latest.type !== "add_to_cart") return response("undo", "There is no supported cart change available to undo.", state);
    const action: NoriAction = {
      type: "remove_from_cart", actionId: createActionId("undo-add", latest.productId),
      productId: latest.productId, quantity: latest.quantity, customizations: latest.customizations,
      adjustedUnitPrice: adjustedProductPrice(latest.productId, latest.customizations),
      label: `Undo adding ${productName(latest.productId)}`,
    };
    state.latestSuccessfulMutation = null;
    return { ...response("undo", `Please confirm undoing the last addition of ${productName(latest.productId)}.`, state), actions: [action] };
  }

  private cartAction(intent: NoriIntent, message: string, product: AIFoodItem | undefined, state: NoriConversationState, operation: "add" | "remove" | "update"): NoriChatResponse {
    if (!product) return response(intent, "Which product should I update in the cart?", state);
    const quantity = Math.max(1, Number(message.match(/\b(\d+)\b/)?.[1] ?? 1));
    if (operation === "add" && wantsFullRecommendation(normalize(message)) && state.currentRecommendation?.companionProductIds.length) {
      const productIds = [state.currentRecommendation.primaryProductId, ...state.currentRecommendation.companionProductIds];
      state.pendingAction = createPendingAction({ type: "confirm_bundle", productIds, quantity });
      return response(intent, `Please confirm adding ${productNames(productIds).join(" and ")}.`, state);
    }
    if (operation === "add" && isAmbiguousAddReference(message) && state.currentRecommendation?.companionProductIds.length) {
      const companionIds = state.currentRecommendation.companionProductIds;
      const pairTotal = [product.id, ...companionIds].reduce((total, productId) => total + adjustedProductPrice(productId, customizationsFor(state, productId)), 0);
      state.pendingAction = createPendingAction({
        type: "clarify_recommendation",
        primaryProductId: product.id,
        companionProductIds: companionIds,
        quantity,
      });
      return response(
        intent,
        `Would you like to add only the ${product.name}, or the ${product.name} with ${productNames(companionIds).join(" and ")} for $${pairTotal.toFixed(2)}?`,
        state,
        [product, ...companionIds.flatMap(id => noriMenuProducts.find(item => item.id === id) ?? [])],
      );
    }
    const customizations = customizationsFor(state, product.id);
    const calculation = calculateCustomizedProduct(product, customizations);
    state.pendingAction = createPendingAction({
      type: "confirm_cart_change", operation, productId: product.id, productName: product.name,
      quantity, customizations, basePrice: product.price, unitPrice: calculation.adjustedPrice,
      adjustedNutrition: calculation.adjustedNutrition, adjustedAllergens: calculation.adjustedAllergens,
    });
    const action: NoriAction = operation === "add"
      ? addAction(product.id, quantity, customizations)
      : operation === "remove"
        ? { type: "REMOVE_PRODUCT", productId: product.id, label: `Remove ${product.name}` }
        : { type: "UPDATE_QUANTITY", productId: product.id, quantity, label: `Set ${product.name} quantity to ${quantity}` };
    const reply = operation === "add"
      ? buildCartConfirmationResponse({
        product,
        quantity,
        customizations,
        adjustedUnitPrice: calculation.adjustedPrice,
        adjustedNutrition: calculation.adjustedNutrition,
        language: state.preferredLanguage,
      })
      : `Please confirm: ${action.label}.`;
    return response(intent, reply, state, [product]);
  }
}

export function createState(request: NoriChatRequest): NoriConversationState {
  const previous = request.conversationState;
  return {
    preferredLanguage: request.language || previous?.preferredLanguage || "en",
    activeAllergens: [...new Set([...(previous?.activeAllergens ?? []), ...request.activeAllergens])],
    maxBudget: previous?.maxBudget ?? null,
    minProtein: previous?.minProtein ?? null,
    maxCalories: previous?.maxCalories ?? null,
    dietaryPreferences: previous?.dietaryPreferences ?? [],
    persistentDietaryPreferences: previous?.persistentDietaryPreferences ?? [],
    requestedCategory: previous?.requestedCategory ?? null,
    requestedDrink: previous?.requestedDrink ?? false,
    requestedSpicy: previous?.requestedSpicy ?? false,
    requestedKids: previous?.requestedKids ?? false,
    requestedDessert: previous?.requestedDessert ?? false,
    selectedProductId: previous?.selectedProductId ?? null,
    selectedCustomizations: previous?.selectedCustomizations ?? [],
    currentRecommendation: previous?.currentRecommendation ?? null,
    selectedCartItemId: previous?.selectedCartItemId ?? null,
    latestAddedCartItemId: previous?.latestAddedCartItemId ?? null,
    latestSuccessfulMutation: previous?.latestSuccessfulMutation ?? null,
    executedActionIds: previous?.executedActionIds ?? [],
    recentlyRecommendedProductIds: previous?.recentlyRecommendedProductIds ?? [],
    pendingAction: clonePendingAction(previous?.pendingAction ?? null),
    pendingActionHistory: (previous?.pendingActionHistory ?? []).map(item => clonePendingAction(item)!),
    recentRecommendationContext: previous?.recentRecommendationContext ?? null,
    lastMultiOptionContext: previous?.lastMultiOptionContext ?? null,
    comparisonContext: previous?.comparisonContext ?? null,
    excludedIngredients: previous?.excludedIngredients ?? [],
    awaitingConstraintClarification: previous?.awaitingConstraintClarification ?? false,
    clarificationState: previous?.clarificationState ?? null,
    afterTaxBudget: previous?.afterTaxBudget ?? false,
  };
}

export function detectIntent(message: string, state: NoriConversationState): NoriIntent {
  return routeNoriIntent(message, state).intent;
  /* c8 ignore start -- compatibility implementation retained below */
  const text = normalize(message);
  if (/^(hi|hello|hey|مرحبا|merhaba)\b/.test(text)) return "greeting";
  if (/\b(help|what can you do|مساعدة)\b/.test(text)) return "help";
  if (/\b(checkout|proceed|pay now|الدفع)\b/.test(text)) return "checkout";
  if (/\b(payment methods?|how can i pay)\b/.test(text)) return "payment_methods";
  if (/^(undo|undo that|undo last addition|revert the last change)\b/.test(text)) return "undo";
  if (/\b(clear|empty).{0,12}\bcart\b/.test(text)) return "clear_cart";
  if (/\b(remove|delete).{0,20}\bcart\b|\bfrom (?:my )?cart\b/.test(text)) return "remove_from_cart";
  if (/\b(quantity|change to|make it|set).{0,8}\d+\b/.test(text)) return "update_quantity";
  if (/\b(add|put).{0,20}\bcart\b|\badd\b/.test(text)) return "add_to_cart";
  if (/\b(show|view|what is in).{0,12}\bcart\b|\bmy cart\b/.test(text)) return "show_cart";
  if (/\b(remove|without|no|extra|double|customi[sz]e|can i change)\b/.test(text)) return "customization_question";
  if (/\b(compare|difference|versus| vs )\b/.test(text)) return "product_comparison";
  if (/\b(select|choose|pick) (?:the )?(?:first|1st) (?:option|one|item)\b/.test(text)) return "product_details";
  if (/\b(allerg|contains|gluten|milk|dairy|peanut|sesame|soy|wheat|nuts)\b/.test(text)) return "allergen_check";
  if (/\b(best|recommend|suggest|healthy|vegan|vegetarian|plant based|kids?|child|spicy|desserts?|high protein|high-protein|budget|under \$?|with a drink|after the gym|post workout|light|fresh|filling|handheld|with my hands|warm to drink|something sweet|anything fried|eat meat|inside a bun)\b/.test(text)) return "recommendation";
  if (/\b(calorie|protein|nutrition|fat|carb|sodium)\b/.test(text) && state.selectedProductId) return "nutrition_question";
  if (/\b(details?|ingredient|what is in|tell me about)\b/.test(text)) return "product_details";
  if (state.maxBudget !== null || state.minProtein !== null || state.dietaryPreferences.length) return "recommendation";
  if (searchProducts(message).length) return "menu_search";
  return "unknown";
  /* c8 ignore stop */
}

function updateState(state: NoriConversationState, message: string): NoriConversationState {
  const text = normalize(message);
  const budget = text.match(/(?:have|budget|with)\s*\$?\s*(\d+(?:\.\d+)?)/)
    ?? text.match(/(?:under|up to|max)\s*\$\s*(\d+(?:\.\d+)?)/)
    ?? text.match(/(\d+(?:\.\d+)?)\s*dollars?\b/)
    ?? text.match(/\$(\d+(?:\.\d+)?)/);
  if (budget) state.maxBudget = Number(budget[1]);
  const protein = text.match(/(?:at least|over|above|more than)?\s*(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:of\s*)?protein/);
  if (protein) state.minProtein = Number(protein[1]);
  else if (text.includes("high protein") || text.includes("high-protein")) state.minProtein = state.minProtein ?? 20;
  const calories = text.match(/(?:under|max|below)\s*(\d+(?:\.\d+)?)\s*cal/);
  if (calories) state.maxCalories = Number(calories[1]);
  for (const preference of ["vegan", "vegetarian", "halal"]) if (text.includes(preference) && !state.dietaryPreferences.includes(preference)) state.dietaryPreferences.push(preference);
  for (const allergen of noriSupportedAllergens) if (text.includes(normalize(allergen)) && !state.activeAllergens.some(item => normalize(item) === normalize(allergen))) state.activeAllergens.push(allergen);
  if (text.includes("dairy") && !state.activeAllergens.some(item => normalize(item) === "milk")) state.activeAllergens.push("Milk");
  const category = CATEGORY_NAMES.find(item => text.includes(normalize(item)));
  if (category) state.requestedCategory = category;
  if (/\b(drink|beverage|water|juice|coffee|latte)\b/.test(text)) state.requestedDrink = true;
  return state;
}

export function buildRecommendationToolCalls(
  message: string,
  state: NoriConversationState,
  interpretation = interpretNoriRequest(message, state),
): AIToolCall[] {
  const structured = interpretation.constraints;
  const calls: AIToolCall[] = [{
    name: "recommendProducts",
    arguments: {
      query: structured.preferredIngredients.length ? structured.preferredIngredients.join(" ") : undefined,
      maxPrice: state.maxBudget ?? undefined,
      minProtein: state.minProtein ?? undefined,
      maxCalories: state.maxCalories ?? undefined,
      dietaryTags: state.dietaryPreferences,
      category: structured.categories.length === 1 ? structured.categories[0] : undefined,
      spicy: structured.spicy || undefined,
      kids: structured.kids || undefined,
      limit: 8,
    },
  }];
  if (state.maxBudget !== null) calls.push({ name: "findByBudget", arguments: { maxPrice: state.maxBudget } });
  if (state.minProtein !== null) calls.push({ name: "findHighProtein", arguments: { minProtein: state.minProtein } });
  if (state.maxCalories !== null) calls.push({ name: "findHealthyMeals", arguments: { maxCalories: state.maxCalories } });
  if (state.dietaryPreferences.includes("vegan")) calls.push({ name: "findVeganMeals", arguments: {} });
  else if (state.dietaryPreferences.includes("vegetarian")) calls.push({ name: "findVegetarianMeals", arguments: {} });
  if (state.requestedCategory) calls.push({ name: "searchProducts", arguments: { query: state.requestedCategory } });
  const text = normalize(message);
  if (/\b(kid|kids|child|children)\b/.test(text)) calls.push({ name: "findKidsMeals", arguments: {} });
  if (/\b(spicy|hot food|chili|jalapeno)\b/.test(text)) calls.push({ name: "findSpicyMeals", arguments: {} });
  return calls;
}

function resolveSelectedProduct(message: string, state: NoriConversationState, cart: NoriChatRequest["cart"]): AIFoodItem | undefined {
  const text = normalize(message);
  const matches = searchProducts(message);
  const direct = matches.find(product => text.includes(normalize(product.name)) || text.includes(normalize(product.id)));
  if (direct) return direct;
  if (state.pendingAction && "productId" in state.pendingAction) {
    const pendingProductId = state.pendingAction.productId;
    const pendingProduct = noriMenuProducts.find(product => product.id === pendingProductId);
    if (pendingProduct) return pendingProduct;
  }
  const recent = productsFromRecent(state);
  if (/\b(?:only|just) the drink\b|\badd only the drink\b/.test(text)) return recent.find(isDrink) ?? state.currentRecommendation?.companionProductIds.flatMap(id => noriMenuProducts.find(product => product.id === id) ?? [])[0];
  if (/\b(first|1st)(?: option| one| burger| meal)?\b/.test(text)) return recent[0];
  if (/\b(second|2nd)(?: option| one| burger| meal)?\b/.test(text)) return recent[1];
  if (/\b(third|3rd)(?: option| one| burger| meal)?\b/.test(text)) return recent[2];
  if (/\blast one\b/.test(text)) return recent[recent.length - 1];
  if (/\b(?:kids?|children)(?: meal)?\b|\bwhat comes with\b|\bwhat is included\b/.test(text)) {
    const kids = recent.filter(product => product.category === "kids_meal");
    if (kids.length === 1) return kids[0];
    if (kids.length > 1 && state.selectedProductId) return kids.find(product => product.id === state.selectedProductId) ?? kids[0];
    if (kids.length > 1) return kids[0];
  }
  if (state.comparisonContext) {
    const compared = state.comparisonContext.productIds.flatMap(id => noriMenuProducts.find(product => product.id === id) ?? []);
    if (/\bhealthier\b/.test(text)) return [...compared].sort((a, b) => healthyScore(b) - healthyScore(a))[0];
    if (/\b(?:more|highest) protein\b/.test(text)) return [...compared].sort((a, b) => b.proteinGrams - a.proteinGrams)[0];
    if (/\bcheaper\b/.test(text)) return [...compared].sort((a, b) => a.price - b.price)[0];
    if (/\bgym\b/.test(text)) return [...compared].sort((a, b) => fitnessScore(b) - fitnessScore(a))[0];
    if (/\b(which one|them|either)\b/.test(text)) return undefined;
  }
  if (recent.length === 1 && /\b(it|this|that|the meal|the burger|the product)\b/.test(text)) return recent[0];
  if (state.selectedProductId) return noriMenuProducts.find(product => product.id === state.selectedProductId);
  if (cart.length === 1) return noriMenuProducts.find(product => product.id === cart[0].productId);
  return undefined;
}

function chooseDrink(main: AIFoodItem | undefined, selected: AIFoodItem[], state: NoriConversationState): AIFoodItem | undefined {
  if (!main || isDrink(main)) return undefined;
  const subtotalLimit = state.maxBudget === null
    ? Number.POSITIVE_INFINITY
    : state.afterTaxBudget
      ? state.maxBudget / (1 + restaurantAIConfig.defaultTaxRate)
      : state.maxBudget;
  const remaining = subtotalLimit - main.price;
  const drinks = [...new Map([...selected, ...noriMenuProducts].map(product => [product.id, product])).values()]
    .filter(product => product.id !== main.id && isDrink(product) && product.price <= remaining)
    .filter(product => checkProductAllergens(product, state.activeAllergens).contains.length === 0)
    .sort((first, second) => second.recommendationScore - first.recommendationScore);
  return drinks[0];
}

function wantsExplicitPairing(message: string) {
  const text = normalize(message);
  return /\b(combo|pairing|pair it|both|meal (?:and|with) (?:a )?drink|with a drink|something to go with it|add a drink)\b/.test(text);
}

function warningsFor(products: AIFoodItem[], allergens: string[]): NoriWarning[] {
  return products.flatMap(product => {
    const check = checkProductAllergens(product, allergens);
    return [
      ...(check.contains.length ? [{ type: "contains" as const, allergens: check.contains }] : []),
      ...(check.mayContain.length ? [{ type: "may_contain" as const, allergens: check.mayContain }] : []),
      ...(check.crossContact.length ? [{ type: "cross_contact" as const, allergens: check.crossContact }] : []),
    ].map(risk => ({ ...risk, productId: product.id, productName: product.name, message: product.allergenSafetyMessage }));
  });
}

function recommendationActions(_products: AIFoodItem[], warnings: NoriWarning[]): NoriAction[] {
  const actions: NoriAction[] = [];
  if (warnings.length) actions.push({ type: "REVIEW_ALLERGENS", productIds: [...new Set(warnings.map(warning => warning.productId))], label: "Review allergen warnings" });
  return actions;
}

function response(intent: NoriIntent, reply: string, state: NoriConversationState, products: AIFoodItem[] = []): NoriChatResponse {
  if (process.env.NODE_ENV !== "production") console.log("[NORI][RESPONSE_TEMPLATE]", { intent, productIds: products.map(product => product.id) });
  return { intent, reply, recommendedProducts: products, actions: [], warnings: [], conversationState: state };
}
function productsFromToolResult(result: ReturnType<typeof executeNoriTool>): AIFoodItem[] {
  if (Array.isArray(result)) return result.flatMap(item => "product" in item ? [item.product] : [item]);
  return "product" in result ? [result.product] : [];
}
function intersectResults(sets: AIFoodItem[][]): AIFoodItem[] {
  if (!sets.length) return [];
  return sets[0].filter(product => sets.every(set => set.some(item => item.id === product.id))).sort(scoreSort);
}
function unionResults(sets: AIFoodItem[][]): AIFoodItem[] {
  return [...new Map(sets.flat().map(product => [product.id, product])).values()].sort(scoreSort);
}
function scoreSort(first: AIFoodItem, second: AIFoodItem) { return second.recommendationScore - first.recommendationScore; }
function isDrink(product: AIFoodItem) { return product.category === "cold_drink" || product.category === "hot_drink"; }
function isSecondary(product: AIFoodItem) { return isDrink(product) || product.category === "dessert" || product.category === "side"; }
function healthyScore(product: AIFoodItem) {
  const nutrition = product.nutrition;
  const categoryBonus = ["salad", "healthy_bowl"].includes(product.category) ? 18 : product.dietaryTags.some(tag => /healthy|high.fiber|lower.saturated.fat/.test(normalize(tag))) ? 10 : 0;
  return categoryBonus + product.proteinGrams * 1.2 + nutrition.fiberGrams * 3
    - product.cal * 0.035 - nutrition.totalFatGrams * 0.7 - nutrition.saturatedFatGrams
    - nutrition.sugarsGrams * 0.6 - nutrition.sodiumMilligrams * 0.006;
}
function fitnessScore(product: AIFoodItem) {
  return product.proteinGrams * 3 + product.nutrition.fiberGrams * 1.5 - product.cal * 0.025
    - product.nutrition.sugarsGrams * 0.8 - product.nutrition.saturatedFatGrams;
}
function recommendationPool(state: NoriConversationState) {
  return noriMenuProducts.filter(product => product.available && product.inStock)
    .filter(product => state.maxBudget === null || product.price <= state.maxBudget)
    .filter(product => state.persistentDietaryPreferences.every(preference => product.dietaryTags.includes(preference) || (preference === "vegetarian" && product.dietaryTags.includes("vegan"))))
    .filter(product => checkProductAllergens(product, state.activeAllergens).contains.length === 0);
}
function explicitCategory(message: string): string | null {
  const text = normalize(message);
  if (/\bburger/.test(text)) return "burger";
  if (/\bdrink|beverage|coffee/.test(text)) return /\bhot|coffee/.test(text) ? "hot_drink" : /\bcold/.test(text) ? "cold_drink" : "drink";
  if (/\bdessert/.test(text)) return "dessert";
  if (/\bsalad/.test(text)) return "salad";
  if (/\bkid/.test(text)) return "kids_meal";
  if (/\bmeal/.test(text)) return "meal";
  return null;
}
function productsFromRecent(state: NoriConversationState) {
  return (state.recentRecommendationContext?.productIds ?? []).flatMap(id => noriMenuProducts.find(product => product.id === id) ?? []);
}
function productsFromComparisonSource(state: NoriConversationState) {
  const context = (state.recentRecommendationContext?.productIds.length ?? 0) >= 2
    ? state.recentRecommendationContext
    : state.lastMultiOptionContext;
  return (context?.productIds ?? []).flatMap(id => noriMenuProducts.find(product => product.id === id) ?? []);
}
function setRecentContext(state: NoriConversationState, queryType: NonNullable<NoriConversationState["recentRecommendationContext"]>["queryType"], products: AIFoodItem[], category?: string) {
  const context = { contextId: createActionId("context", queryType), createdAt: Date.now(), queryType, productIds: products.map(product => product.id), category };
  state.recentRecommendationContext = context;
  if (context.productIds.length >= 2) state.lastMultiOptionContext = context;
}
function specificNoMatch(subject: string, state: NoriConversationState, candidates: AIFoodItem[]) {
  const reasons: string[] = [];
  if (state.activeAllergens.length && candidates.some(product => checkProductAllergens(product, state.activeAllergens).contains.length)) reasons.push(`direct ${state.activeAllergens.join(" or ")} allergen content`);
  if (state.maxBudget !== null && candidates.some(product => product.price > state.maxBudget!)) reasons.push(`the $${state.maxBudget.toFixed(2)} budget`);
  if (state.persistentDietaryPreferences.length) reasons.push(`${state.persistentDietaryPreferences.join("/")} preference`);
  console.log("[NORI][NO_MATCH_REASONS]", reasons);
  return `No documented ${subject} matches${reasons.length ? ` because of ${reasons.join(" and ")}` : " the active constraints"}. Would you like to change one of those conditions?`;
}
function informativeNoMatch(interpretation: NoriRequestInterpretation, rejected: Array<{ product: AIFoodItem; reasons: string[] }>) {
  const counts = rejected.flatMap(item => item.reasons).reduce<Record<string, number>>((result, reason) => ({ ...result, [reason]: (result[reason] ?? 0) + 1 }), {});
  console.log("[NORI][NO_MATCH_REASONS]", counts);
  const constraints = interpretation.constraints;
  if (constraints.minProtein !== null && (constraints.maxBudget !== null || constraints.categories.includes("hot_drink"))) return hardConstraintNoMatch(interpretation);
  const blockers: string[] = [];
  if (counts["contains active allergen"] && constraints.allergens.length) blockers.push(`avoids ${constraints.allergens.join(" and ")}`);
  if ((counts["over budget"] || counts.over_budget_after_tax) && constraints.maxBudget !== null) blockers.push(`stays within $${constraints.maxBudget.toFixed(2)}`);
  if (counts["not a documented kids product"] || constraints.kids) blockers.unshift("is a kids meal");
  if (counts["below protein minimum"] && constraints.minProtein !== null) blockers.push(`provides at least ${constraints.minProtein}g protein`);
  if (counts["above calorie maximum"] && constraints.maxCalories !== null) blockers.push(`stays under ${constraints.maxCalories} calories`);
  if (constraints.dietaryTags.length && rejected.some(item => item.reasons.some(reason => reason.startsWith("not ")))) blockers.push(`matches ${constraints.dietaryTags.join("/")}`);
  if (!blockers.length) return hardConstraintNoMatch(interpretation);
  return `I could not find a documented option that ${blockers.join(", ")}. Would you like to change the budget, category, or another active condition?`;
}
function formatWarnings(warnings: NoriWarning[]) {
  return warnings.map(warning => warning.type === "contains"
    ? `${warning.productName} directly contains ${warning.allergens.join(", ")}.`
    : warning.type === "may_contain"
      ? `${warning.productName} may contain ${warning.allergens.join(", ")}.`
      : `${warning.productName} has documented ${warning.allergens.join(", ")} cross-contact risk. For a severe allergy, confirm with restaurant staff.`).join(" ");
}
function normalize(value: string) { return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim(); }
function customizationTerms(message: string): string[] {
  const text = normalize(message);
  const synonymEntry = Object.entries(CUSTOMIZATION_SYNONYMS).find(([key, values]) =>
    text.includes(key) || values.some(value => text.includes(value)),
  );
  if (synonymEntry) return [...new Set([synonymEntry[0], ...synonymEntry[1]])].map(normalize);
  const term = text.replace(/\b(can i|could i|please|remove|without|change|customize|customise)\b/g, "").trim();
  return term ? [term] : [];
}
function productMatchesState(product: AIFoodItem, state: NoriConversationState, message = "") {
  const text = normalize(message);
  return (state.maxBudget === null || product.price <= state.maxBudget)
    && (state.minProtein === null || product.proteinGrams >= state.minProtein)
    && (state.maxCalories === null || product.cal <= state.maxCalories)
    && (!state.requestedCategory || product.category === state.requestedCategory)
    && state.dietaryPreferences.every(preference => product.dietaryTags.includes(preference))
    && (!/\b(kid|kids|child|children)\b/.test(text) || product.category === "kids_meal" || product.tags.some(tag => normalize(tag).includes("kid")))
    && (!/\b(spicy|hot food|chili|jalapeno)\b/.test(text) || [...product.tags, ...product.keywords, ...product.vectorTags].some(tag => normalize(tag).includes("spicy")))
    && checkProductAllergens(product, state.activeAllergens).contains.length === 0;
}
function hasSelectionReference(message: string) {
  return /\b(it|this|that option|the first one|first option|selected item|that one)\b/.test(normalize(message));
}
function isIndependentMenuQuery(message: string) {
  const text = normalize(message);
  return !hasSelectionReference(message)
    && /\b(show|find|recommend|suggest|list|what).*\b(meal|meals|food|foods|option|options|vegan|vegetarian|kids?|spicy|protein|calories?)\b/.test(text);
}
function clearTransientSearchState(state: NoriConversationState) {
  state.minProtein = null;
  state.maxCalories = null;
  state.dietaryPreferences = [...state.persistentDietaryPreferences];
  state.requestedCategory = null;
  state.requestedDrink = false;
  state.requestedSpicy = false;
  state.requestedKids = false;
  state.requestedDessert = false;
  state.selectedProductId = null;
  state.selectedCustomizations = [];
  state.currentRecommendation = null;
  state.pendingAction = null;
  state.excludedIngredients = [];
}
function applyInterpretation(state: NoriConversationState, interpretation: NoriRequestInterpretation, message: string) {
  const constraints = interpretation.constraints;
  state.maxBudget = constraints.maxBudget;
  state.minProtein = constraints.minProtein;
  state.maxCalories = constraints.maxCalories;
  state.dietaryPreferences = constraints.dietaryTags;
  state.requestedCategory = constraints.categories.length === 1 ? constraints.categories[0] : null;
  state.requestedDrink = constraints.wantsDrink;
  state.requestedSpicy = constraints.spicy;
  state.requestedKids = constraints.kids;
  state.requestedDessert = constraints.wantsDessert;
  state.excludedIngredients = constraints.excludedIngredients;
  state.afterTaxBudget = constraints.afterTax;
  if (isStableDietaryStatement(message)) state.persistentDietaryPreferences = [...constraints.dietaryTags];
}

export function validateRecommendations(products: AIFoodItem[], interpretation: NoriRequestInterpretation) {
  const constraints = interpretation.constraints;
  const rejected: Array<{ product: AIFoodItem; reasons: string[] }> = [];
  const valid = products.filter(product => {
    const reasons: string[] = [];
    if (!product.available) reasons.push("unavailable");
    if (!product.inStock) reasons.push("out of stock");
    if (constraints.maxBudget !== null && product.price > constraints.maxBudget) reasons.push("over budget");
    if (constraints.afterTax && constraints.maxBudget !== null && product.price * (1 + restaurantAIConfig.defaultTaxRate) > constraints.maxBudget) reasons.push("over_budget_after_tax");
    if (constraints.minProtein !== null && product.proteinGrams < constraints.minProtein) reasons.push("below protein minimum");
    if (constraints.maxCalories !== null && product.cal > constraints.maxCalories) reasons.push("above calorie maximum");
    if (constraints.maxFat !== null && product.nutrition.totalFatGrams >= constraints.maxFat) reasons.push("above_max_fat");
    if (constraints.maxSugars !== null && Number.isFinite(constraints.maxSugars) && product.nutrition.sugarsGrams >= constraints.maxSugars) reasons.push("above_max_sugar");
    if (constraints.minFiber !== null && product.nutrition.fiberGrams < constraints.minFiber) reasons.push("below_min_fiber");
    if (constraints.maxSodium !== null && product.nutrition.sodiumMilligrams >= constraints.maxSodium) reasons.push("above_max_sodium");
    if (constraints.maxCarbohydrates !== null && product.nutrition.carbohydratesGrams >= constraints.maxCarbohydrates) reasons.push("above_max_carbohydrates");
    if (constraints.dietaryTags.includes("vegan") && !product.dietaryTags.includes("vegan")) reasons.push("not vegan");
    if (constraints.dietaryTags.includes("vegetarian")
      && !product.dietaryTags.some(tag => tag === "vegetarian" || tag === "vegan")) reasons.push("not vegetarian");
    if (constraints.kids && product.category !== "kids_meal" && !product.dietaryTags.includes("kids")) reasons.push("not a documented kids product");
    if (constraints.kids && product.spiceLevel > 1) reasons.push("too spicy for kids");
    if (constraints.spicy && product.spiceLevel <= 0 && !product.dietaryTags.includes("spicy")) reasons.push("not spicy");
    if (constraints.categories.length && !constraints.categories.includes(product.category)) reasons.push("wrong category");
    const text = normalize([product.description, ...product.ingredients, ...product.keywords, ...product.vectorTags].join(" "));
    for (const excluded of constraints.excludedIngredients) if (text.includes(normalize(excluded))) reasons.push(`contains excluded ${excluded}`);
    if (constraints.preferredIngredients.length
      && !constraints.preferredIngredients.every(ingredient => text.includes(normalize(ingredient)))) reasons.push("missing preferred ingredient");
    if (checkProductAllergens(product, constraints.allergens).contains.length) reasons.push("contains active allergen");
    if (reasons.length) rejected.push({ product, reasons });
    return reasons.length === 0;
  });
  const prioritizeMain = !constraints.wantsDrink && !constraints.wantsDessert;
  valid.sort((first, second) => {
    if (prioritizeMain) {
      const firstSecondary = ["hot_drink", "cold_drink", "dessert", "side"].includes(first.category);
      const secondSecondary = ["hot_drink", "cold_drink", "dessert", "side"].includes(second.category);
      if (firstSecondary !== secondSecondary) return firstSecondary ? 1 : -1;
    }
    return second.recommendationScore - first.recommendationScore;
  });
  return { valid, rejected };
}
function logInterpretation(interpretation: NoriRequestInterpretation) {
  console.log("[NORI][INTERPRETATION]");
  console.log("intent:", interpretation.intent);
  console.log("continuation:", interpretation.isContinuation);
  console.log("constraints:", interpretation.constraints);
}
function logValidation(inputCount: number, validation: ReturnType<typeof validateRecommendations>) {
  console.log("[NORI][VALIDATION]");
  console.log("input products:", inputCount);
  console.log("valid products:", validation.valid.map(product => product.id));
  console.log("rejected products and reason:", validation.rejected.map(item => ({
    productId: item.product.id,
    reasons: item.reasons,
  })));
}
function prioritizeFreshRecommendations(
  products: AIFoodItem[],
  recentProductIds: string[],
) {
  if (!recentProductIds.length) return products;
  const recent = new Set(recentProductIds);
  return [
    ...products.filter(product => !recent.has(product.id)),
    ...products.filter(product => recent.has(product.id)),
  ];
}
function isConfirmation(text: string) {
  return /^(yes|confirm|yes confirm|add it|add it to (?:my |the )?cart|add it now|yes add it|add that|go ahead|proceed|okay|ok|sure)[.! ]*$/.test(text);
}
function isIngredientRemovalRequest(text: string) {
  return /\b(remove|take off|without|no|hold)\b/.test(text) && /\b(onions?|tomatoes?|pickles?|mayo(?:nnaise)?|cheese|cheddar|mozzarella|parmesan|sauce|dressing|lettuce|greens)\b/.test(text);
}
function matchRequestedRemovableIngredient(product: AIFoodItem, message: string): { ingredient: string; selection: NoriSelectedCustomization } | null {
  const text = normalize(message);
  if (!isIngredientRemovalRequest(text)) return null;
  const concepts: Record<string, string[]> = {
    onion: ["onion", "onions"], tomato: ["tomato", "tomatoes"], pickle: ["pickle", "pickles"],
    sauce: ["sauce", "dressing", "mayo", "mayonnaise"], cheese: ["cheese", "cheddar", "mozzarella", "parmesan"],
    lettuce: ["lettuce", "greens"],
  };
  const requested = Object.entries(concepts).find(([, terms]) => terms.some(term => new RegExp(`\\b${term}\\b`).test(text)));
  if (!requested) return null;
  const ingredient = product.removableIngredients.find(value => [requested[0], ...requested[1]].some(term => normalize(value).includes(term)));
  if (!ingredient) return null;
  const zeroNutrition = { calories: 0, proteinGrams: 0, carbohydratesGrams: 0, totalFatGrams: 0, saturatedFatGrams: 0, sugarsGrams: 0, addedSugarsGrams: 0, fiberGrams: 0, sodiumMilligrams: 0, cholesterolMilligrams: 0 };
  return { ingredient, selection: { productId: product.id, groupId: "removable-ingredients", optionId: `no-${normalize(ingredient).replace(/\s+/g, "-")}`, optionName: `No ${ingredient}`, priceAdjustment: 0, nutritionAdjustment: zeroNutrition, allergensAdded: [], allergensRemoved: [] } };
}
function transitionClarification(
  state: NoriConversationState,
  message: string,
  intent: NoriIntent,
): "none" | "answered" | "superseded" | "cancelled" {
  const clarification = state.clarificationState;
  if (!clarification || clarification.status !== "awaiting_answer") return "none";
  const text = normalizeNoriInput(message);
  if (/^(cancel|never mind|stop)[.! ]*$/.test(text)) {
    clarification.status = "cancelled";
    state.awaitingConstraintClarification = false;
    return "cancelled";
  }

  const validAnswer = clarification.clarificationType === "recommendation_kind"
    && /^(?:(?:a|some)?\s*)?(?:food|something to eat|meal|burger|bowl|hot drink|cold drink|vegetarian|vegan)[.! ]*$/.test(text);
  if (validAnswer) {
    clarification.status = "answered";
    return "answered";
  }
  if (intent !== "unsupported" && intent !== "greeting" && intent !== "help") {
    clarification.status = "superseded";
    state.awaitingConstraintClarification = false;
    return "superseded";
  }
  return "none";
}
function isCustomizationConfirmation(text: string) {
  return isConfirmation(text) || /^(apply it|do it)[.! ]*$/.test(text);
}
function isCancellation(text: string) {
  return /^(no|cancel|never mind|do not add it)[.! ]*$/.test(text);
}
function wantsFullRecommendation(text: string) {
  return /\b(add both|add the full recommendation|full recommendation|bowl and drink|meal and drink|add all)\b/.test(text);
}
function wantsPrimaryOnly(text: string) {
  return /\b(add the meal|just the bowl|only the bowl|meal only|only the meal)\b/.test(text);
}
function isAmbiguousAddReference(message: string) {
  return /\b(add it|add this|add the first option)\b/.test(normalize(message));
}
function customizationsFor(state: NoriConversationState, productId: string) {
  return state.selectedCustomizations.filter(item => item.productId === productId);
}
function selectionsFromCart(product: AIFoodItem, customizations?: Record<string, string>): NoriSelectedCustomization[] {
  if (!customizations) return [];
  return Object.entries(customizations).flatMap(([groupId, optionName]) => {
    const group = product.customizationGroups.find(item => item.id === groupId);
    const option = group?.options.find(item => normalize(item.name) === normalize(optionName));
    return group && option ? [{
      productId: product.id,
      groupId: group.id,
      optionId: option.id,
      optionName: option.name,
      priceAdjustment: option.priceAdjustment,
      nutritionAdjustment: option.nutritionAdjustment,
      allergensAdded: option.allergensAdded,
      allergensRemoved: option.allergensRemoved,
    }] : [];
  });
}
function adjustedProductPrice(productId: string, customizations: NoriSelectedCustomization[]) {
  const product = noriMenuProducts.find(item => item.id === productId);
  if (!product) return 0;
  if (!validateSelectedCustomizations(product, customizations)) return product.price;
  return calculateCustomizedProduct(product, customizations).adjustedPrice;
}
function addAction(
  productId: string,
  quantity: number,
  customizations: NoriSelectedCustomization[],
  actionId?: string,
): Extract<NoriAction, { type: "add_to_cart" }> {
  const list = customizations;
  const product = noriMenuProducts.find(item => item.id === productId);
  const customizationText = list.length ? ` with ${list.map(item => item.optionName).join(", ")}` : "";
  return {
    type: "add_to_cart" as const,
    actionId: actionId ?? createActionId("add", productId),
    productId,
    quantity,
    customizations: list,
    unitPrice: adjustedProductPrice(productId, list),
    label: `Add ${quantity} ${product?.name ?? "product"}${customizationText}`,
  };
}
let actionSequence = 0;
function createActionId(prefix: string, productId: string) {
  actionSequence += 1;
  return `${prefix}-${productId}-${Date.now()}-${actionSequence}`;
}
function createPendingAction<const T extends object>(action: T): T & { id: string; createdAt: number; status: "awaiting_confirmation" } {
  const result = { ...action, id: createActionId("pending", "action"), createdAt: Date.now(), status: "awaiting_confirmation" as const };
  console.log("[NORI][PENDING_ACTION]");
  console.log("id:", result.id);
  console.log("type:", "type" in result ? result.type : "unknown");
  console.log("status:", result.status);
  return result;
}
function logPendingStatus(id: string, type: string, status: string) {
  console.log("[NORI][PENDING_ACTION]");
  console.log("id:", id);
  console.log("type:", type);
  console.log("status:", status);
}
function productName(productId: string) {
  return noriMenuProducts.find(item => item.id === productId)?.name ?? "product";
}
function productNames(productIds: string[]) {
  return productIds.map(productName);
}
function archivePendingAction(state: NoriConversationState, pending: Exclude<NoriConversationState["pendingAction"], null>) {
  state.pendingActionHistory = [
    ...(state.pendingActionHistory ?? []).filter(item => item.id !== pending.id),
    { ...pending },
  ].slice(-20);
}
function clonePendingAction<T extends NoriConversationState["pendingAction"]>(pending: T): T {
  return pending === null ? pending : JSON.parse(JSON.stringify(pending)) as T;
}

function hardConstraintNoMatch(interpretation: NoriRequestInterpretation) {
  const { minProtein, maxBudget, categories } = interpretation.constraints;
  if (interpretation.constraints.allergens.length) return "I could not find a documented option matching every requirement and the active allergen constraints. Which condition would you like to change?";
  if (minProtein !== null && categories.includes("hot_drink")) return `No documented hot drink provides at least ${minProtein}g of protein. Would you like a meal instead, or would you like to remove the protein requirement?`;
  if (minProtein !== null && maxBudget !== null) return `No documented item matches both at least ${minProtein}g of protein and a $${maxBudget} budget. Would you like to raise the budget or lower the protein target?`;
  if (minProtein !== null) return `No documented item matches at least ${minProtein}g of protein. Would you like to lower the protein target or choose another priority?`;
  if (maxBudget !== null) return `No documented item matches all of those conditions within a $${maxBudget} budget. Would you like to raise the budget or change another condition?`;
  return "No documented item matches all of those conditions. Which condition would you like to change?";
}
