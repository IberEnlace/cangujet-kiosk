import type {
  AIFoodItem,
  AINutrition,
  AIProductCustomizationGroup,
  AIProductCustomizationOption,
} from "../../app/data/aiMenu";
import type { NoriSelectedCustomization } from "../types/noriChat";

const SYNONYMS: Record<string, string[]> = {
  sauce: ["sauce", "dressing", "mayo", "mayonnaise"],
  cheese: ["cheese", "cheddar", "mozzarella", "parmesan", "vegan cheese"],
  bread: ["bread", "bun", "crust", "wrap"],
  milk: ["milk", "dairy", "cream", "yogurt", "oat milk"],
  spicy: ["spicy", "spice", "chili", "jalapeño", "jalapeno", "hot", "mild"],
  onion: ["onion", "onions", "red onion"],
  fries: ["fries", "chips", "potato side"],
  drink: ["drink", "beverage", "water"],
  sweetness: ["sugar", "sweet", "syrup", "half sweet", "no added sugar"],
};

export type CustomizationMatch = {
  product: AIFoodItem;
  group: AIProductCustomizationGroup;
  option: AIProductCustomizationOption;
  selection: NoriSelectedCustomization;
};

export function interpretCustomization(product: AIFoodItem, message: string): CustomizationMatch | null {
  const text = normalize(canonicalCustomizationRequest(message));
  const terms = expandTerms(text);
  const requestedConcept = Object.entries(SYNONYMS).find(([key, aliases]) => text.includes(key) || aliases.some(alias => text.includes(alias)))?.[0];
  if (!terms.length) return null;
  const requestedMode = modeWords(text);
  const removesBaseCheese = /\b(remove|without|no)\s+(?:the\s+)?(?:base\s+)?cheese\b/.test(text) && !/\b(no extra|remove extra)\s+cheese\b/.test(text);
  const matches = product.customizationGroups.flatMap(group =>
    group.options.map(option => ({ group, option })))
    .filter(({ group, option }) => {
      const searchable = normalize(`${group.id} ${group.name} ${option.id} ${option.name}`);
      if (requestedConcept && !conceptCompatible(requestedConcept, searchable)) return false;
      if (removesBaseCheese && /\bno extra cheese\b/.test(searchable)) return false;
      if (removesBaseCheese && searchable.includes("cheese") && !/\b(no cheese|without cheese|remove cheese)\b/.test(searchable)) return false;
      return terms.some(term => searchable.includes(term));
    })
    .sort((first, second) => optionScore(second.option, requestedMode, text) - optionScore(first.option, requestedMode, text));
  const match = matches[0];
  if (!match || optionScore(match.option, requestedMode, text) < 10) return null;
  const selection: NoriSelectedCustomization = {
    productId: product.id,
    groupId: match.group.id,
    optionId: match.option.id,
    optionName: match.option.name,
    priceAdjustment: match.option.priceAdjustment,
    nutritionAdjustment: match.option.nutritionAdjustment,
    allergensAdded: match.option.allergensAdded,
    allergensRemoved: match.option.allergensRemoved,
  };
  return { product, ...match, selection };
}

export function calculateCustomizedProduct(
  product: AIFoodItem,
  selectedCustomizations: NoriSelectedCustomization[],
) {
  const applied = selectedCustomizations.filter(selection => selection.productId === product.id);
  const adjustedNutrition = applied.reduce(
    (nutrition, selection) => addNutrition(nutrition, selection.nutritionAdjustment),
    product.nutrition,
  );
  const adjustedAllergens = new Set(product.allergens.map(normalize));
  for (const selection of applied) {
    selection.allergensRemoved.forEach(allergen => adjustedAllergens.delete(normalize(allergen)));
    selection.allergensAdded.forEach(allergen => adjustedAllergens.add(normalize(allergen)));
  }
  const adjustedPrice = Math.max(0, product.price + applied.reduce((sum, selection) => sum + selection.priceAdjustment, 0));
  return {
    basePrice: product.price,
    adjustedPrice,
    baseNutrition: product.nutrition,
    adjustedNutrition,
    baseAllergens: product.allergens,
    adjustedAllergens: [...adjustedAllergens],
    crossContactWarnings: [...new Set([...product.mayContain, ...product.crossContaminationPossible])],
    appliedCustomizations: applied,
  };
}

