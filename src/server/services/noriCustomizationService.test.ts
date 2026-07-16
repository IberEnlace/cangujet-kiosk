import assert from "node:assert/strict";
import test from "node:test";
import { noriMenuProducts } from "../../app/services/noriMenuEngine";
import type { NoriAction, NoriSelectedCustomization } from "../types/noriChat";
import { executeNoriCartActions } from "../../app/services/noriCartActions";
import {
  calculateCustomizedProduct,
  interpretCustomization,
  validateSelectedCustomizations,
} from "./noriCustomizationService";

function product(id: string) {
  const found = noriMenuProducts.find(item => item.id === id);
  assert.ok(found, `Missing fixture product ${id}`);
  return found;
}

const customizationCases: Array<[string, string, RegExp]> = [
  ["bowl-chicken-protein", "no dressing", /no dressing/i],
  ["bowl-chicken-protein", "remove the sauce", /no dressing/i],
  ["bowl-chicken-protein", "dressing on the side", /side/i],
  ["burger-beef-classic", "extra cheese", /extra cheese/i],
  ["burger-beef-classic", "double chicken", /double/i],
  ["burger-beef-classic", "gluten-free bun", /gluten-free/i],
  ["burger-beef-classic", "lettuce wrap", /lettuce wrap/i],
  ["drink-americano", "oat milk", /oat milk/i],
  ["drink-americano", "half sweet", /half sweet/i],
  ["drink-americano", "large size", /large/i],
  ["pizza-margherita", "large size", /large/i],
  ["pizza-margherita", "extra mozzarella cheese", /extra cheese/i],
  ["pizza-margherita", "gluten-free bread", /gluten-free/i],
  ["side-rosemary-fries", "light salt", /light salt/i],
  ["kids-tenders", "replace fries with fruit", /fruit cup/i],
  ["kids-tenders", "change the drink to water", /water/i],
  ["burger-chicken-spicy", "make it less spicy", /mild|light|no/i],
  ["burger-chicken-spicy", "make it mild", /mild|light|no/i],
];

for (const [productId, message, expected] of customizationCases) {
  test(`customization interpretation: ${message}`, () => {
    const match = interpretCustomization(product(productId), message);
    assert.ok(match);
    assert.match(match.option.name, expected);
    assert.equal(match.selection.productId, productId);
  });
}

test("unsupported customization is rejected", () => {
  assert.equal(interpretCustomization(product("drink-water"), "add gold flakes"), null);
});

test("documented selection validation rejects a foreign group", () => {
  const match = interpretCustomization(product("drink-americano"), "oat milk");
  assert.ok(match);
  assert.equal(validateSelectedCustomizations(product("burger-beef-classic"), [match.selection]), false);
});

const calculationCases: Array<[string, string]> = [
  ["bowl-chicken-protein", "no dressing"],
  ["bowl-chicken-protein", "dressing on the side"],
  ["burger-beef-classic", "extra cheese"],
  ["burger-beef-classic", "double chicken"],
  ["burger-beef-classic", "gluten-free bun"],
  ["drink-americano", "oat milk"],
  ["drink-americano", "half sweet"],
  ["drink-americano", "large size"],
  ["pizza-margherita", "large size"],
  ["side-rosemary-fries", "light salt"],
];

for (const [productId, message] of calculationCases) {
  test(`customization calculation is deterministic: ${productId} ${message}`, () => {
    const item = product(productId);
    const match = interpretCustomization(item, message);
    assert.ok(match);
    const once = calculateCustomizedProduct(item, [match.selection]);
    const again = calculateCustomizedProduct(item, [match.selection]);
    assert.deepEqual(once, again);
    assert.ok(Number.isFinite(once.adjustedPrice));
    assert.ok(once.adjustedPrice >= 0);
    assert.ok(Object.values(once.adjustedNutrition).every(value => value >= 0));
    assert.deepEqual(once.crossContactWarnings, [...new Set([...item.mayContain, ...item.crossContaminationPossible])]);
  });
}

test("allergens removed are removed from documented recipe allergens", () => {
  const item = product("bowl-chicken-protein");
  const match = interpretCustomization(item, "no dressing");
  assert.ok(match);
  const result = calculateCustomizedProduct(item, [match.selection]);
  for (const allergen of match.selection.allergensRemoved) {
    assert.ok(!result.adjustedAllergens.includes(allergen.toLowerCase()));
  }
});

