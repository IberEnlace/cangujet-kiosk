import assert from "node:assert/strict";
import test from "node:test";
import type { CartItem } from "../context/CartContext";
import { hasCompleteStoredModifiers } from "../context/CartContext";
import {
  buildOrderQuoteRequest,
  cartLineForValidationError,
  cartLineId,
  defaultModifierSelections,
  mergeCartItem,
  requiredModifierProblems,
  selectedModifiersForProduct,
  toModifierRequirements,
} from "./orders/cartModifierPipeline";
import type { NormalizedMenu, NormalizedMenuProduct } from "./supabase/menuModels";

test("pizza size and burger bun selections send stable database modifier IDs", () => {
  const menu = fixtureMenu();
  const pizza = configuredItem(menu.products[0], "option-size-large");
  const burger = configuredItem(menu.products[1], "option-bun-brioche");

  assert.deepEqual(
    buildOrderQuoteRequest([pizza, burger], menu, "dine_in", "en", ""),
    {
      items: [
        { productId: "product-pizza", quantity: 1, modifierIds: ["option-size-large"] },
        { productId: "product-burger", quantity: 1, modifierIds: ["option-bun-brioche"] },
      ],
      serviceMode: "dine_in",
      language: "en",
    },
  );
});

test("required groups block incomplete cart items and explicit defaults become stored selections", () => {
  const product = fixtureMenu().products[0];
  const requirements = toModifierRequirements(product);
  assert.equal(hasCompleteStoredModifiers({ requiredModifierGroups: requirements, selectedModifiers: [] }), false);
  assert.equal(
    requiredModifierProblems({ ...baseItem(product), requiredModifierGroups: requirements }, undefined)[0]?.modifierGroupId,
    "group-size",
  );

  const defaults = defaultModifierSelections(product);
  assert.deepEqual(defaults, { "group-size": ["option-size-medium"] });
  const selected = selectedModifiersForProduct(product, defaults);
  assert.deepEqual(selected.map(value => [value.modifierGroupId, value.modifierId]), [
    ["group-size", "option-size-medium"],
  ]);
  assert.equal(hasCompleteStoredModifiers({ requiredModifierGroups: requirements, selectedModifiers: selected }), true);
  assert.equal(requiredModifierProblems({
    ...baseItem(product),
    selectedModifiers: [{ ...selected[0]!, modifierId: "stale-option-id" }],
    requiredModifierGroups: requirements,
  }, fixtureMenu()).length, 1);
});

test("cart JSON restoration retains modifier IDs and distinct customizations do not merge", () => {
  const product = fixtureMenu().products[0];
  const medium = configuredItem(product, "option-size-medium");
  const large = configuredItem(product, "option-size-large");
  const restored = JSON.parse(JSON.stringify([medium, large])) as CartItem[];

  assert.equal(restored[0]?.selectedModifiers?.[0]?.modifierId, "option-size-medium");
  assert.notEqual(medium.id, large.id);
  const merged = mergeCartItem(mergeCartItem([], withoutQty(medium)), withoutQty(large));
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map(item => item.qty), [1, 1]);
});

test("backend item validation metadata maps a 422 to the exact cart line", () => {
  const menu = fixtureMenu();
  const items = [
    configuredItem(menu.products[0], "option-size-large"),
    configuredItem(menu.products[1], "option-bun-brioche"),
  ];
  assert.equal(cartLineForValidationError(items, 1, "product-burger")?.id, items[1]?.id);
  assert.equal(cartLineForValidationError(items, undefined, "product-pizza")?.id, items[0]?.id);
});

function configuredItem(product: NormalizedMenuProduct, modifierId: string): CartItem {
  const group = product.customizationGroups[0]!;
  const option = group.options.find(value => value.databaseId === modifierId)!;
  const selectedModifiers = [{
    modifierGroupId: group.databaseId!,
    modifierId: option.databaseId!,
    groupName: group.name,
    optionName: option.name,
    priceAdjustment: option.priceAdjustment,
  }];
  return {
    ...baseItem(product),
    id: cartLineId(product.id, selectedModifiers),
    selectedModifiers,
    requiredModifierGroups: toModifierRequirements(product),
  };
}

function baseItem(product: NormalizedMenuProduct): CartItem {
  return {
    id: product.id,
    productId: product.id,
    name: product.name,
    price: product.price,
    basePrice: product.price,
    qty: 1,
    image: "",
    category: product.category,
  };
}

function withoutQty(item: CartItem): Omit<CartItem, "qty"> {
  const { qty: _qty, ...rest } = item;
  return rest;
}

function fixtureMenu(): NormalizedMenu {
  return {
    currency: "EUR",
    categories: [],
    products: [
      product("product-pizza", "Pizza", "group-size", "Choose size", [
        option("size-medium", "option-size-medium", "Medium", true),
        option("size-large", "option-size-large", "Large"),
      ]),
      product("product-burger", "Burger", "group-bun", "Choose bun", [
        option("bun-brioche", "option-bun-brioche", "Brioche"),
      ]),
    ],
  };
}

function product(
  id: string,
  name: string,
  groupDatabaseId: string,
  groupName: string,
  options: ReturnType<typeof option>[],
): NormalizedMenuProduct {
  return {
    id,
    name,
    category: "mains",
    price: 10,
    calories: 500,
    customizationGroups: [{
      id: `${groupDatabaseId}-source`,
      databaseId: groupDatabaseId,
      name: groupName,
      required: true,
      minSelections: 1,
      maxSelections: 1,
      displayOrder: 0,
      options,
    }],
  } as unknown as NormalizedMenuProduct;
}

function option(id: string, databaseId: string, name: string, isDefault = false) {
  return {
    id,
    databaseId,
    name,
    priceDelta: 0,
    priceAdjustment: 0,
    available: true,
    displayOrder: 0,
    allergensAdded: [],
    allergensRemoved: [],
    nutritionAdjustment: {},
    isDefault,
    default: isDefault,
  };
}
