import assert from "node:assert/strict";
import test from "node:test";
import type { NoriChatRequest, NoriConversationState } from "../types/noriChat";
import { noriMenuProducts } from "../../app/services/noriMenuEngine";
import { NoriAgentService, validateRecommendations } from "./noriAgentService";
import { interpretNoriRequest } from "./noriRequestInterpreter";

function state(): NoriConversationState {
  return {
    preferredLanguage: "en", activeAllergens: [], maxBudget: null, minProtein: null, maxCalories: null,
    dietaryPreferences: [], persistentDietaryPreferences: [], requestedCategory: null, requestedDrink: false,
    requestedSpicy: false, requestedKids: false, requestedDessert: false, selectedProductId: null,
    selectedCustomizations: [], currentRecommendation: null, pendingAction: null,
    selectedCartItemId: null, latestAddedCartItemId: null, latestSuccessfulMutation: null, executedActionIds: [],
    recentlyRecommendedProductIds: [],
  };
}
function request(message: string, conversationState?: NoriConversationState, activeAllergens: string[] = []): NoriChatRequest {
  return { message, cart: [], activeAllergens, language: "en", conversationState };
}

const interpretations: Array<[string, (value: ReturnType<typeof interpretNoriRequest>) => boolean]> = [
  ["meals under $10", value => value.constraints.maxBudget === 10],
  ["at least 35g protein", value => value.constraints.minProtein === 35],
  ["under 500 calories", value => value.constraints.maxCalories === 500],
  ["show vegan meals", value => value.constraints.dietaryTags.includes("vegan")],
  ["show vegetarian meals", value => value.constraints.dietaryTags.includes("vegetarian")],
  ["show kids meals", value => value.constraints.kids],
  ["recommend spicy food", value => value.constraints.spicy],
  ["show hot drinks", value => value.constraints.categories.includes("hot_drink")],
  ["show cold drinks", value => value.constraints.categories.includes("cold_drink")],
  ["show desserts", value => value.constraints.wantsDessert],
  ["I want beef, cheese and pickles inside a bun", value => value.constraints.categories.includes("burger")],
  ["I need something filling that I can eat with my hands", value => value.constraints.wantsHandheldFood && value.constraints.categories.includes("burger")],
  ["I need food after the gym", value => value.constraints.wantsPostWorkoutMeal && value.constraints.minProtein === 20],
  ["I want something light and fresh", value => value.constraints.categories.includes("salad")],
  ["I want something sweet", value => value.constraints.categories.includes("dessert")],
  ["I want something warm to drink", value => value.constraints.drinkTemperature === "hot"],
  ["I want plant-based food", value => value.constraints.dietaryTags.includes("vegan")],
  ["I don't feel like eating meat", value => value.constraints.dietaryTags.includes("vegetarian")],
  ["I don't want anything fried", value => value.constraints.excludedIngredients.includes("fried")],
  ["I want something my child will enjoy", value => value.constraints.kids],
  ["I want something delicious and filling", value => value.clarificationNeeded],
  ["also make it spicy", value => value.isContinuation && value.constraints.spicy],
  ["add a drink", value => value.isContinuation && value.constraints.wantsDrink],
  ["keep it under $15", value => value.isContinuation && value.constraints.maxBudget === 15],
  ["add it", value => value.referencesPreviousProduct],
];

for (const [message, assertion] of interpretations) {
  test(`interprets: ${message}`, () => assert.equal(assertion(interpretNoriRequest(message, state())), true));
}

const searches: Array<[string, (product: (typeof noriMenuProducts)[number]) => boolean]> = [
  ["Show meals under $10", product => product.price <= 10],
  ["Show meals with at least 35g protein", product => product.proteinGrams >= 35],
  ["Show meals under 500 calories", product => product.cal <= 500],
  ["Show vegan meals", product => product.dietaryTags.includes("vegan")],
  ["Show vegetarian meals", product => product.dietaryTags.some(tag => tag === "vegetarian" || tag === "vegan")],
  ["Show kids meals", product => product.category === "kids_meal"],
  ["Recommend spicy food", product => product.spiceLevel > 0 || product.dietaryTags.includes("spicy")],
  ["Show hot drinks", product => product.category === "hot_drink"],
  ["Show cold drinks", product => product.category === "cold_drink"],
  ["Show desserts", product => product.category === "dessert"],
];

for (const [message, assertion] of searches) {
  test(`validates search: ${message}`, async () => {
    const result = await new NoriAgentService().process(request(message));
    assert.ok(result.recommendedProducts.length > 0);
    assert.ok(result.recommendedProducts.every(assertion));
  });
}

test("kids results never include coffee or adult meals", async () => {
  const result = await new NoriAgentService().process(request("I want something my child will enjoy"));
  assert.ok(result.recommendedProducts.every(product => product.category === "kids_meal"));
  assert.ok(result.recommendedProducts.every(product => !/coffee|espresso|cold brew/i.test(product.name)));
});

test("active allergens exclude containing kids products", async () => {
  const result = await new NoriAgentService().process(request("Show kids meals", undefined, ["Milk"]));
  assert.ok(result.recommendedProducts.every(product => !product.allergens.some(value => value.toLowerCase() === "milk")));
});

test("validator rejects invalid numeric, dietary, spicy, availability and allergen matches", () => {
  const base = noriMenuProducts[0];
  const interpretation = interpretNoriRequest("Show vegan spicy meals with at least 100g protein under 100 calories", {
    ...state(), activeAllergens: base.allergens,
  });
  const synthetic = { ...base, available: false, inStock: false };
  const result = validateRecommendations([synthetic], interpretation);
  assert.equal(result.valid.length, 0);
  const reasons = result.rejected[0]?.reasons ?? [];
  assert.ok(reasons.includes("unavailable"));
  assert.ok(reasons.includes("out of stock"));
  assert.ok(reasons.includes("below protein minimum"));
  assert.ok(reasons.includes("above calorie maximum"));
  assert.ok(reasons.includes("not vegan"));
  assert.ok(reasons.includes("contains active allergen"));
});
