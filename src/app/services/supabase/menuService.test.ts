import assert from "node:assert/strict";
import test from "node:test";
import { aiMenu, replaceAiMenu } from "../../data/aiMenu";
import { getLocalMenu, invalidateMenuCache, loadMenu, validateMenu } from "./menuService";
import { DEVICE_ACCESS_TOKEN_STORAGE_KEY } from "../device/DeviceConfigurationService";

test("local normalized menu preserves stable IDs and complete nutrition", () => {
  const menu = getLocalMenu();
  assert.equal(menu.products.length, 37);
  assert.equal(new Set(menu.products.map(product => product.id)).size, 37);
  assert.ok(menu.products.some(product => product.id === "burger-beef-classic"));
  assert.ok(menu.products.every(product => Number.isFinite(product.calories) && Number.isFinite(product.protein)));
  assert.equal(validateMenu(menu), true);
});

test("category and customization mappings remain connected", () => {
  const menu = getLocalMenu();
  const burger = menu.products.find(product => product.id === "burger-beef-classic");
  assert.equal(burger?.category, "burger");
  assert.ok(burger?.customizationGroups.some(group => group.id === "bun-choice"));
  assert.ok(burger?.customizationGroups.flatMap(group => group.options).some(option => option.id === "gluten-free-bun"));
});

test("unconfigured production repository fails explicitly instead of returning a local menu", async () => {
  invalidateMenuCache();
  const first = await loadMenu();
  assert.equal(first.ok, false);
  if (first.ok) return;
  assert.equal(first.error.code, "unauthorized");
  invalidateMenuCache();
  const second = await loadMenu();
  assert.equal(second.ok, false);
});

test("authenticated device menu uses the browser receiver and maps categories, products, and modifiers", async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const storage = memoryStorage();
  storage.setItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY, "device-access-token");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage });
  let request: { url: string; credentials?: RequestCredentials; authorization?: string } | null = null;
  globalThis.fetch = (function (this: typeof globalThis, input: RequestInfo | URL, init?: RequestInit) {
    if (this !== globalThis) throw new TypeError("Illegal invocation");
    request = {
      url: String(input),
      credentials: init?.credentials,
      authorization: new Headers(init?.headers).get("authorization") ?? undefined,
    };
    return Promise.resolve(Response.json(deviceMenuPayload()));
  }) as typeof fetch;
  try {
    invalidateMenuCache();
    const result = await loadMenu({
      expected: { menuId: "menu-1", menuVersion: 4, currency: "TRY" },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(request, {
      url: "/api/v1/device/menu",
      credentials: "include",
      authorization: "Bearer device-access-token",
    });
    assert.equal(result.data.currency, "TRY");
    assert.equal(result.data.categories[0]?.slug, "burgers");
    assert.equal(result.data.categories[0]?.localizedNames?.tr, "Burgerler");
    assert.equal(result.data.categories[0]?.icon, "🍔");
    assert.equal(result.data.products[0]?.customizationGroups[0]?.databaseId, "group-db-1");
    assert.equal(result.data.products[0]?.customizationGroups[0]?.options[0]?.id, "extra-cheese");
    assert.equal(result.data.products[0]?.customizationGroups[0]?.options[0]?.databaseId, "option-db-1");
  } finally {
    globalThis.fetch = originalFetch;
    restoreGlobal("sessionStorage", originalStorage);
    invalidateMenuCache();
  }
});

test("HTTP and malformed menu responses retain application classification", async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const storage = memoryStorage();
  storage.setItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY, "device-access-token");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage });
  try {
    globalThis.fetch = (() => Promise.resolve(new Response('{"code":"configuration_error"}', { status: 400 }))) as typeof fetch;
    invalidateMenuCache();
    const rejected = await loadMenu({ force: true });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.error.code, "configuration");

    globalThis.fetch = (() => Promise.resolve(new Response("{not-json", { status: 200 }))) as typeof fetch;
    invalidateMenuCache();
    const malformed = await loadMenu({ force: true });
    assert.equal(malformed.ok, false);
    if (!malformed.ok) assert.equal(malformed.error.code, "invalid_data");
  } finally {
    globalThis.fetch = originalFetch;
    restoreGlobal("sessionStorage", originalStorage);
    invalidateMenuCache();
  }
});

test("Nori registry accepts the exact shared menu IDs and prices", () => {
  const original = [...aiMenu];
  const menu = getLocalMenu();
  replaceAiMenu(menu.products);
  assert.deepEqual(aiMenu.map(product => [product.id, product.price]), menu.products.filter(product => product.available && product.inStock).sort((a, b) => b.recommendationScore - a.recommendationScore).map(product => [product.id, product.price]));
  aiMenu.splice(0, aiMenu.length, ...original);
});

function deviceMenuPayload() {
  return {
    menuId: "menu-1",
    menuVersion: 4,
    currency: "TRY",
    categories: [{
      id: "category-1", menu_id: "menu-1", slug: "burgers", name: "Burgers",
      localized_names: { tr: "Burgerler" }, description: "", image_url: null, icon: "🍔",
      display_order: 0, is_active: true, is_visible: true,
    }],
    products: [{
      id: "product-1", category_id: "category-1", slug: "classic", name: "Classic",
      description: "", price: 250, currency: "TRY", image_url: null, calories: 500,
      protein: 25, carbohydrates: 40, fat: 20, fiber: 2, sugars: 4, sodium: 500,
      ingredients: [], allergens: [], dietary_tags: [], recommendation_score: 1,
      is_available: true, is_active: true, metadata: {},
    }],
    customizationGroups: [{
      id: "group-db-1", product_id: "product-1", source_id: "cheese",
      name: "Cheese", required: false, minimum_selections: 0, maximum_selections: 1,
      display_order: 0,
    }],
    customizationOptions: [{
      id: "option-db-1", group_id: "group-db-1", source_id: "extra-cheese",
      name: "Extra cheese", price_delta: 25, is_available: true, display_order: 0,
      metadata: {},
    }],
  };
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

function restoreGlobal(name: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}
