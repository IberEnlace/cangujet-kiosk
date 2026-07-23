import menuCatalog from "./morrow-menu-ai.json";
import type { NormalizedMenuProduct } from "../services/supabase/menuModels";

type CatalogProduct = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  available: boolean;
  inStock: boolean;
  spiceLevel: number;
  image: string;
  dietaryTags: string[];
  keywords: string[];
  vectorTags: string[];
  recommendedWith: string[];
  ingredients: string[];
  customizations: string[];
  removableIngredients: string[];
  customizationGroups: CatalogCustomizationGroup[];
  recommendationScore: number;
  nutrition: {
    calories: number;
    proteinGrams: number;
    carbohydratesGrams: number;
    totalFatGrams: number;
    saturatedFatGrams: number;
    sugarsGrams: number;
    addedSugarsGrams: number;
    fiberGrams: number;
    sodiumMilligrams: number;
    cholesterolMilligrams: number;
  };
  allergens: {
    contains: string[];
    mayContain: string[];
    crossContaminationPossible: string[];
    safetyMessage: string;
  };
};

type CatalogCustomizationGroup = {
  id: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: CatalogCustomizationOption[];
};

type CatalogCustomizationOption = {
  id: string;
  name: string;
  priceAdjustment: number;
  allergensAdded: string[] | string;
  allergensRemoved: string[] | string;
  nutritionAdjustment: {
    calories: number;
    proteinGrams: number;
    carbohydratesGrams: number;
    totalFatGrams: number;
    saturatedFatGrams: number;
    sugarsGrams: number;
    addedSugarsGrams: number;
    fiberGrams: number;
    sodiumMilligrams: number;
    cholesterolMilligrams: number;
  };
  default: boolean;
  available: boolean;
};

export type AIProductCustomizationOption = {
  id: string;
  databaseId?: string;
  name: string;
  priceAdjustment: number;
  allergensAdded: string[];
  allergensRemoved: string[];
  caloriesAdjustment: number;
  proteinAdjustment: number;
  nutritionAdjustment: AINutrition;
  default: boolean;
  available: boolean;
};

export type AINutrition = {
  calories: number;
  proteinGrams: number;
  carbohydratesGrams: number;
  totalFatGrams: number;
  saturatedFatGrams: number;
  sugarsGrams: number;
  addedSugarsGrams: number;
  fiberGrams: number;
  sodiumMilligrams: number;
  cholesterolMilligrams: number;
};

export type AIProductCustomizationGroup = {
  id: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: AIProductCustomizationOption[];
};

export type AIFoodItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  available: boolean;
  inStock: boolean;
  spiceLevel: number;
  category: string;
  tags: string[];
  dietaryTags: string[];
  cal: number;
  protein: string;
  proteinGrams: number;
  nutrition: AINutrition;
  image: string;
  allergens: string[];
  mayContain: string[];
  crossContaminationPossible: string[];
  allergenSafetyMessage: string;
  keywords: string[];
  vectorTags: string[];
  recommendedWith: string[];
  ingredients: string[];
  customizations: string[];
  removableIngredients: string[];
  customizationGroups: AIProductCustomizationGroup[];
  recommendationScore: number;
};

function normalizeAllergenList(value: string[] | string): string[] {
  if (Array.isArray(value)) return value.map(readableTag);
  return value.trim() ? value.trim().split(/\s+/).map(readableTag) : [];
}

