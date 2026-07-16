import type { NoriConversationState, NoriIntent } from "../types/noriChat";

export type NoriRequestConstraints = {
  maxBudget: number | null;
  minProtein: number | null;
  maxCalories: number | null;
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
  const text = normalize(message);
  const isContinuation = CONTINUATION.test(text);
  const referencesPreviousProduct = REFERENCE.test(text);
  const persistentDietary = state.persistentDietaryPreferences ?? [];
  const dietaryTags = isContinuation ? [...state.dietaryPreferences] : [...persistentDietary];
  if (/\bvegan\b|\bfully plant based\b/.test(text)) add(dietaryTags, "vegan");
  else if (/\bplant based\b/.test(text)) add(dietaryTags, "vegan");
  if (/\bvegetarian\b|\b(i do not|i don't|dont) eat meat\b|\bdon't feel like eating meat\b/.test(text)) add(dietaryTags, "vegetarian");

  const maxBudget = number(text, /(?:budget|have|with)\s*\$?\s*(\d+(?:\.\d+)?)/)
    ?? number(text, /(?:under|up to|max)\s*\$\s*(\d+(?:\.\d+)?)/)
    ?? (isContinuation ? state.maxBudget : state.maxBudget);
  const minProtein = number(text, /(?:at least|over|above|more than)?\s*(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:of\s*)?protein/)
    ?? (/\b(after the gym|post workout|post-workout|high protein|high-protein)\b/.test(text) ? 20 : isContinuation ? state.minProtein : null);
  const maxCalories = number(text, /(?:under|max|below|less than)\s*(\d+(?:\.\d+)?)\s*(?:cal|calories)/)
    ?? (isContinuation ? state.maxCalories : null);

  const categories: string[] = [];
  if (/\b(beef|cheese).*\bbun\b|\bbun.*\b(beef|cheese|pickles?)\b|\bburger\b/.test(text)) categories.push("burger");
  if (/\b(hot|warm)\s+(drink|beverage)|something warm to drink\b/.test(text)) categories.push("hot_drink");
  if (/\b(cold|iced)\s+(drink|beverage)|something cold to drink\b/.test(text)) categories.push("cold_drink");
  if (/\b(sweet|desserts?)\b/.test(text)) categories.push("dessert");
  if (/\b(light and fresh|light|fresh)\b/.test(text)) categories.push("salad", "healthy_bowl");
  if (/\b(kid|kids|child|children)\b/.test(text)) categories.push("kids_meal");
  if (isContinuation && !categories.length && state.requestedCategory) categories.push(state.requestedCategory);

  const preferredIngredients = ["beef", "cheese", "pickles", "chicken", "avocado"].filter(value => text.includes(value));
  const excludedIngredients = /\b(no|not|don't want|do not want|without|anything)\s+(?:anything\s+)?fried\b/.test(text) || text.includes("don't want anything fried")
    ? ["fried"] : [];
  const wantsHandheldFood = /\b(with my hands|handheld|hand held)\b/.test(text);
  const wantsFillingMeal = /\b(filling|hearty|substantial)\b/.test(text);
  if (wantsHandheldFood && wantsFillingMeal && !categories.length) categories.push("burger");
  const wantsLightMeal = /\b(light|fresh)\b/.test(text);
  const kids = /\b(kid|kids|child|children)\b/.test(text) || (isContinuation && state.requestedKids);
  const spicy = /\b(spicy|chili|jalapeno|hot food)\b/.test(text) || (isContinuation && state.requestedSpicy);
  const wantsDrink = /\b(drinks?|beverages?|coffee|latte|juice|water)\b/.test(text) || (isContinuation && state.requestedDrink);
  const wantsDessert = categories.includes("dessert") || (isContinuation && state.requestedDessert);
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

function normalize(value: string) { return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim(); }
function number(text: string, pattern: RegExp) { const match = text.match(pattern); return match ? Number(match[1]) : null; }
function add(values: string[], value: string) { if (!values.includes(value)) values.push(value); }
