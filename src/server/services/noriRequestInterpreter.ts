import type { NoriConversationState, NoriIntent } from "../types/noriChat";

export type NoriRequestConstraints = {
  maxBudget: number | null;
  minProtein: number | null;
  maxCalories: number | null;
  maxFat: number | null;
  maxSugars: number | null;
  minFiber: number | null;
  maxSodium: number | null;
  maxCarbohydrates: number | null;
  partySize: number | null;
  afterTax: boolean;
  categories: string[];
  dietaryTags: string[];
  excludedIngredients: string[];
  preferredIngredients: string[];
  allergens: string[];
  spicy: boolean;
  kids: boolean;
  wantsDrink: boolean;
  drinkTemperature: "hot" | "cold" | null;
  wantsDessert: boolean;
  wantsLightMeal: boolean;
  wantsFillingMeal: boolean;
  wantsHandheldFood: boolean;
  wantsPostWorkoutMeal: boolean;
};

export type NoriRequestInterpretation = {
  intent: NoriIntent;
  isContinuation: boolean;
  referencesPreviousProduct: boolean;
  constraints: NoriRequestConstraints;
  clarificationNeeded: boolean;
  clarificationQuestion: string | null;
};

const CONTINUATION = /\b(also|and|keep it|same requirements|with that|under the same budget|too|add a drink)\b/;
const REFERENCE = /\b(it|this|that option|the first one|first option|selected item|that one)\b/;

