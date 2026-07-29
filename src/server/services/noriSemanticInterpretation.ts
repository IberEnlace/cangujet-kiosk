import type {
  NoriSemanticInterpretation,
} from "../types/aiProvider";
import type {
  NoriChatRequest,
  NoriConversationState,
  NoriIntent,
} from "../types/noriChat";
import type {
  NoriRequestInterpretation,
} from "./noriRequestInterpreter";

const SEMANTIC_INTENTS: readonly NoriIntent[] = [
  "recommendation",
  "healthy_recommendation",
  "product_details",
  "compare_products",
  "comparison_follow_up",
  "comparative_add",
  "allergen_check",
  "customization_question",
  "add_to_cart",
  "remove_from_cart",
  "nutrition_question",
  "constraint_update",
  "unsupported",
  "unknown",
];

export const NORI_SEMANTIC_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "primaryIntent", "secondaryIntents", "confidence", "needsClarification",
    "clarificationReason", "constraints", "references",
  ],
  properties: {
    primaryIntent: { type: "string", enum: SEMANTIC_INTENTS },
    secondaryIntents: { type: "array", items: { type: "string", enum: SEMANTIC_INTENTS } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    needsClarification: { type: "boolean" },
    clarificationReason: { type: ["string", "null"] },
    constraints: {
      type: "object",
      additionalProperties: false,
      required: [
        "maxBudget", "pricePreference", "minProtein", "maxCalories",
        "portionPreference", "dietaryPreferences", "allergens",
        "excludedIngredients", "preferredIngredients", "spicePreference",
        "temperaturePreference", "category", "mealType", "speedPreference",
        "healthPreference", "satietyPreference",
      ],
      properties: {
        maxBudget: nullableNumber(),
        pricePreference: nullableEnum(["affordable", "cheaper"]),
        minProtein: nullableNumber(),
        maxCalories: nullableNumber(),
        portionPreference: nullableEnum(["light", "filling", "large"]),
        dietaryPreferences: stringArray(),
        allergens: stringArray(),
        excludedIngredients: stringArray(),
        preferredIngredients: stringArray(),
        spicePreference: nullableEnum(["spicy", "mild"]),
        temperaturePreference: nullableEnum(["hot", "cold"]),
        category: nullableString(),
        mealType: nullableString(),
        speedPreference: nullableEnum(["quick"]),
        healthPreference: nullableEnum(["healthy", "light"]),
        satietyPreference: nullableEnum(["filling"]),
      },
    },
    references: {
      type: "object",
      additionalProperties: false,
      required: [
        "selectedOrdinal", "refersToPreviousRecommendations",
        "refersToCurrentCart", "refersToLastProduct",
      ],
      properties: {
        selectedOrdinal: { type: ["integer", "null"], minimum: 1, maximum: 3 },
        refersToPreviousRecommendations: { type: "boolean" },
        refersToCurrentCart: { type: "boolean" },
        refersToLastProduct: { type: "boolean" },
      },
    },
  },
} as const;

export function buildNoriSemanticPrompt(
  state: NoriConversationState,
  cart: NoriChatRequest["cart"] = [],
) {
  return [
    "Interpret the restaurant customer's intent into the required JSON schema.",
    "Return structured meaning only; never answer the customer and never create cart actions.",
    "Do not invent product names, prices, nutrition, allergens, availability, or order state.",
    "Use constraints as hard limits only when the customer states a clear limit; use preference fields for soft goals.",
    "Resolve indirect restaurant needs and conversational references using the supplied session summary.",
    `Language: ${state.preferredLanguage}.`,
    `Session summary: ${JSON.stringify({
      activeAllergens: state.activeAllergens,
      maxBudget: state.maxBudget,
      minProtein: state.minProtein,
      maxCalories: state.maxCalories,
      dietaryPreferences: state.dietaryPreferences,
      excludedIngredients: state.excludedIngredients,
      rankingPriorities: state.rankingPriorities,
      recentProductIds: state.recentRecommendationContext?.productIds ?? [],
      comparedProductIds: state.comparisonContext?.productIds ?? [],
      selectedProductId: state.selectedProductId,
      cartItems: cart.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    })}`,
  ].join("\n");
}

