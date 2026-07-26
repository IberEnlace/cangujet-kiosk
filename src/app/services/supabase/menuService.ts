import localCatalog from "../../data/morrow-menu-ai.json";
import { supabase } from "../../../lib/supabase/client";
import type { NormalizedMenu, NormalizedMenuProduct } from "./menuModels";
import { repositoryFailure, type RepositoryResult } from "./repositoryResult";

const CACHE_MS = 30_000;
let cached: { expires: number; result: RepositoryResult<NormalizedMenu> } | null = null;
let pending: Promise<RepositoryResult<NormalizedMenu>> | null = null;

export function invalidateMenuCache() { cached = null; pending = null; }
export function getLocalMenu(): NormalizedMenu { return mapLocalCatalog(localCatalog); }

export async function loadMenu(options: { signal?: AbortSignal; force?: boolean } = {}): Promise<RepositoryResult<NormalizedMenu>> {
  if (options.signal?.aborted) return repositoryFailure("aborted", "Menu request was cancelled.");
  if (!options.force && cached && cached.expires > Date.now()) return cached.result;
  if (!options.force && pending) return pending;
  pending = loadPreferredMenu(options.signal).then(result => {
    if (result.ok || result.error.code !== "aborted") {
      cached = { expires: Date.now() + CACHE_MS, result };
    }
    pending = null;
    return result;
  });
  return pending;
}

async function loadPreferredMenu(signal?: AbortSignal): Promise<RepositoryResult<NormalizedMenu>> {
  if (!supabase) return repositoryFailure("configuration", "Menu database is not configured.");
  try {
    let categoryQuery = supabase.from("categories").select("*").eq("is_active", true).order("display_order");
    let productQuery = supabase.from("products").select("*").eq("is_active", true).eq("is_available", true);
    let groupQuery = supabase.from("product_customization_groups").select("*").order("display_order");
    let optionQuery = supabase.from("product_customization_options").select("*").order("display_order");
    if (signal) {
      categoryQuery = categoryQuery.abortSignal(signal); productQuery = productQuery.abortSignal(signal);
      groupQuery = groupQuery.abortSignal(signal); optionQuery = optionQuery.abortSignal(signal);
    }
    const [categories, products, groups, options] = await Promise.all([
      categoryQuery,
      productQuery,
      groupQuery,
      optionQuery,
    ]);
    if (signal?.aborted) {
      return repositoryFailure("aborted", "Menu request was cancelled.");
    }
    if (categories.error || products.error || groups.error || options.error) {
      const menuErrors = {
        categories: formatSupabaseError(categories.error),
        products: formatSupabaseError(products.error),
        product_customization_groups: formatSupabaseError(groups.error),
        product_customization_options: formatSupabaseError(options.error),
      };
      console.error(
        `[MORROW] Supabase menu errors:\n${JSON.stringify(menuErrors, null, 2)}`,
      );
      return repositoryFailure("network", "Menu could not be loaded from the database.", menuErrors);
    }
    const mapped = mapDatabaseMenu(categories.data, products.data, groups.data, options.data);
    if (!validateMenu(mapped)) return repositoryFailure("invalid_data", "The database returned an invalid menu.");
    return { ok: true, data: mapped, source: "supabase" };
  } catch (cause) {
    if (signal?.aborted) {
      return repositoryFailure("aborted", "Menu request was cancelled.", cause);
    }
    console.error("[MORROW] Unexpected Supabase menu error:", cause);
    return repositoryFailure("network", "Menu could not be loaded from the database.", cause);
  }
}

function formatSupabaseError(error: { code?: string; message?: string; details?: string; hint?: string } | null) {
  if (!error) return null;
  return {
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  };
}

type LocalProduct = (typeof localCatalog.products)[number];
function mapLocalCatalog(catalog: typeof localCatalog): NormalizedMenu {
  const categories = catalog.categories.map((slug, index) => ({ id: slug, slug: slug.replace(/_/g, "-"), name: title(slug), description: "", image: "", displayOrder: index, active: true }));
  return { categories, products: catalog.products.map(mapLocalProduct), currency: catalog.restaurant.defaultCurrency };
}

function mapLocalProduct(product: LocalProduct): NormalizedMenuProduct {
  return {
    id: product.id, name: product.name, slug: product.id, description: product.description, category: product.category,
    price: product.price, currency: product.currency, image: product.image, calories: product.nutrition.calories,
    protein: product.nutrition.proteinGrams, carbohydrates: product.nutrition.carbohydratesGrams, fat: product.nutrition.totalFatGrams,
    fiber: product.nutrition.fiberGrams, sugars: product.nutrition.sugarsGrams, sodium: product.nutrition.sodiumMilligrams,
    ingredients: product.ingredients, allergens: product.allergens.contains, mayContain: product.allergens.mayContain,
    crossContaminationPossible: product.allergens.crossContaminationPossible, dietaryTags: product.dietaryTags,
    recommendationScore: product.recommendationScore, available: product.available, inStock: product.inStock, spiceLevel: product.spiceLevel,
    keywords: product.keywords, vectorTags: product.vectorTags, recommendedWith: product.recommendedWith,
    customizations: product.customizations, removableIngredients: product.removableIngredients,
    allergenSafetyMessage: product.allergens.safetyMessage,
    customizationGroups: product.customizationGroups.map((group, groupIndex) => ({
      id: group.id, name: group.name, required: group.required, minSelections: group.minSelections, maxSelections: group.maxSelections, displayOrder: groupIndex,
      options: group.options.map((option, optionIndex) => ({
        id: option.id, name: option.name, priceDelta: option.priceAdjustment, priceAdjustment: option.priceAdjustment, available: option.available, displayOrder: optionIndex,
        allergensAdded: list(option.allergensAdded), allergensRemoved: list(option.allergensRemoved),
        nutritionAdjustment: option.nutritionAdjustment, isDefault: option.default, default: option.default,
      })),
    })),
  };
}

