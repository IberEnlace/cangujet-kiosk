import assert from "node:assert/strict";
import test from "node:test";
import { aiMenu, replaceAiMenu } from "../../data/aiMenu";
import { getLocalMenu, invalidateMenuCache, loadMenu, validateMenu } from "./menuService";

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
  assert.equal(first.error.code, "configuration");
  invalidateMenuCache();
  const second = await loadMenu();
  assert.equal(second.ok, false);
});

test("Nori registry accepts the exact shared menu IDs and prices", () => {
  const original = [...aiMenu];
  const menu = getLocalMenu();
  replaceAiMenu(menu.products);
  assert.deepEqual(aiMenu.map(product => [product.id, product.price]), menu.products.filter(product => product.available && product.inStock).sort((a, b) => b.recommendationScore - a.recommendationScore).map(product => [product.id, product.price]));
  aiMenu.splice(0, aiMenu.length, ...original);
});