export function validateNoriSemanticInterpretation(value: unknown): NoriSemanticInterpretation {
  const root = record(value, "semantic interpretation");
  const primaryIntent = intent(root.primaryIntent);
  const secondaryIntents = array(root.secondaryIntents, "secondaryIntents").map(intent);
  const confidence = finiteNumber(root.confidence, "confidence");
  if (confidence < 0 || confidence > 1) throw new Error("Semantic confidence must be between 0 and 1.");
  const needsClarification = boolean(root.needsClarification, "needsClarification");
  const clarificationReason = nullableStringValue(root.clarificationReason, "clarificationReason");
  const constraints = record(root.constraints, "constraints");
  const references = record(root.references, "references");
  const selectedOrdinal = nullableNumberValue(references.selectedOrdinal, "selectedOrdinal");
  if (selectedOrdinal !== null && (!Number.isInteger(selectedOrdinal) || selectedOrdinal < 1 || selectedOrdinal > 3)) {
    throw new Error("Semantic selectedOrdinal must be an integer from 1 to 3.");
  }

  return {
    primaryIntent,
    secondaryIntents,
    confidence,
    needsClarification,
    clarificationReason,
    constraints: {
      maxBudget: nonNegativeNullable(constraints.maxBudget, "maxBudget"),
      pricePreference: enumValue(constraints.pricePreference, ["affordable", "cheaper"], "pricePreference"),
      minProtein: nonNegativeNullable(constraints.minProtein, "minProtein"),
      maxCalories: nonNegativeNullable(constraints.maxCalories, "maxCalories"),
      portionPreference: enumValue(constraints.portionPreference, ["light", "filling", "large"], "portionPreference"),
      dietaryPreferences: stringValues(constraints.dietaryPreferences, "dietaryPreferences"),
      allergens: stringValues(constraints.allergens, "allergens"),
      excludedIngredients: stringValues(constraints.excludedIngredients, "excludedIngredients"),
      preferredIngredients: stringValues(constraints.preferredIngredients, "preferredIngredients"),
      spicePreference: enumValue(constraints.spicePreference, ["spicy", "mild"], "spicePreference"),
      temperaturePreference: enumValue(constraints.temperaturePreference, ["hot", "cold"], "temperaturePreference"),
      category: nullableStringValue(constraints.category, "category"),
      mealType: nullableStringValue(constraints.mealType, "mealType"),
      speedPreference: enumValue(constraints.speedPreference, ["quick"], "speedPreference"),
      healthPreference: enumValue(constraints.healthPreference, ["healthy", "light"], "healthPreference"),
      satietyPreference: enumValue(constraints.satietyPreference, ["filling"], "satietyPreference"),
    },
    references: {
      selectedOrdinal,
      refersToPreviousRecommendations: boolean(references.refersToPreviousRecommendations, "refersToPreviousRecommendations"),
      refersToCurrentCart: boolean(references.refersToCurrentCart, "refersToCurrentCart"),
      refersToLastProduct: boolean(references.refersToLastProduct, "refersToLastProduct"),
    },
  };
}

