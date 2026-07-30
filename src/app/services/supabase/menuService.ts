import localCatalog from "../../data/morrow-menu-ai.json";
import type { DeviceMenuResponse } from "../../../shared/deviceBootstrap";
import type { NormalizedMenu, NormalizedMenuProduct } from "./menuModels";
import { repositoryFailure, type RepositoryResult } from "./repositoryResult";
import { DEVICE_ACCESS_TOKEN_STORAGE_KEY } from "../device/DeviceConfigurationService";

const CACHE_MS = 30_000;
let cached: { key: string; expires: number; result: RepositoryResult<NormalizedMenu> } | null = null;
let pending: { key: string; request: Promise<RepositoryResult<NormalizedMenu>> } | null = null;

export function invalidateMenuCache() { cached = null; pending = null; }
export function getLocalMenu(): NormalizedMenu { return mapLocalCatalog(localCatalog); }

export async function loadMenu(options: {
  signal?: AbortSignal;
  force?: boolean;
  expected?: { menuId: string; menuVersion: number; currency: string };
} = {}): Promise<RepositoryResult<NormalizedMenu>> {
  if (options.signal?.aborted) return repositoryFailure("aborted", "Menu request was cancelled.");
  const key = options.expected ? `${options.expected.menuId}:${options.expected.menuVersion}` : "device";
  if (!options.force && cached && cached.key === key && cached.expires > Date.now()) return cached.result;
  if (!options.force && pending?.key === key) return pending.request;
  const request = loadPreferredMenu(options.signal, options.expected).then(result => {
    if (result.ok || result.error.code !== "aborted") {
      cached = { key, expires: Date.now() + CACHE_MS, result };
    }
    if (pending?.request === request) pending = null;
    return result;
  });
  pending = { key, request };
  return request;
}

async function loadPreferredMenu(
  signal?: AbortSignal,
  expected?: { menuId: string; menuVersion: number; currency: string },
): Promise<RepositoryResult<NormalizedMenu>> {
  const accessToken = typeof sessionStorage === "undefined"
    ? null
    : sessionStorage.getItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY);
  if (!accessToken) return repositoryFailure("unauthorized", "The device session is not authenticated.");
  let response: Response;
  try {
    response = await globalThis.fetch("/api/v1/device/menu", {
      headers: { authorization: `Bearer ${accessToken}` },
      credentials: "include",
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) {
      return repositoryFailure("aborted", "Menu request was cancelled.", cause);
    }
    if (import.meta.env?.DEV) console.error("[MORROW] Device menu request failed:", cause);
    return repositoryFailure("network", "Menu could not be loaded from the database.", cause);
  }
  if (!response.ok) {
    return repositoryFailure(
      response.status === 401 || response.status === 403 ? "unauthorized" : "configuration",
      response.status === 401 || response.status === 403
        ? "The device is not authorized to load this menu."
        : "Menu configuration could not be loaded.",
    );
  }
  let payload: unknown;
  try {
    const body = await response.text();
    payload = body ? JSON.parse(body) : null;
  } catch (cause) {
    return repositoryFailure("invalid_data", "The menu endpoint returned malformed JSON.", cause);
  }
  if (!isDeviceMenuResponse(payload)) return repositoryFailure("invalid_data", "The menu endpoint returned invalid data.");
  if (expected && (payload.menuId !== expected.menuId || payload.menuVersion !== expected.menuVersion || payload.currency !== expected.currency)) {
    return repositoryFailure("conflict", "The menu response does not match the active bootstrap.");
  }
  const mapped = mapDatabaseMenu(
    payload.categories,
    payload.products,
    payload.customizationGroups,
    payload.customizationOptions,
    payload.currency,
  );
  if (!validateMenu(mapped)) return repositoryFailure("invalid_data", "The database returned an invalid menu.");
  return { ok: true, data: mapped, source: "supabase" };
}

type LocalProduct = (typeof localCatalog.products)[number];
function mapLocalCatalog(catalog: typeof localCatalog): NormalizedMenu {
  const categories = catalog.categories.map((slug, index) => ({ id: slug, slug: slug.replace(/_/g, "-"), name: title(slug), localizedNames: {}, description: "", image: "", icon: "", displayOrder: index, active: true }));
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
      id: group.id, databaseId: group.id, name: group.name, required: group.required, minSelections: group.minSelections, maxSelections: group.maxSelections, displayOrder: groupIndex,
      options: group.options.map((option, optionIndex) => ({
        id: option.id, databaseId: option.id, name: option.name, priceDelta: option.priceAdjustment, priceAdjustment: option.priceAdjustment, available: option.available, displayOrder: optionIndex,
        allergensAdded: list(option.allergensAdded), allergensRemoved: list(option.allergensRemoved),
        nutritionAdjustment: option.nutritionAdjustment, isDefault: option.default, default: option.default,
      })),
    })),
  };
}

export function mapDatabaseMenu(categories: Array<Record<string, unknown>>, products: Array<Record<string, unknown>>, groups: Array<Record<string, unknown>>, options: Array<Record<string, unknown>>, currency: string): NormalizedMenu {
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
        id: String(group.source_id), databaseId: String(group.id), name: String(group.name), required: Boolean(group.required), minSelections: Number(group.minimum_selections),
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
  return { categories: categories.map(row => ({ id: String(row.id), slug: String(row.slug), name: String(row.name), localizedNames: stringRecord(row.localized_names), description: String(row.description ?? ""), image: String(row.image_url ?? ""), icon: String(row.icon ?? ""), displayOrder: Number(row.display_order), active: Boolean(row.is_active) && row.is_visible !== false })), products: normalizedProducts, currency };
}

export function validateMenu(menu: NormalizedMenu) {
  const categoryKeys = new Set(menu.categories.filter(category => category.active).map(category => category.slug.replace(/-/g, "_")));
  return menu.categories.length > 0
    && menu.products.length > 0
    && new Set(menu.categories.map(category => category.id)).size === menu.categories.length
    && new Set(menu.products.map(product => product.id)).size === menu.products.length
    && menu.products.every(product => product.id && product.name && categoryKeys.has(product.category)
      && Number.isFinite(product.price) && product.price >= 0 && product.currency.length === 3);
}
function title(value: string) { return value.split("_").map(part => part[0]?.toUpperCase() + part.slice(1)).join(" "); }
function list(value: string[] | string) { return Array.isArray(value) ? value : value.trim() ? [value] : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function numbers(value: unknown): Record<string, number> { return Object.fromEntries(Object.entries(object(value)).filter((entry): entry is [string, number] => typeof entry[1] === "number")); }
function stringRecord(value: unknown): Record<string, string> { return Object.fromEntries(Object.entries(object(value)).filter((entry): entry is [string, string] => typeof entry[1] === "string")); }

function isDeviceMenuResponse(value: unknown): value is DeviceMenuResponse {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<DeviceMenuResponse>;
  return typeof payload.menuId === "string"
    && Number.isInteger(payload.menuVersion)
    && typeof payload.currency === "string"
    && payload.currency.length === 3
    && Array.isArray(payload.categories)
    && Array.isArray(payload.products)
    && Array.isArray(payload.customizationGroups)
    && Array.isArray(payload.customizationOptions);
}
