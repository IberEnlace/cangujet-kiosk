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
  NoriIntent, NoriSelectedCustomization, NoriWarning,
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

const CATEGORY_NAMES = ["burger", "pizza", "pasta", "healthy_bowl", "salad", "side", "dessert", "hot_drink", "cold_drink", "kids_meal"];
const PAYMENT_METHODS = "You can pay by credit or debit card, Apple Pay, Google Pay, QR payment, digital wallet, gift card, cash, or at the cashier.";
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
    }
    const pendingResult = this.handlePendingAction(request, state);
    if (pendingResult) return pendingResult;
    const freshQuery = isIndependentMenuQuery(request.message);
    if (freshQuery) clearTransientSearchState(state);
    updateState(state, request.message);
    const intent = detectIntent(request.message, state);
    const interpretation = interpretNoriRequest(request.message, state);
    if (intent === "recommendation" || intent === "menu_search") applyInterpretation(state, interpretation, request.message);
    const selectedProduct = resolveSelectedProduct(request.message, state, request.cart);
    if (selectedProduct && selectedProduct.id !== state.selectedProductId) {
      state.selectedProductId = selectedProduct.id;
      state.selectedCustomizations = [];
    }

    switch (intent) {
      case "greeting": return response(intent, "Hello! I’m Nori. I can help with menu recommendations, allergies, nutrition, customizations, your cart, and checkout.", state);
      case "help": return response(intent, "Tell me your budget, dietary needs, allergies, protein or calorie goal, or ask about a product. I can also help manage your cart and prepare checkout.", state);
      case "payment_methods": return response(intent, PAYMENT_METHODS, state);
      case "show_cart": return this.cartSummary(intent, request, state, false);
      case "clear_cart": {
        state.pendingAction = createPendingAction({ type: "confirm_clear_cart" });
        return response(intent, "Please confirm clearing every item from your cart.", state);
      }
      case "undo": return this.undoLastMutation(state);
      case "checkout": return this.cartSummary(intent, request, state, true);
      case "customization_question": return this.customizationAnswer(request.message, selectedProduct, state);
      case "product_comparison": return this.comparisonAnswer(request.message, state);
      case "product_details": return this.productDetails(selectedProduct, state);
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

  private handlePendingAction(request: NoriChatRequest, state: NoriConversationState): NoriChatResponse | null {
    const pending = state.pendingAction;
    if (!pending) return null;
    const text = normalize(request.message);
    if (isCancellation(text)) {
      logPendingStatus(pending.id, pending.type, "cancelled");
      state.pendingAction = null;
      state.selectedCustomizations = [];
      return response("unknown", "Okay, I cancelled that action.", state);
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
      logPendingStatus(pending.id, pending.type, "confirmed");
      state.pendingAction = null;
      const action: NoriAction = {
        type: "clear_cart", actionId: createActionId("clear", "cart"), productId: "",
        quantity: 0, customizations: [], adjustedUnitPrice: 0, label: "Clear cart",
      };
      state.latestSuccessfulMutation = action;
      return { ...response("clear_cart", "Please confirm clearing the cart.", state), actions: [action] };
    }
    if (pending.type !== "confirm_cart_change" || !isConfirmation(text)) return null;
    state.pendingAction = null;
    logPendingStatus(pending.id, pending.type, "confirmed");
    if (pending.operation === "add") {
      const action = addAction(pending.productId, pending.quantity, pending.customizations);
      state.selectedCustomizations = [];
      state.latestSuccessfulMutation = action;
      return {
        ...response("add_to_cart", `Please confirm: ${action.label}.`, state),
        actions: [action],
      };
    }
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
    const selected = (safe.length ? safe : noContains).slice(0, 3).map(item => item.product);
    const main = selected.find(product => !isDrink(product)) ?? selected[0];
    const drink = state.requestedDrink ? chooseDrink(main, selected, state) : undefined;
    const recommendations = drink && !selected.some(product => product.id === drink.id) ? [main, drink, ...selected.filter(product => product.id !== main.id)].slice(0, 3) : selected;
    const warnings = warningsFor(recommendations, state.activeAllergens);
    state.recentlyRecommendedProductIds = [
      ...new Set([
        ...state.recentlyRecommendedProductIds,
        ...recommendations.map(product => product.id),
      ]),
    ].slice(-12);
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
    const reply = buildRecommendationResponse({
      products: replyProducts,
      interpretation,
      language: state.preferredLanguage,
      companion: drink,
      warnings,
      noMatchReason: validation.rejected[0]?.reasons[0],
    });
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
    const terms = customizationTerms(message);
    const removable = product.removableIngredients.find(ingredient => terms.some(term => normalize(ingredient).includes(term)));
    const documentedCustomization = product.customizations.find(item => terms.some(term => normalize(item).includes(term)));
    const ingredient = product.ingredients.find(item => terms.some(term => normalize(item).includes(term)));
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
    return response("customization_question", `Yes, ${removable ?? documentedCustomization} is listed as an available customization for ${product.name}. The menu database does not provide a numeric price or nutrition adjustment for it. Cross-contact risks remain, so removal does not make it allergy-safe.`, state);
  }

  private comparisonAnswer(message: string, state: NoriConversationState): NoriChatResponse {
    const products = searchProducts(message).slice(0, 2);
    if (products.length < 2) return response("product_comparison", "Please name the two products you want to compare.", state);
    const [first, second] = products;
    state.selectedProductId = first.id;
    return {
      ...response("product_comparison", `${first.name} costs $${first.price.toFixed(2)}, has ${first.proteinGrams}g protein and ${first.cal} calories. ${second.name} costs $${second.price.toFixed(2)}, has ${second.proteinGrams}g protein and ${second.cal} calories. ${first.recommendationScore >= second.recommendationScore ? first.name : second.name} has the higher menu recommendation score.`, state),
      recommendedProducts: products,
      warnings: warningsFor(products, state.activeAllergens),
    };
  }

  private productDetails(product: AIFoodItem | undefined, state: NoriConversationState): NoriChatResponse {
    if (!product) return response("product_details", "Which product would you like details about?", state);
    return { ...response("product_details", `${product.name}: ${product.description} It costs $${product.price.toFixed(2)}, has ${product.cal} calories and ${product.proteinGrams}g protein.`, state), recommendedProducts: [product], warnings: warningsFor([product], state.activeAllergens) };
  }

  private async nutritionAnswer(message: string, product: AIFoodItem | undefined, state: NoriConversationState): Promise<NoriChatResponse> {
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
      state.pendingAction = null;
      const actions = productIds.map(productId => addAction(productId, quantity, customizationsFor(state, productId)));
      state.selectedCustomizations = [];
      return {
          ...response(intent, "Please confirm adding the full recommendation.", state),
        actions,
      };
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
    state.pendingAction = createPendingAction({ type: "confirm_cart_change", operation, productId: product.id, quantity, customizations });
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
    pendingAction: previous?.pendingAction ?? null,
  };
}

