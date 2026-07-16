import { aiMenu, supportedAllergens, type AIFoodItem } from "../data/aiMenu";

export type AllergenCheck = {
  product: AIFoodItem;
  contains: string[];
  mayContain: string[];
  crossContact: string[];
  hasRisk: boolean;
};

export type RecommendationFilters = {
  query?: string;
  maxPrice?: number;
  minProtein?: number;
  maxCalories?: number;
  dietaryTags?: string[];
  category?: string;
  keyword?: string;
  allergens?: string[];
  spicy?: boolean;
  kids?: boolean;
  limit?: number;
};

export type NoriQueryResult = {
  response: string;
  recommendations: AIFoodItem[];
  allergiesFlagged: string[];
  upsellItem?: AIFoodItem;
};

const DEFAULT_LIMIT = 4;
const normalizedSupportedAllergens = supportedAllergens.map(normalize);

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function ranked(products: AIFoodItem[], limit?: number): AIFoodItem[] {
  const sorted = [...products].sort((first, second) => second.recommendationScore - first.recommendationScore);
  return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
}

function productText(product: AIFoodItem): string {
  return normalize([
    product.id,
    product.name,
    product.description,
    product.category,
    ...product.dietaryTags,
    ...product.keywords,
    ...product.vectorTags,
  ].join(" "));
}

function matchesTag(product: AIFoodItem, tag: string): boolean {
  const target = normalize(tag);
  return product.dietaryTags.some(value => normalize(value) === target)
    || product.keywords.some(value => normalize(value).includes(target))
    || product.vectorTags.some(value => normalize(value).includes(target));
}

function matchingAllergens(values: string[], allergens: string[]): string[] {
  const normalizedValues = values.map(normalize);
  return allergens.filter(allergen => normalizedValues.includes(normalize(allergen)));
}

function parseNumber(query: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = normalize(query).match(pattern);
    if (match?.[1]) return Number(match[1]);
  }
  return undefined;
}

function detectAllergens(query: string): string[] {
  const normalizedQuery = normalize(query);
  return supportedAllergens.filter(allergen => {
    const normalized = normalize(allergen);
    const aliases = normalized === "tree nuts" ? ["tree nuts", "nuts"]
      : normalized === "milk" ? ["milk", "dairy"]
      : normalized === "gluten" ? ["gluten"]
      : normalized === "wheat" ? ["wheat"]
      : [normalized];
    return aliases.some(alias => normalizedQuery.includes(alias));
  });
}

function findUpsell(recommendations: AIFoodItem[], allergens: string[]): AIFoodItem | undefined {
  const recommendedIds = recommendations.flatMap(product => product.recommendedWith);
  const linked = aiMenu.filter(product => recommendedIds.includes(product.id));
  const candidates = linked.length > 0
    ? linked
    : aiMenu.filter(product => ["side", "cold_drink", "hot_drink"].includes(product.category));
  return ranked(candidates.filter(product => !recommendations.some(item => item.id === product.id))
    .filter(product => !checkProductAllergens(product, allergens).hasRisk), 1)[0];
}

export function searchProducts(query: string): AIFoodItem[] {
  const terms = normalize(query).split(" ").filter(term => term.length > 1);
  if (terms.length === 0) return [];
  return ranked(aiMenu.filter(product => {
    const text = productText(product);
    return terms.some(term => text.includes(term));
  }));
}

export function findByBudget(maxPrice: number): AIFoodItem[] {
  return ranked(aiMenu.filter(product => product.price <= maxPrice));
}

export function findHighProtein(minProtein = 20): AIFoodItem[] {
  return ranked(aiMenu.filter(product => product.proteinGrams >= minProtein));
}

export function findHealthyMeals(maxCalories = 600): AIFoodItem[] {
  return ranked(aiMenu.filter(product =>
    product.cal <= maxCalories
    && (matchesTag(product, "healthy") || matchesTag(product, "high-fiber") || matchesTag(product, "lower-saturated-fat")),
  ));
}

export function findVeganMeals(): AIFoodItem[] {
  return ranked(aiMenu.filter(product => matchesTag(product, "vegan")));
}

export function findVegetarianMeals(): AIFoodItem[] {
  return ranked(aiMenu.filter(product => matchesTag(product, "vegetarian")));
}

export function findKidsMeals(): AIFoodItem[] {
  return ranked(aiMenu.filter(product => product.category === "kids_meal" || matchesTag(product, "kids")));
}

export function findSpicyMeals(): AIFoodItem[] {
  return ranked(aiMenu.filter(product => matchesTag(product, "spicy")));
}

export function findByCategory(category: string): AIFoodItem[] {
  const normalizedCategory = normalize(category);
  return ranked(aiMenu.filter(product => normalize(product.category) === normalizedCategory));
}

export function findByKeyword(keyword: string): AIFoodItem[] {
  const target = normalize(keyword);
  return ranked(aiMenu.filter(product =>
    product.keywords.some(value => normalize(value).includes(target))
    || product.vectorTags.some(value => normalize(value).includes(target)),
  ));
}

