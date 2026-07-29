import type { NoriConversationState, NoriIntent, NoriRankingPriority } from "../types/noriChat";
import { extractNoriUnderstanding } from "./noriUnderstandingService";

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
  priorities: NoriRankingPriority[];
  preferredFlavors: string[];
  needsQuickService: boolean;
  asksMostOrdered: boolean;
};

export type NoriRequestInterpretation = {
  intent: NoriIntent;
  understandingSource?: "deterministic" | "hybrid";
  isContinuation: boolean;
  referencesPreviousProduct: boolean;
  constraints: NoriRequestConstraints;
  clarificationNeeded: boolean;
  clarificationQuestion: string | null;
};

const CONTINUATION = /\b(also|and|keep it|same requirements|with that|under the same budget|too|add a drink|more protein|cheaper|less expensive|lighter|healthier|daha fazla protein|daha ucuz|biraz daha proteinli|daha proteinli|daha hafif|daha sağlıklı)\b/;
const REFERENCE = /\b(it|this|that option|the first one|first option|selected item|that one)\b/;

const TURKISH_INGREDIENT_ALIASES: Readonly<Record<string, string>> = {
  mantar: "mushrooms",
  mantarlar: "mushrooms",
  peynir: "cheese",
  soğan: "onion",
  soğanlı: "onion",
  et: "meat",
  acı: "spicy",
  acılı: "spicy",
  kızarmış: "fried",
};

