import type { AIFoodItem } from "../../app/data/aiMenu";
import {
  checkAllergens,
  checkProductAllergens,
  findByBudget,
  findHealthyMeals,
  findHighProtein,
  findKidsMeals,
  findSpicyMeals,
  findVeganMeals,
  findVegetarianMeals,
  recommendProducts,
  searchProducts,
  type AllergenCheck,
  type RecommendationFilters,
} from "../../app/services/noriMenuEngine";
import type { AIToolCall, AIToolName } from "../types/aiProvider";

export type NoriToolResult = AIFoodItem[] | AllergenCheck | AllergenCheck[];

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string") throw new Error(`Tool argument "${key}" must be a string.`);
  return value;
}

function numberArg(args: Record<string, unknown>, key: string, fallback?: number): number {
  const value = args[key];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Tool argument "${key}" must be a number.`);
  return value;
}

function stringArrayArg(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value) || !value.every(item => typeof item === "string")) {
    throw new Error(`Tool argument "${key}" must be a string array.`);
  }
  return value;
}

function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  return numberArg(args, key);
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  return stringArg(args, key);
}

function optionalBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`Tool argument "${key}" must be a boolean.`);
  return value;
}

function optionalStringArray(args: Record<string, unknown>, key: string): string[] | undefined {
  return args[key] === undefined ? undefined : stringArrayArg(args, key);
}

function filtersArg(args: Record<string, unknown>): RecommendationFilters {
  const allowedKeys = new Set(["query", "maxPrice", "minProtein", "maxCalories", "dietaryTags", "category", "keyword", "allergens", "spicy", "kids", "limit"]);
  if (Object.keys(args).some(key => !allowedKeys.has(key))) throw new Error("recommendProducts received an unsupported argument.");
  const limit = optionalNumber(args, "limit");
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 8)) throw new Error("Tool argument \"limit\" must be an integer from 1 to 8.");
  return {
    query: optionalString(args, "query"),
    maxPrice: optionalNumber(args, "maxPrice"),
    minProtein: optionalNumber(args, "minProtein"),
    maxCalories: optionalNumber(args, "maxCalories"),
    dietaryTags: optionalStringArray(args, "dietaryTags"),
    category: optionalString(args, "category"),
    keyword: optionalString(args, "keyword"),
    allergens: optionalStringArray(args, "allergens"),
    spicy: optionalBoolean(args, "spicy"),
    kids: optionalBoolean(args, "kids"),
    limit,
  };
}

export const allowedNoriTools: readonly AIToolName[] = [
  "searchProducts", "recommendProducts", "findByBudget", "findHighProtein",
  "findHealthyMeals", "findVeganMeals", "findVegetarianMeals", "findKidsMeals",
  "findSpicyMeals", "checkAllergens", "checkProductAllergens",
];

export function isAllowedNoriTool(value: string): value is AIToolName {
  return allowedNoriTools.includes(value as AIToolName);
}

export function validateNoriToolCall(call: AIToolCall): AIToolCall {
  if (!isAllowedNoriTool(call.name)) throw new Error(`Tool "${call.name}" is not allowed.`);
  executeNoriTool(call);
  return call;
}

export function executeNoriTool(call: AIToolCall): NoriToolResult {
  switch (call.name) {
    case "searchProducts": return searchProducts(stringArg(call.arguments, "query"));
    case "recommendProducts": return recommendProducts(filtersArg(call.arguments));
    case "findByBudget": return findByBudget(numberArg(call.arguments, "maxPrice"));
    case "findHighProtein": return findHighProtein(numberArg(call.arguments, "minProtein", 20));
    case "findHealthyMeals": return findHealthyMeals(numberArg(call.arguments, "maxCalories", 600));
    case "findVeganMeals": return findVeganMeals();
    case "findVegetarianMeals": return findVegetarianMeals();
    case "findKidsMeals": return findKidsMeals();
    case "findSpicyMeals": return findSpicyMeals();
    case "checkAllergens": return checkAllergens(stringArrayArg(call.arguments, "allergens"));
    case "checkProductAllergens": {
      const products = searchProducts(stringArg(call.arguments, "productId"));
      const product = products.find(item => item.id === call.arguments.productId);
      if (!product) throw new Error("Product was not found in the menu engine.");
      return checkProductAllergens(product, stringArrayArg(call.arguments, "allergens"));
    }
  }
}