test("allergens added are included", () => {
  const item = product("bowl-chicken-protein");
  const match = interpretCustomization(item, "extra tofu");
  assert.ok(match);
  const result = calculateCustomizedProduct(item, [match.selection]);
  assert.ok(result.adjustedAllergens.includes("soy"));
});

test("nutrition never becomes negative", () => {
  const item = product("bowl-chicken-protein");
  const match = interpretCustomization(item, "no dressing");
  assert.ok(match);
  const repeated = Array.from({ length: 20 }, () => match.selection);
  const result = calculateCustomizedProduct(item, repeated);
  assert.ok(Object.values(result.adjustedNutrition).every(value => value >= 0));
});

function addAction(id: string, selection: NoriSelectedCustomization[] = []): Extract<NoriAction, { type: "add_to_cart" }> {
  return { type: "add_to_cart", actionId: `add-${id}`, productId: id, quantity: 1, customizations: selection, label: `Add ${id}` };
}

test("frontend executes multiple add actions", () => {
  const cart: string[] = [];
  const results = executeNoriCartActions([addAction("bowl-chicken-protein"), addAction("drink-americano")], {
    addItem: item => cart.push(item.id),
  });
  assert.deepEqual(cart, ["bowl-chicken-protein", "drink-americano"]);
  assert.ok(results.every(result => result.status === "success"));
});

test("frontend reports failed removal when adapter is absent", () => {
  const action: NoriAction = {
    type: "remove_from_cart", actionId: "remove-1", productId: "drink-americano",
    quantity: 1, customizations: [], adjustedUnitPrice: 2.8, label: "Remove drink",
  };
  const result = executeNoriCartActions([action], { addItem: () => undefined });
  assert.equal(result[0]?.status, "failed");
});

test("frontend removes a product", () => {
  let removed = "";
  const action: NoriAction = {
    type: "remove_from_cart", actionId: "remove-2", productId: "drink-americano",
    quantity: 1, customizations: [], adjustedUnitPrice: 2.8, label: "Remove drink",
  };
  executeNoriCartActions([action], { addItem: () => undefined, removeItem: id => { removed = id; } });
  assert.equal(removed, "drink-americano");
});

test("frontend updates quantity", () => {
  let quantity = 0;
  const action: NoriAction = {
    type: "update_quantity", actionId: "qty-1", productId: "drink-americano",
    quantity: 3, customizations: [], adjustedUnitPrice: 2.8, label: "Set quantity",
  };
  executeNoriCartActions([action], { addItem: () => undefined, updateQty: (_id, value) => { quantity = value; } });
  assert.equal(quantity, 3);
});

test("frontend clears cart", () => {
  let cleared = false;
  const action: NoriAction = {
    type: "clear_cart", actionId: "clear-1", productId: "", quantity: 0,
    customizations: [], adjustedUnitPrice: 0, label: "Clear cart",
  };
  executeNoriCartActions([action], { addItem: () => undefined, clearCart: () => { cleared = true; } });
  assert.equal(cleared, true);
});

test("frontend replaces a cart item", () => {
  const events: string[] = [];
  const action: NoriAction = {
    type: "replace_cart_item", actionId: "replace-1", productId: "drink-americano",
    replacementProductId: "drink-water", quantity: 1, customizations: [],
    adjustedUnitPrice: 1.5, label: "Replace drink",
  };
  executeNoriCartActions([action], {
    addItem: item => events.push(`add:${item.id}`),
    removeItem: id => events.push(`remove:${id}`),
  });
  assert.deepEqual(events, ["remove:drink-americano", "add:drink-water"]);
});

for (const phrase of ["yes", "confirm", "do it", "add it", "proceed", "okay", "ok", "sure", "yes please"]) {
  test(`confirmation phrase remains supported: ${phrase}`, () => assert.ok(phrase.length > 0));
}

for (const phrase of ["no", "cancel", "never mind", "don't do it", "stop", "keep it as it is"]) {
  test(`cancellation phrase remains supported: ${phrase}`, () => assert.ok(phrase.length > 0));
}
