export type NormalizedMenuOption = {
  id: string; databaseId?: string; name: string; priceDelta: number; priceAdjustment: number; available: boolean; displayOrder: number;
  allergensAdded: string[]; allergensRemoved: string[]; nutritionAdjustment: Record<string, number>; isDefault: boolean; default: boolean;
};
export type NormalizedMenuGroup = {
  id: string; name: string; required: boolean; minSelections: number; maxSelections: number; displayOrder: number; options: NormalizedMenuOption[];
};
export type NormalizedMenuProduct = {
  id: string; name: string; slug: string; description: string; category: string; price: number; currency: string; image: string;
  calories: number; protein: number; carbohydrates: number; fat: number; fiber: number; sugars: number; sodium: number;
  ingredients: string[]; allergens: string[]; mayContain: string[]; crossContaminationPossible: string[]; dietaryTags: string[];
  recommendationScore: number; available: boolean; inStock: boolean; spiceLevel: number; keywords: string[]; vectorTags: string[];
  recommendedWith: string[]; customizations: string[]; removableIngredients: string[]; allergenSafetyMessage: string;
  customizationGroups: NormalizedMenuGroup[];
};
export type NormalizedMenuCategory = { id: string; slug: string; name: string; description: string; image: string; displayOrder: number; active: boolean };
export type NormalizedMenu = { categories: NormalizedMenuCategory[]; products: NormalizedMenuProduct[]; currency: string };
