import type { AIFoodItem } from "../../app/data/aiMenu";
import { checkProductAllergens } from "../../app/services/noriMenuEngine";
import type { NoriRequestConstraints } from "./noriRequestInterpreter";

export type NoriValidationReason = "over_budget" | "below_min_protein" | "above_max_calories" | "above_max_fat" | "above_max_sugar" | "below_min_fiber" | "above_max_sodium" | "above_max_carbohydrates" | "wrong_category" | "excluded_ingredient" | "dietary_conflict" | "direct_allergen" | "unavailable";

export function validateNoriCandidate(product: AIFoodItem, constraints: NoriRequestConstraints): NoriValidationReason[] {
  const reasons: NoriValidationReason[] = [];
  if (!product.available || !product.inStock) reasons.push("unavailable");
  if (constraints.maxBudget !== null && product.price > constraints.maxBudget) reasons.push("over_budget");
  if (constraints.minProtein !== null && product.proteinGrams < constraints.minProtein) reasons.push("below_min_protein");
  if (constraints.maxCalories !== null && product.cal >= constraints.maxCalories) reasons.push("above_max_calories");
  if (constraints.maxFat !== null && product.nutrition.totalFatGrams >= constraints.maxFat) reasons.push("above_max_fat");
  if (constraints.maxSugars !== null && product.nutrition.sugarsGrams >= constraints.maxSugars) reasons.push("above_max_sugar");
  if (constraints.minFiber !== null && product.nutrition.fiberGrams < constraints.minFiber) reasons.push("below_min_fiber");
  if (constraints.maxSodium !== null && product.nutrition.sodiumMilligrams >= constraints.maxSodium) reasons.push("above_max_sodium");
  if (constraints.maxCarbohydrates !== null && product.nutrition.carbohydratesGrams >= constraints.maxCarbohydrates) reasons.push("above_max_carbohydrates");
  if (constraints.categories.length && !constraints.categories.includes(product.category)) reasons.push("wrong_category");
  if (constraints.dietaryTags.some(tag => !product.dietaryTags.includes(tag) && !(tag === "vegetarian" && product.dietaryTags.includes("vegan")))) reasons.push("dietary_conflict");
  const haystack = [product.description, ...product.ingredients, ...product.keywords, ...product.vectorTags].join(" ").toLowerCase();
  if (constraints.excludedIngredients.some(value => haystack.includes(value.toLowerCase()))) reasons.push("excluded_ingredient");
  if (checkProductAllergens(product, constraints.allergens).contains.length) reasons.push("direct_allergen");
  return [...new Set(reasons)];
}

export function validateNoriCandidates(products: AIFoodItem[], constraints: NoriRequestConstraints) {
  const rejected: Array<{ product: AIFoodItem; reasons: NoriValidationReason[] }> = [];
  const valid = products.filter(product => {
    const reasons = validateNoriCandidate(product, constraints);
    if (reasons.length) rejected.push({ product, reasons });
    return reasons.length === 0;
  });
  return { valid, rejected };
}
