import { aiMenu, type AIFoodItem } from "./aiMenu";
import { cashierMenuCategories, cashierMenuImageManifest, cashierMenuImageReport, cashierMenuProductsMissingImages, type MenuImageEntry } from "./cashierMenuImages.generated";

export type CashierMenuProduct = AIFoodItem & { cashierCategory: string; needsConfiguration: boolean; sourcePath?: string };
const byId = new Map(aiMenu.filter(product => product.category !== "kids_meal").map(product => [product.id, product]));
const matchedIds = new Set<string>();
const imageManifest: readonly MenuImageEntry[] = cashierMenuImageManifest;

const configured: CashierMenuProduct[] = imageManifest.flatMap(entry => {
  const product = entry.productId ? byId.get(entry.productId) : undefined;
  if (!product) return [];
  matchedIds.add(product.id);
  return [{ ...product, image: entry.image, cashierCategory: entry.category, needsConfiguration: false, sourcePath: entry.sourcePath }];
});

const missingImageProducts: CashierMenuProduct[] = aiMenu.filter(product => product.category !== "kids_meal" && !matchedIds.has(product.id)).map(product => ({ ...product, image: "", cashierCategory: product.category, needsConfiguration: false }));
const unconfigured: CashierMenuProduct[] = import.meta.env.DEV ? imageManifest.filter(entry => entry.needsConfiguration).map(entry => ({ id: entry.id, name: entry.name, description: "Menu metadata is required before this item can be sold.", price: 0, available: false, inStock: false, spiceLevel: 0, category: entry.category, cashierCategory: entry.category, tags: [], dietaryTags: [], cal: 0, protein: "0g", proteinGrams: 0, nutrition: { calories:0, proteinGrams:0, carbohydratesGrams:0, totalFatGrams:0, saturatedFatGrams:0, sugarsGrams:0, addedSugarsGrams:0, fiberGrams:0, sodiumMilligrams:0, cholesterolMilligrams:0 }, image: entry.image, allergens: [], mayContain: [], crossContaminationPossible: [], allergenSafetyMessage: "", keywords: [], vectorTags: [], recommendedWith: [], ingredients: [], customizations: [], removableIngredients: [], customizationGroups: [], recommendationScore: 0, needsConfiguration: true, sourcePath: entry.sourcePath })) : [];

export const cashierMenu = [...configured, ...missingImageProducts, ...unconfigured];
export const cashierCategories = cashierMenuCategories;
export { cashierMenuImageReport, cashierMenuProductsMissingImages };