export function interpretNoriRequest(message: string, state: NoriConversationState): NoriRequestInterpretation {
  const text = normalize(message, state.preferredLanguage);
  const signals = extractNoriUnderstanding(message, state.preferredLanguage, state);
  const contextualRefinement = Boolean(state.recentRecommendationContext)
    && signals.isRefinement;
  const isContinuation = CONTINUATION.test(text) || contextualRefinement || signals.refersToPreviousRecommendations;
  const referencesPreviousProduct = REFERENCE.test(text) || signals.refersToLastProduct;
  const mergesClarification = Boolean(state.awaitingConstraintClarification && state.clarificationState?.status === "answered");
  const persistentDietary = state.persistentDietaryPreferences ?? [];
  const dietaryTags = isContinuation || mergesClarification ? [...state.dietaryPreferences] : [...persistentDietary];
  if (/\bvegan\b|\bfully plant based\b/.test(text)) add(dietaryTags, "vegan");
  else if (/\bplant based\b/.test(text)) add(dietaryTags, "vegan");
  if (/\bvegetarian\b|\bvejetaryen\b|\b(i do not|i don't|dont) eat meat\b|\bdon't feel like (?:eating )?meat\b|\bbugün sadece vejetaryen\b/.test(text)) add(dietaryTags, "vegetarian");
  signals.dietaryTags.forEach(tag => add(dietaryTags, tag));

  const maxBudget = number(text, /(?:budget(?:\s+is)?|(?:only\s+)?have|with)\s*[$€£]?\s*(\d+(?:[.,]\d+)?)/)
    ?? number(text, /(?:under|up to|max|below)\s*[$€£]\s*(\d+(?:[.,]\d+)?)/)
    ?? number(text, /(?:under|up to|max|below)\s*(\d+(?:[.,]\d+)?)\s*(?:euros?|dollars?|pounds?)/)
    ?? number(text, /(?:sadece\s+)?(\d+(?:[.,]\d+)?)\s*(?:avro|euro|dolar|lira)(?:m|lık)?\s*(?:var|bütçem var)?/)
    ?? (isContinuation ? state.maxBudget : state.maxBudget);
  const minProtein = number(text, /(?:at least|over|above|more than)?\s*(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:of\s*)?protein/)
    ?? number(text, /actually,?\s*(\d+(?:\.\d+)?)\s*g(?:rams?)?(?:\s*(?:of\s*)?protein)?\s+is enough/)
    ?? (isContinuation || mergesClarification ? state.minProtein : null);
  const maxCalories = number(text, /(?:under|max|below|less than)\s*(\d+(?:\.\d+)?)\s*(?:cal|calories)/)
    ?? (isContinuation || mergesClarification ? state.maxCalories : null);

  const categories: string[] = [];
  if (/\b(beef|cheese).*\bbun\b|\bbun.*\b(beef|cheese|pickles?)\b|\bburger\b/.test(text)) categories.push("burger");
  if (/\bpizza\b/.test(text)) categories.push("pizza");
  if (/\bpasta\b/.test(text)) categories.push("pasta");
  if (/\bsalad\b|\bsalata\b/.test(text)) categories.push("salad");
  if (/\b(hot|warm)\s+(drink|beverage)|something warm to drink\b/.test(text)) categories.push("hot_drink");
  if (/\b(cold|iced)\s+(drink|beverage)|something cold to drink\b/.test(text)) categories.push("cold_drink");
  if (/\b(sweet|desserts?|tatlı)\b/.test(text)) categories.push("dessert");
  if (/\b(light and fresh|light meal|something light|not (?:too )?heavy|(?:don't|do not) want something heavy|hafif|ağır bir şey istemiyorum)\b/.test(text)) categories.push("salad", "healthy_bowl");
  if (/\b(kid|kids|child|children|çocuk|çocuklarım)\b/.test(text)) categories.push("kids_meal");
  categories.push(...signals.categories);
  if (signals.kids) categories.push("kids_meal");
  if ((isContinuation || mergesClarification) && !categories.length && state.requestedCategory) categories.push(state.requestedCategory);

  const currentExclusions = ["beef", "cheese", "meat", "fried", "spicy"].filter(value =>
    new RegExp(`(?:no|not|without|except|avoid|don't want|do not want|don't feel like(?: eating)?|nothing)\\s+(?:anything\\s+)?${value}`).test(text),
  );
  currentExclusions.push(...extractDislikedIngredients(text));
  currentExclusions.push(...signals.excludedIngredients);
  const rememberedExclusions = state.preferenceMemory?.dislikedIngredients ?? state.excludedIngredients ?? [];
  const excludedIngredients = [...new Set([...rememberedExclusions, ...currentExclusions].map(canonicalIngredient))];
  const preferredIngredients = ["beef", "cheese", "pickles", "chicken", "avocado"].filter(value => text.includes(value) && !excludedIngredients.includes(value));
  if (/\btavuk\b/.test(text) && !excludedIngredients.includes("chicken")) preferredIngredients.push("chicken");
  if (/\bdana(?: eti)?\b/.test(text) && !excludedIngredients.includes("beef")) preferredIngredients.push("beef");
  const wantsHandheldFood = /\b(with my hands|handheld|hand held)\b/.test(text);
  const hungerExpression = /\b(very hungry|really hungry|starving|famished)\b/.test(text)
    || text.includes("çok açım")
    || text.includes("karnım çok aç");
  const wantsFillingMeal = hungerExpression
    || signals.priorities.includes("filling")
    || /\b(filling|hearty|substantial|doyurucu|tok tutan)\b/.test(text);
  if (wantsHandheldFood && wantsFillingMeal && !categories.length) categories.push("burger");
  const wantsLightMeal = signals.priorities.includes("light")
    || /\b(light|not (?:too )?heavy|(?:don't|do not) want something heavy|hafif|ağır bir şey istemiyorum)\b/.test(text);
  const kids = signals.kids || /\b(kid|kids|child|children|çocuk|çocuklarım)\b/.test(text) || ((isContinuation || mergesClarification) && state.requestedKids);
  const avoidsSpicy = excludedIngredients.includes("spicy") || Boolean(state.preferenceMemory?.avoidSpicy);
  const spicy = !avoidsSpicy && (signals.spicy || /\b(spicy|chili|jalapeno|hot food|acılı)\b/.test(text) || ((isContinuation || mergesClarification) && state.requestedSpicy));
  const wantsDrink = signals.wantsDrink || /\b(drinks?|beverages?|coffee|latte|juice|water|içecek|kahve|meyve suyu)\b/.test(text) || ((isContinuation || mergesClarification) && state.requestedDrink);
  const wantsDessert = categories.includes("dessert") || ((isContinuation || mergesClarification) && state.requestedDessert);
  const incomingPriorities = mergePriorities(semanticPriorities(text), signals.priorities);
  const priorities = isContinuation || mergesClarification
    ? mergePriorities(state.rankingPriorities ?? [], incomingPriorities)
    : incomingPriorities;
  const preferredFlavors = mergeUnique(
    isContinuation || mergesClarification ? state.preferredFlavors ?? [] : [],
    flavorPreferences(text),
  );
  const clarification = state.clarificationState;
  if (mergesClarification && clarification?.clarificationType === "drink_temperature") {
    if (/^(cold|iced|soğuk)/.test(text)) replaceCategories(categories, "cold_drink");
    if (/^(hot|warm|sıcak)/.test(text)) replaceCategories(categories, "hot_drink");
  }
  const ambiguousDrink = wantsDrink
    && !categories.some(category => category === "hot_drink" || category === "cold_drink")
    && /^(?:(?:i want|show me|give me|can i have)\s+)?(?:a|some)?\s*(?:drink|beverage)(?:\s+please)?[.!?]*$|^(?:bir\s+)?içecek(?:\s+istiyorum)?[.!?]*$/.test(text);
  const clarificationNeeded = ambiguousDrink;
  const clarificationQuestion = ambiguousDrink
    ? "Would you like a hot drink or a cold drink?"
    : null;

  return {
    intent: "recommendation",
    understandingSource: "deterministic",
    isContinuation,
    referencesPreviousProduct,
    constraints: {
      maxBudget,
      minProtein,
      maxCalories,
      maxFat: number(text, /(?:under|below|less than|max)\s*(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:of\s*)?fat/),
      maxSugars: number(text, /(?:under|below|less than|max)\s*(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:of\s*)?sugars?/)
        ?? (signals.excludedIngredients.includes("sugar") ? 0 : /low (?:in )?sugar/.test(text) ? Number.POSITIVE_INFINITY : null),
      minFiber: number(text, /(?:at least|over|above|more than)\s*(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:of\s*)?fiber/) ?? (/high fiber/.test(text) ? 0 : null),
      maxSodium: number(text, /(?:under|below|less than|max)\s*(\d+(?:\.\d+)?)\s*mg\s*(?:of\s*)?sodium/),
      maxCarbohydrates: number(text, /(?:under|below|less than|max)\s*(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:of\s*)?(?:carbs?|carbohydrates?)/),
      partySize: number(text.replace(/\b(two|three|four)\b/g, word => ({ two: "2", three: "3", four: "4" }[word] ?? word)), /(?:for|feed)\s+(\d+)\s*(?:people|persons?)/),
      afterTax: /\b(after tax|including tax)\b/.test(text) || ((isContinuation || mergesClarification) && Boolean(state.afterTaxBudget)),
      categories: [...new Set(categories)],
      dietaryTags: [...new Set(dietaryTags)],
      excludedIngredients,
      preferredIngredients,
      allergens: [...new Set([...state.activeAllergens, ...signals.allergens])],
      spicy,
      kids,
      wantsDrink,
      drinkTemperature: signals.drinkTemperature ?? (categories.includes("hot_drink") ? "hot" : categories.includes("cold_drink") ? "cold" : null),
      wantsDessert,
      wantsLightMeal,
      wantsFillingMeal,
      wantsHandheldFood,
      wantsPostWorkoutMeal: signals.priorities.includes("protein")
        && /gym|workout|spor|antrenman/u.test(text),
      priorities,
      preferredFlavors,
      needsQuickService: priorities.includes("quick"),
      asksMostOrdered: /\b(most ordered|best selling|bestseller|en çok sipariş|en çok satan)\b/.test(text),
    },
    clarificationNeeded,
    clarificationQuestion,
  };
}

export function isStableDietaryStatement(message: string) {
  const text = normalize(message);
  return /\b(i am|i'm|im|only)\s+(?:vegan|vegetarian)\b|\b(i do not|i don't|dont) eat meat\b|\bdon't feel like (?:eating )?meat\b|\bbugün sadece vejetaryen\b|\bveganım\b|\bvejetaryenim\b|et yemiyorum|etsiz/u.test(text);
}

export function isStableIngredientPreference(message: string) {
  const text = normalize(message);
  return extractDislikedIngredients(text).length > 0
    || extractNoriUnderstanding(message, "tr").excludedIngredients.length > 0
    || extractNoriUnderstanding(message, "en").excludedIngredients.length > 0;
}

export function turkishRecommendationSignals(value: string) {
  const signals = extractNoriUnderstanding(value, "tr");
  return {
    highProtein: signals.priorities.includes("protein"),
    affordable: signals.priorities.includes("price"),
    recommendationCue: signals.recommendationCue,
  };
}

function normalize(value: string, language: NoriConversationState["preferredLanguage"] = "en") {
  return value.normalize("NFC").toLocaleLowerCase(language === "tr" ? "tr-TR" : "en-US").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}
function number(text: string, pattern: RegExp) { const match = text.match(pattern); return match ? Number(match[1].replace(",", ".")) : null; }
function add(values: string[], value: string) { if (!values.includes(value)) values.push(value); }

function semanticPriorities(text: string): NoriRankingPriority[] {
  const priorities: NoriRankingPriority[] = [];
  const turkishSignals = turkishRecommendationSignals(text);
  if (/\b(more protein|high protein|gym|workout|going to the gym|spora gidiyorum)\b/.test(text) || turkishSignals.highProtein) priorities.push("protein");
  if (/\b(cheaper|less expensive|affordable|budget friendly)\b/.test(text) || turkishSignals.affordable) priorities.push("price");
  if (/\b(on a diet|dieting|healthy|healthier|balanced|nutritious|diyetteyim|sağlıklı|dengeli)\b/.test(text)) priorities.push("healthy");
  if (/\b(light|lighter|not (?:too )?heavy|(?:don't|do not) want something heavy|hafif|ağır bir şey istemiyorum|daha hafif)\b/.test(text)) priorities.push("light");
  if (/\b(very hungry|really hungry|starving|famished|filling|hearty|substantial|çok açım|karnım çok aç|doyurucu|tok tutan)\b/.test(text)) priorities.push("filling");
  if (/\b(refreshing|cooling|something fresh|ferahlatıcı|serinletici)\b/.test(text)) priorities.push("refreshing");
  if (/\b(popular|most ordered|best selling|bestseller|your favorite|what's your favorite|todays? best|today's best|best choice|not sure|emin değilim|kararsızım|en çok sipariş|en çok satan|favorin)\b/.test(text)) priorities.push("popular");
  if (/\b(in a hurry|in a rush|something quick|quickly|fastest|acelem var|hızlı|çabuk)\b/.test(text)) priorities.push("quick");
  return [...new Set(priorities)];
}

function extractDislikedIngredients(text: string) {
  const values: string[] = [];
  const english = text.match(/\b(?:i (?:really )?(?:don't|do not) like|i dislike|never recommend|avoid|nothing with)\s+([a-z][a-z -]{1,40}?)(?:\s+(?:again|please|today))?[.!?]*$/);
  if (english?.[1]) values.push(english[1]);
  for (const ingredient of ["beef", "cheese", "meat", "fried", "spicy"]) {
    if (new RegExp(`(?:no|not|without|avoid|don't want|do not want|don't feel like(?: eating)?|nothing)\\s+(?:anything\\s+)?${ingredient}`).test(text)) {
      values.push(ingredient);
    }
  }
  for (const [alias, canonical] of Object.entries(TURKISH_INGREDIENT_ALIASES)) {
    if ((text.includes(`${alias} sevmiyorum`) || text.includes(`${alias} istemiyorum`) || text.includes(`${alias} olmasın`))) {
      values.push(canonical);
    }
  }
  if (/\bno spicy food\b|\bnot spicy\b|\bacılı olmasın\b/.test(text)) values.push("spicy");
  return values.map(canonicalIngredient).filter(Boolean);
}

function canonicalIngredient(value: string) {
  const cleaned = normalize(value)
    .replace(/^(?:any|anything with|the)\s+/, "")
    .replace(/\s+(?:food|foods|ingredient|ingredients)$/, "")
    .trim();
  return TURKISH_INGREDIENT_ALIASES[cleaned] ?? cleaned;
}

function flavorPreferences(text: string) {
  const flavors: string[] = [];
  if (/\b(chocolate|cocoa|mocha|çikolata)\b/.test(text)) flavors.push("chocolate");
  if (/\b(fruit|fruity|berries|berry|mango|meyve|meyveli)\b/.test(text)) flavors.push("fruit");
  return flavors;
}

function mergePriorities(current: NoriRankingPriority[], incoming: NoriRankingPriority[]) {
  return [...new Set([...incoming, ...current])];
}

function mergeUnique(current: string[], incoming: string[]) {
  return [...new Set([...current, ...incoming])];
}

function replaceCategories(categories: string[], category: string) {
  categories.splice(0, categories.length, category);
}