function readableTag(tag: string) {
  return tag
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const restaurantAIConfig = menuCatalog.restaurant;
export const supportedAllergens = menuCatalog.supportedAllergens.map(readableTag);

export const aiMenu: AIFoodItem[] = (menuCatalog.products as CatalogProduct[])
  .filter(product => product.available && product.inStock)
  .map(product => ({
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    available: product.available,
    inStock: product.inStock,
    spiceLevel: product.spiceLevel,
    category: product.category,
    tags: product.dietaryTags.map(readableTag),
    dietaryTags: product.dietaryTags.map(tag => tag.toLowerCase()),
    cal: product.nutrition.calories,
    protein: `${product.nutrition.proteinGrams}g`,
    proteinGrams: product.nutrition.proteinGrams,
    nutrition: {
      calories: product.nutrition.calories,
      proteinGrams: product.nutrition.proteinGrams,
      carbohydratesGrams: product.nutrition.carbohydratesGrams,
      totalFatGrams: product.nutrition.totalFatGrams,
      saturatedFatGrams: product.nutrition.saturatedFatGrams,
      sugarsGrams: product.nutrition.sugarsGrams,
      addedSugarsGrams: product.nutrition.addedSugarsGrams,
      fiberGrams: product.nutrition.fiberGrams,
      sodiumMilligrams: product.nutrition.sodiumMilligrams,
      cholesterolMilligrams: product.nutrition.cholesterolMilligrams,
    },
    image: product.image,
    allergens: product.allergens.contains.map(readableTag),
    mayContain: product.allergens.mayContain.map(readableTag),
    crossContaminationPossible: product.allergens.crossContaminationPossible.map(readableTag),
    allergenSafetyMessage: product.allergens.safetyMessage,
    keywords: product.keywords.map(keyword => keyword.toLowerCase()),
    vectorTags: product.vectorTags.map(keyword => keyword.toLowerCase()),
    recommendedWith: product.recommendedWith,
    ingredients: product.ingredients,
    customizations: product.customizations,
    removableIngredients: product.removableIngredients,
    customizationGroups: product.customizationGroups.map(group => ({
      id: group.id,
      name: group.name,
      required: group.required,
      minSelections: group.minSelections,
      maxSelections: group.maxSelections,
      options: group.options.filter(option => option.available).map(option => ({
        id: option.id,
        name: option.name,
        priceAdjustment: option.priceAdjustment,
        allergensAdded: normalizeAllergenList(option.allergensAdded),
        allergensRemoved: normalizeAllergenList(option.allergensRemoved),
        caloriesAdjustment: option.nutritionAdjustment.calories,
        proteinAdjustment: option.nutritionAdjustment.proteinGrams,
        nutritionAdjustment: {
          calories: option.nutritionAdjustment.calories,
          proteinGrams: option.nutritionAdjustment.proteinGrams,
          carbohydratesGrams: option.nutritionAdjustment.carbohydratesGrams,
          totalFatGrams: option.nutritionAdjustment.totalFatGrams,
          saturatedFatGrams: option.nutritionAdjustment.saturatedFatGrams,
          sugarsGrams: option.nutritionAdjustment.sugarsGrams,
          addedSugarsGrams: option.nutritionAdjustment.addedSugarsGrams,
          fiberGrams: option.nutritionAdjustment.fiberGrams,
          sodiumMilligrams: option.nutritionAdjustment.sodiumMilligrams,
          cholesterolMilligrams: option.nutritionAdjustment.cholesterolMilligrams,
        },
        default: option.default,
        available: option.available,
      })),
    })),
    recommendationScore: product.recommendationScore,
  }))
  .sort((first, second) => second.recommendationScore - first.recommendationScore);

export function replaceAiMenu(products: NormalizedMenuProduct[]) {
  aiMenu.splice(0, aiMenu.length, ...products.filter(product => product.available && product.inStock).map(product => ({
    id: product.id, name: product.name, description: product.description, price: product.price, available: product.available,
    inStock: product.inStock, spiceLevel: product.spiceLevel, category: product.category,
    tags: product.dietaryTags.map(readableTag), dietaryTags: product.dietaryTags.map(tag => tag.toLowerCase()),
    cal: product.calories, protein: `${product.protein}g`, proteinGrams: product.protein,
    nutrition: { calories: product.calories, proteinGrams: product.protein, carbohydratesGrams: product.carbohydrates,
      totalFatGrams: product.fat, saturatedFatGrams: 0, sugarsGrams: product.sugars, addedSugarsGrams: 0,
      fiberGrams: product.fiber, sodiumMilligrams: product.sodium, cholesterolMilligrams: 0 },
    image: product.image, allergens: product.allergens.map(readableTag), mayContain: product.mayContain.map(readableTag),
    crossContaminationPossible: product.crossContaminationPossible.map(readableTag), allergenSafetyMessage: product.allergenSafetyMessage,
    keywords: product.keywords, vectorTags: product.vectorTags, recommendedWith: product.recommendedWith, ingredients: product.ingredients,
    customizations: product.customizations, removableIngredients: product.removableIngredients,
    customizationGroups: product.customizationGroups.map(group => ({ id: group.id, name: group.name, required: group.required,
      minSelections: group.minSelections, maxSelections: group.maxSelections, options: group.options.filter(option => option.available).map(option => ({
        id: option.id, databaseId: option.databaseId, name: option.name, priceAdjustment: option.priceDelta, allergensAdded: option.allergensAdded.map(readableTag),
        allergensRemoved: option.allergensRemoved.map(readableTag), caloriesAdjustment: option.nutritionAdjustment.calories ?? 0,
        proteinAdjustment: option.nutritionAdjustment.proteinGrams ?? 0,
        nutritionAdjustment: { calories: option.nutritionAdjustment.calories ?? 0, proteinGrams: option.nutritionAdjustment.proteinGrams ?? 0,
          carbohydratesGrams: option.nutritionAdjustment.carbohydratesGrams ?? 0, totalFatGrams: option.nutritionAdjustment.totalFatGrams ?? 0,
          saturatedFatGrams: option.nutritionAdjustment.saturatedFatGrams ?? 0, sugarsGrams: option.nutritionAdjustment.sugarsGrams ?? 0,
          addedSugarsGrams: option.nutritionAdjustment.addedSugarsGrams ?? 0, fiberGrams: option.nutritionAdjustment.fiberGrams ?? 0,
          sodiumMilligrams: option.nutritionAdjustment.sodiumMilligrams ?? 0, cholesterolMilligrams: option.nutritionAdjustment.cholesterolMilligrams ?? 0 },
        default: option.isDefault, available: option.available,
      })) })),
    recommendationScore: product.recommendationScore,
  })).sort((first, second) => second.recommendationScore - first.recommendationScore));
}