export function detectIntent(message: string, state: NoriConversationState): NoriIntent {
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
  const matches = searchProducts(message);
  const direct = matches.find(product => normalize(message).includes(normalize(product.name)) || normalize(message).includes(normalize(product.id)));
  if (direct) return direct;
  if (/\b(?:select|choose|pick|add) (?:the )?(?:first|1st) (?:option|one|item)\b/.test(normalize(message)) && state.selectedProductId) {
    return noriMenuProducts.find(product => product.id === state.selectedProductId);
  }
  if (state.selectedProductId) return noriMenuProducts.find(product => product.id === state.selectedProductId);
  if (cart.length === 1) return noriMenuProducts.find(product => product.id === cart[0].productId);
  return undefined;
}

function chooseDrink(main: AIFoodItem | undefined, selected: AIFoodItem[], state: NoriConversationState): AIFoodItem | undefined {
  if (!main) return undefined;
  const remaining = state.maxBudget === null ? Number.POSITIVE_INFINITY : state.maxBudget - main.price;
  const drinks = noriMenuProducts.filter(product => isDrink(product) && product.price <= remaining)
    .filter(product => checkProductAllergens(product, state.activeAllergens).contains.length === 0)
    .sort((first, second) => second.recommendationScore - first.recommendationScore);
  return selected.find(isDrink) ?? drinks[0];
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
    if (constraints.minProtein !== null && product.proteinGrams < constraints.minProtein) reasons.push("below protein minimum");
    if (constraints.maxCalories !== null && product.cal > constraints.maxCalories) reasons.push("above calorie maximum");
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
  return /^(yes|confirm|yes confirm|add it|add it to (?:my |the )?cart|add it now|yes add it|proceed|okay|ok|sure)[.! ]*$/.test(text);
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
): Extract<NoriAction, { type: "add_to_cart" }> {
  const list = customizations;
  const product = noriMenuProducts.find(item => item.id === productId);
  const customizationText = list.length ? ` with ${list.map(item => item.optionName).join(", ")}` : "";
  return {
    type: "add_to_cart" as const,
    actionId: createActionId("add", productId),
    productId,
    quantity,
    customizations: list,
    label: `Add ${quantity} ${product?.name ?? "product"}${customizationText}`,
  };
}
let actionSequence = 0;
function createActionId(prefix: string, productId: string) {
  actionSequence += 1;
  return `${prefix}-${productId}-${Date.now()}-${actionSequence}`;
}
function createPendingAction<const T extends object>(action: T): T & { id: string; createdAt: number; status: "pending" } {
  const result = { ...action, id: createActionId("pending", "action"), createdAt: Date.now(), status: "pending" as const };
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