export function interpretNoriRequest(message: string, state: NoriConversationState): NoriRequestInterpretation {
  const text = normalize(message, state.preferredLanguage);
  const isContinuation = CONTINUATION.test(text);
  const referencesPreviousProduct = REFERENCE.test(text);
  const mergesClarification = Boolean(state.awaitingConstraintClarification && state.clarificationState?.status === "answered");
  const persistentDietary = state.persistentDietaryPreferences ?? [];
  const dietaryTags = isContinuation || mergesClarification ? [...state.dietaryPreferences] : [...persistentDietary];
  if (/\bvegan\b|\bfully plant based\b/.test(text)) add(dietaryTags, "vegan");
  else if (/\bplant based\b/.test(text)) add(dietaryTags, "vegan");
  if (/\bvegetarian\b|\bvejetaryen\b|\b(i do not|i don't|dont) eat meat\b|\bdon't feel like eating meat\b/.test(text)) add(dietaryTags, "vegetarian");

  const maxBudget = number(text, /(?:budget(?:\s+is)?|have|with)\s*\$?\s*(\d+(?:\.\d+)?)/)
    ?? number(text, /(?:under|up to|max)\s*\$\s*(\d+(?:\.\d+)?)/)
    ?? (isContinuation ? state.maxBudget : state.maxBudget);
  const minProtein = number(text, /(?:at least|over|above|more than)?\s*(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:of\s*)?protein/)
    ?? number(text, /actually,?\s*(\d+(?:\.\d+)?)\s*g(?:rams?)?(?:\s*(?:of\s*)?protein)?\s+is enough/)
    ?? (/\b(after the gym|post workout|post-workout|high protein|high-protein|protein oranı yüksek|yüksek proteinli)\b/.test(text) ? 20 : isContinuation || mergesClarification ? state.minProtein : null);
  const maxCalories = number(text, /(?:under|max|below|less than)\s*(\d+(?:\.\d+)?)\s*(?:cal|calories)/)
    ?? (isContinuation || mergesClarification ? state.maxCalories : null);

  const categories: string[] = [];
  if (/\b(beef|cheese).*\bbun\b|\bbun.*\b(beef|cheese|pickles?)\b|\bburger\b/.test(text)) categories.push("burger");
  if (/\b(hot|warm)\s+(drink|beverage)|something warm to drink\b/.test(text)) categories.push("hot_drink");
  if (/\b(cold|iced)\s+(drink|beverage)|something cold to drink\b/.test(text)) categories.push("cold_drink");
  if (/\b(sweet|desserts?)\b/.test(text)) categories.push("dessert");
  if (/\b(light and fresh|light|fresh)\b/.test(text)) categories.push("salad", "healthy_bowl");
  if (/\b(kid|kids|child|children)\b/.test(text)) categories.push("kids_meal");
  if ((isContinuation || mergesClarification) && !categories.length && state.requestedCategory) categories.push(state.requestedCategory);

  const currentExclusions = ["beef", "cheese", "meat", "fried", "spicy"].filter(value =>
    new RegExp(`(?:no|not|without|except|avoid|don't want|do not want|don't feel like eating|nothing)\\s+(?:anything\\s+)?${value}`).test(text),
  );
  const excludedIngredients = [...new Set([...(state.excludedIngredients ?? []), ...currentExclusions])];
  const preferredIngredients = ["beef", "cheese", "pickles", "chicken", "avocado"].filter(value => text.includes(value) && !excludedIngredients.includes(value));
  const wantsHandheldFood = /\b(with my hands|handheld|hand held)\b/.test(text);
  const wantsFillingMeal = /\b(filling|hearty|substantial)\b/.test(text);
  if (wantsHandheldFood && wantsFillingMeal && !categories.length) categories.push("burger");
  const wantsLightMeal = /\b(light|fresh)\b/.test(text);
  const kids = /\b(kid|kids|child|children)\b/.test(text) || ((isContinuation || mergesClarification) && state.requestedKids);
  const spicy = /\b(spicy|chili|jalapeno|hot food|acılı|acı)\b/.test(text) || ((isContinuation || mergesClarification) && state.requestedSpicy);
  const wantsDrink = /\b(drinks?|beverages?|coffee|latte|juice|water)\b/.test(text) || ((isContinuation || mergesClarification) && state.requestedDrink);
  const wantsDessert = categories.includes("dessert") || ((isContinuation || mergesClarification) && state.requestedDessert);
  const ambiguousFilling = wantsFillingMeal && !wantsHandheldFood && !preferredIngredients.length && !categories.length;
  const ambiguousDrink = wantsDrink
    && !categories.some(category => category === "hot_drink" || category === "cold_drink")
    && /^(?:(?:i want|show me|give me|can i have)\s+)?(?:a|some)?\s*(?:drink|beverage)(?:\s+please)?[.!?]*$/.test(text);
  const clarificationNeeded = ambiguousFilling || ambiguousDrink;
  const clarificationQuestion = ambiguousDrink
    ? "Would you like a hot drink or a cold drink?"
    : ambiguousFilling
      ? "Would you prefer beef, chicken, or a plant-based option?"
      : null;

  return {
    intent: "recommendation",
    isContinuation,
    referencesPreviousProduct,
    constraints: {
      maxBudget,
      minProtein,
      maxCalories,
      maxFat: number(text, /(?:under|below|less than|max)\s*(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:of\s*)?fat/),
      maxSugars: number(text, /(?:under|below|less than|max)\s*(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:of\s*)?sugars?/) ?? (/low (?:in )?sugar/.test(text) ? Number.POSITIVE_INFINITY : null),
      minFiber: number(text, /(?:at least|over|above|more than)\s*(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:of\s*)?fiber/) ?? (/high fiber/.test(text) ? 0 : null),
      maxSodium: number(text, /(?:under|below|less than|max)\s*(\d+(?:\.\d+)?)\s*mg\s*(?:of\s*)?sodium/),
      maxCarbohydrates: number(text, /(?:under|below|less than|max)\s*(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:of\s*)?(?:carbs?|carbohydrates?)/),
      partySize: number(text.replace(/\b(two|three|four)\b/g, word => ({ two: "2", three: "3", four: "4" }[word] ?? word)), /(?:for|feed)\s+(\d+)\s*(?:people|persons?)/),
      afterTax: /\b(after tax|including tax)\b/.test(text) || ((isContinuation || mergesClarification) && Boolean(state.afterTaxBudget)),
      categories,
      dietaryTags: [...new Set(dietaryTags)],
      excludedIngredients,
      preferredIngredients,
      allergens: state.activeAllergens,
      spicy,
      kids,
      wantsDrink,
      drinkTemperature: categories.includes("hot_drink") ? "hot" : categories.includes("cold_drink") ? "cold" : null,
      wantsDessert,
      wantsLightMeal,
      wantsFillingMeal,
      wantsHandheldFood,
      wantsPostWorkoutMeal: /\b(after the gym|post workout|post-workout)\b/.test(text),
    },
    clarificationNeeded,
    clarificationQuestion,
  };
}

export function isStableDietaryStatement(message: string) {
  const text = normalize(message);
  return /\b(i am|i'm|im) vegan\b|\b(i am|i'm|im) vegetarian\b|\b(i do not|i don't|dont) eat meat\b/.test(text);
}

function normalize(value: string, language: NoriConversationState["preferredLanguage"] = "en") {
  return value.normalize("NFC").toLocaleLowerCase(language === "tr" ? "tr-TR" : "en-US").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}
function number(text: string, pattern: RegExp) { const match = text.match(pattern); return match ? Number(match[1]) : null; }
function add(values: string[], value: string) { if (!values.includes(value)) values.push(value); }