function mapDatabaseMenu(categories: Array<Record<string, unknown>>, products: Array<Record<string, unknown>>, groups: Array<Record<string, unknown>>, options: Array<Record<string, unknown>>): NormalizedMenu {
  const categorySlug = new Map(categories.map(row => [String(row.id), String(row.slug).replace(/-/g, "_")]));
  const optionsByGroup = new Map<string, Array<Record<string, unknown>>>();
  for (const option of options) optionsByGroup.set(String(option.group_id), [...(optionsByGroup.get(String(option.group_id)) ?? []), option]);
  const groupsByProduct = new Map<string, Array<Record<string, unknown>>>();
  for (const group of groups) groupsByProduct.set(String(group.product_id), [...(groupsByProduct.get(String(group.product_id)) ?? []), group]);
  const normalizedProducts: NormalizedMenuProduct[] = products.map(row => {
    const metadata = object(row.metadata);
    return {
      id: String(row.id), name: String(row.name), slug: String(row.slug), description: String(row.description ?? ""), category: categorySlug.get(String(row.category_id)) ?? "",
      price: Number(row.price), currency: String(row.currency), image: String(row.image_url ?? ""), calories: Number(row.calories ?? 0),
      protein: Number(row.protein ?? 0), carbohydrates: Number(row.carbohydrates ?? 0), fat: Number(row.fat ?? 0), fiber: Number(row.fiber ?? 0),
      sugars: Number(row.sugars ?? 0), sodium: Number(row.sodium ?? 0), ingredients: strings(row.ingredients), allergens: strings(row.allergens),
      mayContain: strings(metadata.mayContain), crossContaminationPossible: strings(metadata.crossContaminationPossible), dietaryTags: strings(row.dietary_tags),
      recommendationScore: Number(row.recommendation_score), available: Boolean(row.is_available), inStock: metadata.inStock !== false,
      spiceLevel: Number(metadata.spiceLevel ?? 0), keywords: strings(metadata.keywords), vectorTags: strings(metadata.vectorTags),
      recommendedWith: strings(metadata.recommendedWith), customizations: strings(metadata.customizations), removableIngredients: strings(metadata.removableIngredients),
      allergenSafetyMessage: String(metadata.allergenSafetyMessage ?? ""),
      customizationGroups: (groupsByProduct.get(String(row.id)) ?? []).map(group => ({
        id: String(group.source_id), name: String(group.name), required: Boolean(group.required), minSelections: Number(group.minimum_selections),
        maxSelections: Number(group.maximum_selections), displayOrder: Number(group.display_order),
        options: (optionsByGroup.get(String(group.id)) ?? []).map(option => {
          const optionMetadata = object(option.metadata);
          return { id: String(option.source_id), databaseId: String(option.id), name: String(option.name), priceDelta: Number(option.price_delta), priceAdjustment: Number(option.price_delta), available: Boolean(option.is_available),
            displayOrder: Number(option.display_order), allergensAdded: strings(optionMetadata.allergensAdded), allergensRemoved: strings(optionMetadata.allergensRemoved),
            nutritionAdjustment: numbers(optionMetadata.nutritionAdjustment), isDefault: Boolean(optionMetadata.default), default: Boolean(optionMetadata.default) };
        }),
      })),
    };
  });
  return { categories: categories.map(row => ({ id: String(row.id), slug: String(row.slug), name: String(row.name), description: String(row.description ?? ""), image: String(row.image_url ?? ""), displayOrder: Number(row.display_order), active: Boolean(row.is_active) })), products: normalizedProducts, currency: normalizedProducts[0]?.currency ?? "EUR" };
}

export function validateMenu(menu: NormalizedMenu) {
  return new Set(menu.products.map(product => product.id)).size === menu.products.length
    && menu.products.every(product => product.id && product.name && product.category && Number.isFinite(product.price) && product.price >= 0 && product.currency.length === 3);
}
function title(value: string) { return value.split("_").map(part => part[0]?.toUpperCase() + part.slice(1)).join(" "); }
function list(value: string[] | string) { return Array.isArray(value) ? value : value.trim() ? [value] : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function numbers(value: unknown): Record<string, number> { return Object.fromEntries(Object.entries(object(value)).filter((entry): entry is [string, number] => typeof entry[1] === "number")); }