export function mergeSemanticInterpretation(
  deterministic: NoriRequestInterpretation,
  semantic: NoriSemanticInterpretation | null,
  state: NoriConversationState,
): NoriRequestInterpretation {
  if (!semantic) return deterministic;
  const constraints = semantic.constraints;
  const priorities = [...deterministic.constraints.priorities];
  const addPriority = (value: typeof priorities[number]) => {
    if (!priorities.includes(value)) priorities.push(value);
  };
  if (constraints.pricePreference) addPriority("price");
  if (constraints.minProtein !== null) addPriority("protein");
  if (constraints.portionPreference === "light") addPriority("light");
  if (constraints.portionPreference === "filling" || constraints.portionPreference === "large") addPriority("filling");
  if (constraints.speedPreference === "quick") addPriority("quick");
  if (constraints.healthPreference === "healthy") addPriority("healthy");
  if (constraints.healthPreference === "light") addPriority("light");
  if (constraints.satietyPreference === "filling") addPriority("filling");

  const categories = [...deterministic.constraints.categories];
  if (constraints.category && !categories.includes(constraints.category)) categories.push(constraints.category);
  if (constraints.temperaturePreference === "hot") replace(categories, "hot_drink");
  if (constraints.temperaturePreference === "cold") replace(categories, "cold_drink");
  const excludedIngredients = unique([
    ...deterministic.constraints.excludedIngredients,
    ...constraints.excludedIngredients,
    ...(constraints.spicePreference === "mild" ? ["spicy"] : []),
  ]);
  const dietaryTags = unique([
    ...deterministic.constraints.dietaryTags,
    ...constraints.dietaryPreferences,
  ]);
  const allergens = unique([
    ...state.activeAllergens,
    ...deterministic.constraints.allergens,
    ...constraints.allergens,
  ]);
  const clarificationNeeded = semantic.needsClarification
    && semantic.confidence >= 0.55
    && !deterministic.constraints.priorities.length
    && !deterministic.constraints.categories.length;

  return {
    ...deterministic,
    intent: semantic.primaryIntent,
    understandingSource: "hybrid",
    isContinuation: deterministic.isContinuation || semantic.references.refersToPreviousRecommendations,
    referencesPreviousProduct: deterministic.referencesPreviousProduct || semantic.references.refersToLastProduct,
    clarificationNeeded: deterministic.clarificationNeeded || clarificationNeeded,
    clarificationQuestion: deterministic.clarificationQuestion
      ?? (clarificationNeeded
        ? state.preferredLanguage === "tr"
          ? "Yemek önerisi mi, belirli bir ürün bilgisi mi istersiniz?"
          : "Would you like a recommendation or details about a specific product?"
        : null),
    constraints: {
      ...deterministic.constraints,
      maxBudget: constraints.maxBudget ?? deterministic.constraints.maxBudget,
      minProtein: constraints.minProtein ?? deterministic.constraints.minProtein,
      maxCalories: constraints.maxCalories ?? deterministic.constraints.maxCalories,
      categories,
      dietaryTags,
      excludedIngredients,
      preferredIngredients: unique([
        ...deterministic.constraints.preferredIngredients,
        ...constraints.preferredIngredients,
      ]),
      allergens,
      spicy: constraints.spicePreference === "spicy" || deterministic.constraints.spicy,
      wantsDrink: deterministic.constraints.wantsDrink
        || constraints.temperaturePreference !== null
        || constraints.mealType === "drink",
      drinkTemperature: constraints.temperaturePreference ?? deterministic.constraints.drinkTemperature,
      wantsDessert: deterministic.constraints.wantsDessert || constraints.mealType === "dessert",
      wantsLightMeal: deterministic.constraints.wantsLightMeal
        || constraints.portionPreference === "light"
        || constraints.healthPreference === "light",
      wantsFillingMeal: deterministic.constraints.wantsFillingMeal
        || constraints.portionPreference === "filling"
        || constraints.portionPreference === "large"
        || constraints.satietyPreference === "filling",
      priorities,
      needsQuickService: priorities.includes("quick"),
    },
  };
}

function nullableNumber() {
  return { type: ["number", "null"], minimum: 0 };
}
function nullableString() {
  return { type: ["string", "null"] };
}
function nullableEnum(values: string[]) {
  return { type: ["string", "null"], enum: [...values, null] };
}
function stringArray() {
  return { type: "array", items: { type: "string" } };
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}
function intent(value: unknown): NoriIntent {
  if (typeof value !== "string" || !SEMANTIC_INTENTS.includes(value as NoriIntent)) throw new Error("Semantic intent is unsupported.");
  return value as NoriIntent;
}
function finiteNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}
function nullableNumberValue(value: unknown, label: string) {
  return value === null ? null : finiteNumber(value, label);
}
function nonNegativeNullable(value: unknown, label: string) {
  const result = nullableNumberValue(value, label);
  if (result !== null && result < 0) throw new Error(`${label} cannot be negative.`);
  return result;
}
function boolean(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  return value;
}
function nullableStringValue(value: unknown, label: string) {
  if (value !== null && typeof value !== "string") throw new Error(`${label} must be a string or null.`);
  return value as string | null;
}
function stringValues(value: unknown, label: string) {
  const values = array(value, label);
  if (!values.every(item => typeof item === "string")) throw new Error(`${label} must contain strings.`);
  return unique(values as string[]);
}
function enumValue<const T extends string>(value: unknown, allowed: readonly T[], label: string): T | null {
  if (value === null) return null;
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`${label} is invalid.`);
  return value as T;
}
function unique(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}
function replace(values: string[], value: string) {
  values.splice(0, values.length, value);
}