export function validateSelectedCustomizations(product: AIFoodItem, selections: NoriSelectedCustomization[]) {
  return selections.every(selection => {
    if (selection.productId !== product.id) return false;
    if (selection.groupId === "removable-ingredients") {
      return product.removableIngredients.some(ingredient => selection.optionId === `no-${normalize(ingredient).replace(/\s+/g, "-")}`);
    }
    const group = product.customizationGroups.find(item => item.id === selection.groupId);
    return Boolean(group?.options.some(option => option.id === selection.optionId && option.available));
  });
}

function addNutrition(base: AINutrition, adjustment: AINutrition): AINutrition {
  return {
    calories: nonNegative(base.calories + adjustment.calories),
    proteinGrams: nonNegative(base.proteinGrams + adjustment.proteinGrams),
    carbohydratesGrams: nonNegative(base.carbohydratesGrams + adjustment.carbohydratesGrams),
    totalFatGrams: nonNegative(base.totalFatGrams + adjustment.totalFatGrams),
    saturatedFatGrams: nonNegative(base.saturatedFatGrams + adjustment.saturatedFatGrams),
    sugarsGrams: nonNegative(base.sugarsGrams + adjustment.sugarsGrams),
    addedSugarsGrams: nonNegative(base.addedSugarsGrams + adjustment.addedSugarsGrams),
    fiberGrams: nonNegative(base.fiberGrams + adjustment.fiberGrams),
    sodiumMilligrams: nonNegative(base.sodiumMilligrams + adjustment.sodiumMilligrams),
    cholesterolMilligrams: nonNegative(base.cholesterolMilligrams + adjustment.cholesterolMilligrams),
  };
}
function expandTerms(text: string) {
  const found = Object.entries(SYNONYMS).find(([key, aliases]) => text.includes(key) || aliases.some(alias => text.includes(alias)));
  const meaningful = text.split(" ").filter(term =>
    term.length > 3 && !["make", "change", "replace", "with", "from", "please"].includes(term));
  if (found) {
    const contextual = found[0] === "spicy" && (text.includes("mild") || text.includes("less spicy")) ? ["sauce"] : [];
    return [...new Set([found[0], ...found[1], ...meaningful, ...contextual])].map(normalize);
  }
  return meaningful;
}
function modeWords(text: string) {
  return ["no", "remove", "without", "side", "extra", "double", "mild", "less", "large", "small", "half", "gluten free", "oat", "light", "water", "lettuce", "fruit", "tofu"]
    .filter(word => text.includes(word));
}
function optionScore(option: AIProductCustomizationOption, modes: string[], request: string) {
  const text = normalize(`${option.id} ${option.name}`);
  let score = modes.reduce((total, mode) => total + (text.includes(mode) ? 10 : 0), 0);
  if (request.includes(normalize(option.name)) || request.includes(normalize(option.id))) score += 50;
  for (const token of request.split(" ").filter(token => token.length > 3)) if (text.includes(token)) score += 4;
  if ((request.includes("extra") || request.includes("double")) && text.includes("no ")) score -= 30;
  if ((request.includes("remove") || request.includes("without") || request.startsWith("no ")) && text.includes("no ")) score += 25;
  if ((request.includes("mild") || request.includes("less spicy")) && text.includes("light sauce")) score += 30;
  return score;
}

function canonicalCustomizationRequest(message: string) {
  const text = message.normalize("NFC").toLocaleLowerCase("tr-TR");
  return text
    .replace(/peyniri çıkar/g, "remove cheese")
    .replace(/soğansız olsun/g, "no onions")
    .replace(/ekstra peynir ekle/g, "extra cheese")
    .replace(/sosu çıkar/g, "remove sauce")
    .replace(/büyük boy yap/g, "large size")
    .replace(/acısı az olsun/g, "make it less spicy");
}
function conceptCompatible(concept: string, searchable: string) {
  if ([concept, ...(SYNONYMS[concept] ?? [])].some(term => searchable.includes(normalize(term)))) return true;
  if (concept === "fries" && /\b(side|fruit|salad)\b/.test(searchable)) return true;
  if (concept === "spicy" && /\b(sauce|mild|light)\b/.test(searchable)) return true;
  return false;
}
function nonNegative(value: number) { return Math.max(0, value); }
function normalize(value: string) { return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim(); }