export function checkProductAllergens(product: AIFoodItem, allergens: string[]): AllergenCheck {
  const contains = matchingAllergens(product.allergens, allergens);
  const mayContain = matchingAllergens(product.mayContain, allergens);
  const crossContact = matchingAllergens(product.crossContaminationPossible, allergens);
  return { product, contains, mayContain, crossContact, hasRisk: contains.length + mayContain.length + crossContact.length > 0 };
}

export function checkAllergens(allergens: string[]): AllergenCheck[] {
  return ranked(aiMenu).map(product => checkProductAllergens(product, allergens));
}

export function recommendProducts(filters: RecommendationFilters): AIFoodItem[] {
  let products = filters.query ? searchProducts(filters.query) : [...aiMenu];
  if (filters.maxPrice !== undefined) products = products.filter(product => product.price <= filters.maxPrice!);
  if (filters.minProtein !== undefined) products = products.filter(product => product.proteinGrams >= filters.minProtein!);
  if (filters.maxCalories !== undefined) products = products.filter(product => product.cal <= filters.maxCalories!);
  if (filters.category) products = products.filter(product => normalize(product.category) === normalize(filters.category!));
  if (filters.keyword) products = products.filter(product => productText(product).includes(normalize(filters.keyword!)));
  if (filters.dietaryTags?.length) products = products.filter(product => filters.dietaryTags!.every(tag => matchesTag(product, tag)));
  if (filters.spicy) products = products.filter(product => matchesTag(product, "spicy"));
  if (filters.kids) products = products.filter(product => product.category === "kids_meal" || matchesTag(product, "kids"));
  if (filters.allergens?.length) products = products.filter(product => !checkProductAllergens(product, filters.allergens!).hasRisk);
  return ranked(products, filters.limit ?? DEFAULT_LIMIT);
}

export function answerMenuQuery(query: string, activeAllergens: string[] = []): NoriQueryResult {
  const normalizedQuery = normalize(query);
  const allergiesFlagged = [...new Set([...activeAllergens, ...detectAllergens(query)])];
  const maxPrice = parseNumber(query, [/(?:under|below|less than|max|budget)\s*\$?(\d+(?:\.\d+)?)/, /\$(\d+(?:\.\d+)?)/]);
  const minProtein = parseNumber(query, [/(\d+(?:\.\d+)?)\s*(?:g|grams?)\s*(?:of\s*)?protein/]);
  const maxCalories = parseNumber(query, [/(?:under|below|less than|max)\s*(\d+(?:\.\d+)?)\s*(?:cal|calories)/]);

  const dietaryTags: string[] = [];
  if (normalizedQuery.includes("vegan")) dietaryTags.push("vegan");
  else if (normalizedQuery.includes("vegetarian")) dietaryTags.push("vegetarian");

  const wantsProtein = normalizedQuery.includes("protein") || normalizedQuery.includes("gym");
  const wantsHealthy = normalizedQuery.includes("healthy") || normalizedQuery.includes("diet") || normalizedQuery.includes("fit");
  const wantsKids = normalizedQuery.includes("kid") || normalizedQuery.includes("child");
  const wantsSpicy = normalizedQuery.includes("spicy") || normalizedQuery.includes("hot");

  const filters: RecommendationFilters = {
    maxPrice,
    minProtein: wantsProtein ? minProtein ?? 20 : undefined,
    maxCalories: wantsHealthy ? maxCalories ?? 600 : maxCalories,
    dietaryTags,
    spicy: wantsSpicy,
    kids: wantsKids,
    limit: DEFAULT_LIMIT,
  };

  let recommendations = recommendProducts(filters);
  if (!maxPrice && !wantsProtein && !wantsHealthy && !wantsKids && !wantsSpicy && dietaryTags.length === 0) {
    recommendations = searchProducts(query).slice(0, DEFAULT_LIMIT);
  }
  if (recommendations.length === 0) recommendations = ranked(aiMenu, 2);

  const riskCount = recommendations.filter(product => checkProductAllergens(product, allergiesFlagged).hasRisk).length;
  const criteria = [
    maxPrice !== undefined ? `within $${maxPrice.toFixed(2)}` : "",
    wantsProtein ? `with at least ${filters.minProtein}g protein` : "",
    filters.maxCalories !== undefined ? `under ${filters.maxCalories} calories` : "",
    dietaryTags[0] ? `matching ${dietaryTags[0]} preferences` : "",
    wantsKids ? "from the kids selection" : "",
    wantsSpicy ? "with spicy menu tags" : "",
  ].filter(Boolean).join(", ");

  const response = recommendations.length > 0
    ? `I found ${recommendations.length} available menu option${recommendations.length === 1 ? "" : "s"}${criteria ? ` ${criteria}` : ""}.${riskCount > 0 ? " Some results have an allergen or cross-contact risk you selected; review the warnings before adding them." : ""}`
    : "I could not find an available menu item matching those filters. Try changing the budget or dietary requirements.";

  return {
    response,
    recommendations,
    allergiesFlagged,
    upsellItem: findUpsell(recommendations, allergiesFlagged),
  };
}

export const noriMenuProducts = aiMenu;
export const noriSupportedAllergens = normalizedSupportedAllergens;
