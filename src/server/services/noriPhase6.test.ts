import test from "node:test";
import assert from "node:assert/strict";
import { NoriAgentService } from "./noriAgentService";
import { interpretCustomization } from "./noriCustomizationService";
import { noriMenuProducts, checkProductAllergens } from "../../app/services/noriMenuEngine";
import type { NoriCartItem, NoriChatRequest, NoriConversationState } from "../types/noriChat";

const request = (message: string, state?: NoriConversationState, cart: NoriCartItem[] = [], allergens: string[] = []): NoriChatRequest => ({ message, cart, activeAllergens: allergens, language: "en", conversationState: state });
async function turn(agent: NoriAgentService, message: string, state?: NoriConversationState, cart: NoriCartItem[] = [], allergens: string[] = []) {
  return agent.process(request(message, state, cart, allergens));
}

test("ordering help is deterministic and does not call a provider", async () => {
  let calls = 0;
  const provider = { buildPrompt: () => "", callTools: async () => { calls += 1; return []; }, generateResponse: async () => { throw new Error("not called"); } };
  const result = await turn(new NoriAgentService(provider), "How do I order?");
  assert.equal(result.intent, "ordering_help");
  assert.match(result.reply, /Choose a product.*review your cart.*checkout/i);
  assert.equal(calls, 0);
});

test("healthy recommendation replaces stale burger context and uses nutrition ranking", async () => {
  const agent = new NoriAgentService();
  const burgers = await turn(agent, "Recommend a burger.");
  const healthy = await turn(agent, "Recommend something healthy.", burgers.conversationState);
  assert.equal(healthy.intent, "healthy_recommendation");
  assert.equal(healthy.conversationState.recentRecommendationContext?.queryType, "healthy");
  assert.notDeepEqual(healthy.recommendedProducts.map(item => item.id), burgers.recommendedProducts.map(item => item.id));
  assert.ok(healthy.recommendedProducts.every(item => item.available && item.inStock));
  assert.match(healthy.reply, /calories.*protein/i);
});

test("healthy recommendation excludes direct active allergens", async () => {
  const result = await turn(new NoriAgentService(), "Recommend something healthy.", undefined, [], ["milk"]);
  assert.ok(result.recommendedProducts.every(product => checkProductAllergens(product, ["milk"]).contains.length === 0));
});

test("removing onions updates a pending add and preserves No sauce", async () => {
  const agent = new NoriAgentService();
  const selected = await turn(agent, "Tell me about the Morrow Classic Beef Burger.");
  const add = await turn(agent, "Add it to my cart.", selected.conversationState);
  const sauce = await turn(agent, "No sauce.", add.conversationState);
  const onions = await turn(agent, "Remove onions.", sauce.conversationState);
  assert.match(onions.reply, /No sauce.*No onion/i);
  assert.equal(onions.conversationState.pendingAction?.type, "confirm_cart_change");
  if (onions.conversationState.pendingAction?.type === "confirm_cart_change") assert.equal(onions.conversationState.pendingAction.customizations.length, 2);
});

test("No onions works and unsupported removal stays documented", async () => {
  const agent = new NoriAgentService();
  const selected = await turn(agent, "Tell me about the Morrow Classic Beef Burger.");
  const add = await turn(agent, "Add it to my cart.", selected.conversationState);
  assert.match((await turn(agent, "No onions.", add.conversationState)).reply, /No onion/i);
  const unsupported = await turn(agent, "Remove tomatoes.", add.conversationState);
  assert.match(unsupported.reply, /cannot confirm.*removable/i);
});

test("Extra cheese never maps to Extra greens", () => {
  const salad = noriMenuProducts.find(item => item.id === "salad-tuna")!;
  const match = interpretCustomization(salad, "Extra cheese.");
  assert.notEqual(match?.option.name, "Extra greens");
  assert.equal(match, null);
});

test("nutrition superlatives return global documented extrema", async () => {
  const agent = new NoriAgentService();
  const protein = await turn(agent, "Which meal has the most protein?");
  const calories = await turn(agent, "Which meal has the fewest calories?", protein.conversationState);
  assert.equal(protein.intent, "highest_protein");
  assert.equal(calories.intent, "lowest_calories");
  const eligibleMeals = noriMenuProducts.filter(item => item.available && item.inStock && !["hot_drink", "cold_drink", "dessert", "side"].includes(item.category));
  assert.equal(protein.recommendedProducts[0]?.proteinGrams, Math.max(...eligibleMeals.map(item => item.proteinGrams)));
  assert.equal(calories.recommendedProducts[0]?.cal, Math.min(...eligibleMeals.map(item => item.cal)));
  assert.match(protein.reply, new RegExp(`${protein.recommendedProducts[0]?.proteinGrams} g protein`));
});

test("nutrition superlative category and allergen filters are respected", async () => {
  const result = await turn(new NoriAgentService(), "Which burger has the most protein?", undefined, [], ["milk"]);
  assert.equal(result.intent, "highest_protein");
  assert.equal(result.recommendedProducts[0]?.category, "burger");
  assert.equal(checkProductAllergens(result.recommendedProducts[0]!, ["milk"]).contains.length, 0);
});

test("a previous budget filters but does not replace superlative intent", async () => {
  const agent = new NoriAgentService();
  const budget = await turn(agent, "I only have $10.");
  const result = await turn(agent, "Which meal has the fewest calories?", budget.conversationState);
  assert.equal(result.intent, "lowest_calories");
  assert.ok((result.recommendedProducts[0]?.price ?? Infinity) <= 10);
});

test("food and drink budget request returns an actual valid pair", async () => {
  const result = await turn(new NoriAgentService(), "I have $15 for food and a drink.");
  assert.equal(result.intent, "bundle_recommendation");
  assert.equal(result.recommendedProducts.length, 2);
  assert.ok(result.recommendedProducts.some(item => ["hot_drink", "cold_drink"].includes(item.category)));
  assert.ok(result.recommendedProducts.reduce((sum, item) => sum + item.price, 0) <= 15);
  assert.equal(result.conversationState.recentRecommendationContext?.queryType, "bundle");
});

test("cold-drink bundle respects temperature and Add both requires confirmation", async () => {
  const agent = new NoriAgentService();
  const bundle = await turn(agent, "I want lunch with a cold drink under $15.");
  assert.equal(bundle.recommendedProducts.find(item => item.category.endsWith("drink"))?.category, "cold_drink");
  const add = await turn(agent, "Add both.", bundle.conversationState);
  assert.equal(add.actions.length, 0);
  assert.equal(add.conversationState.pendingAction?.type, "confirm_bundle");
  const confirmed = await turn(agent, "Yes.", add.conversationState);
  assert.equal(confirmed.actions.filter(action => action.type === "add_to_cart").length, 2);
});

test("bundle direct allergens are excluded and impossible budget is explained", async () => {
  const allergen = await turn(new NoriAgentService(), "I have $15 for food and a drink.", undefined, [], ["milk"]);
  assert.ok(allergen.recommendedProducts.every(item => checkProductAllergens(item, ["milk"]).contains.length === 0));
  const impossible = await turn(new NoriAgentService(), "I have $2 for food and a drink.");
  assert.equal(impossible.recommendedProducts.length, 0);
  assert.match(impossible.reply, /No documented food-and-drink pair.*within \$2\.00/i);
});

test("ordinal references and comparison use latest ordered recommendations", async () => {
  const agent = new NoriAgentService();
  const burgers = await turn(agent, "Recommend a burger.");
  const compared = await turn(agent, "Compare the first two burgers.", burgers.conversationState);
  assert.equal(compared.intent, "compare_products");
  assert.deepEqual(compared.conversationState.comparisonContext?.productIds, burgers.recommendedProducts.slice(0, 2).map(item => item.id));
  assert.match(compared.reply, /costs \$.*calories.*protein/i);
});

test("comparison follow-ups retain context for health protein price and gym", async () => {
  const agent = new NoriAgentService();
  const burgers = await turn(agent, "Recommend a burger.");
  const compared = await turn(agent, "Compare the first two burgers.", burgers.conversationState);
  let state = compared.conversationState;
  for (const message of ["Which one is healthier?", "Which one has more protein?", "Which one is cheaper?", "Which one is better for the gym?"]) {
    const result = await turn(agent, message, state);
    state = result.conversationState;
    assert.equal(result.intent, "comparison_follow_up");
    assert.doesNotMatch(result.reply, /Which two/);
  }
});

test("comparison follow-up without context asks which products", async () => {
  const result = await turn(new NoriAgentService(), "Which one is healthier?");
  assert.equal(result.reply, "Please compare two products first, or tell me which two products you mean.");
});

test("single-result superlatives preserve the last multi-option comparison source", async () => {
  const agent = new NoriAgentService();
  const reset = await turn(agent, "Start over.");
  const healthy = await turn(agent, "Recommend something healthy.", reset.conversationState);
  const expected = healthy.recommendedProducts.slice(0, 2).map(product => product.id);
  const protein = await turn(agent, "Which meal has the most protein?", healthy.conversationState);
  const calories = await turn(agent, "Which meal has the fewest calories?", protein.conversationState);
  assert.equal(calories.conversationState.recentRecommendationContext?.productIds.length, 1);
  assert.deepEqual(calories.conversationState.lastMultiOptionContext?.productIds.slice(0, 2), expected);
  const compared = await turn(agent, "Compare the first two options.", calories.conversationState);
  assert.deepEqual(compared.conversationState.comparisonContext?.productIds, expected);
});

test("all deterministic comparison follow-ups use the same comparison context", async () => {
  const agent = new NoriAgentService();
  const healthy = await turn(agent, "Recommend something healthy.");
  const compared = await turn(agent, "Compare the first and second.", healthy.conversationState);
  const expected = compared.conversationState.comparisonContext?.productIds;
  let state = compared.conversationState;
  for (const message of ["Which one is healthier?", "Which one has more protein?", "Which one is better for the gym?"]) {
    const result = await turn(agent, message, state);
    assert.deepEqual(result.conversationState.comparisonContext?.productIds, expected);
    state = result.conversationState;
  }
});

test("comparative add never falls back to a recent single product", async () => {
  const agent = new NoriAgentService();
  const healthy = await turn(agent, "Recommend something healthy.");
  const result = await turn(agent, "Add the healthier one.", healthy.conversationState);
  assert.equal(result.intent, "comparative_add");
  assert.equal(result.actions.length, 0);
  assert.equal(result.conversationState.pendingAction, null);
  assert.equal(result.reply, "I need two compared products before I can choose the healthier one. Please compare two products first.");
});

test("comparative add prepares and confirms only the winner from comparison context", async () => {
  const agent = new NoriAgentService();
  const healthy = await turn(agent, "Recommend something healthy.");
  const compared = await turn(agent, "Compare the first two options.", healthy.conversationState);
  const added = await turn(agent, "Add the healthier one.", compared.conversationState);
  const comparedIds = compared.conversationState.comparisonContext!.productIds;
  assert.equal(added.conversationState.pendingAction?.type, "confirm_cart_change");
  assert.ok(comparedIds.includes(added.conversationState.pendingAction!.productId));
  const confirmed = await turn(agent, "Yes.", added.conversationState);
  assert.equal(confirmed.actions.length, 1);
  assert.equal(confirmed.actions[0]?.type, "add_to_cart");
  assert.equal("productId" in confirmed.actions[0] ? confirmed.actions[0].productId : null, added.conversationState.pendingAction!.productId);
});

test("new recommendation replaces recent context and Start over clears it", async () => {
  const agent = new NoriAgentService();
  const burgers = await turn(agent, "Recommend a burger.");
  const healthy = await turn(agent, "Recommend something healthy.", burgers.conversationState);
  assert.equal(healthy.conversationState.recentRecommendationContext?.queryType, "healthy");
  const reset = await turn(agent, "Start over.", healthy.conversationState);
  assert.equal(reset.conversationState.recentRecommendationContext, null);
  assert.equal(reset.conversationState.comparisonContext, null);
});

test("kids details resolve recent kids recommendation without inventing contents", async () => {
  const agent = new NoriAgentService();
  const kids = await turn(agent, "Recommend a kids meal.");
  assert.equal(kids.conversationState.recentRecommendationContext?.queryType, "kids");
  const details = await turn(agent, "What comes with the kids meal?", kids.conversationState);
  assert.equal(details.intent, "product_details");
  assert.equal(details.recommendedProducts[0]?.id, kids.recommendedProducts[0]?.id);
  assert.match(details.reply, new RegExp(kids.recommendedProducts[0]!.description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 20), "i"));
});

test("milk-allergic kids request gives a specific allergen or cross-contact no-match", async () => {
  const allergy = await turn(new NoriAgentService(), "I'm allergic to milk.");
  const kids = await turn(new NoriAgentService(), "Recommend a kids meal.", allergy.conversationState, [], ["milk"]);
  assert.equal(kids.recommendedProducts.length, 0);
  assert.match(kids.reply, /kids meal.*milk.*cross-contact/i);
});

test("order review includes customizations totals and does not start checkout", async () => {
  const cart: NoriCartItem[] = [{ productId: "burger-beef-classic", name: "Morrow Classic Beef Burger", quantity: 2, unitPrice: 8.9, customizations: { "sauce-choice": "No sauce" } }];
  const result = await turn(new NoriAgentService(), "Review my order.", undefined, cart);
  assert.equal(result.intent, "review_order");
  assert.match(result.reply, /2 Morrow Classic Beef Burger with No sauce: \$17\.80/);
  assert.match(result.reply, /Subtotal: \$17\.80.*Estimated tax: \$1\.42.*Total: \$19\.22/);
  assert.equal(result.actions.length, 0);
  assert.equal(result.conversationState.pendingAction, null);
});

test("empty order review uses its dedicated empty message", async () => {
  const result = await turn(new NoriAgentService(), "Review my order.");
  assert.equal(result.reply, "Your cart is empty. Add an item before reviewing your order.");
});

test("allergen response never calls cross-contact unconditionally safe", async () => {
  const product = noriMenuProducts.find(item => item.id === "side-rosemary-fries")!;
  const allergen = "Milk";
  const selected = await turn(new NoriAgentService(), `Tell me about ${product.name}.`);
  const checked = await turn(new NoriAgentService(), `I'm allergic to ${allergen}.`, selected.conversationState, [], [allergen]);
  assert.doesNotMatch(checked.reply, /\bsafe\b/i);
  assert.match(checked.reply, /may contain|cross-contact|cross contact/i);
});

test("full deterministic cart regression flow remains coherent", async () => {
  const agent = new NoriAgentService();
  let state: NoriConversationState | undefined;
  let cart: NoriCartItem[] = [];
  for (const message of ["Start over.", "I only have $10.", "Recommend a burger.", "Add the first one.", "No sauce."]) {
    const result = await turn(agent, message, state, cart);
    state = result.conversationState;
    assert.notEqual(result.intent, "unsupported");
  }
  const confirmed = await turn(agent, "Yes.", state, cart);
  state = confirmed.conversationState;
  const add = confirmed.actions.find(action => action.type === "add_to_cart");
  assert.ok(add && add.type === "add_to_cart");
  if (add?.type === "add_to_cart") cart = [{ productId: add.productId, name: noriMenuProducts.find(item => item.id === add.productId)?.name, quantity: add.quantity, unitPrice: add.unitPrice ?? noriMenuProducts.find(item => item.id === add.productId)?.price, customizations: Object.fromEntries(add.customizations.map(item => [item.groupId, item.optionName])), customizationObjects: add.customizations, actionId: add.actionId }];
  assert.equal(cart[0]?.customizations?.["sauce-choice"], "No sauce");
  for (const message of ["Show my cart.", "What is my cart total?", "Review my order."]) {
    const result = await turn(agent, message, state, cart);
    state = result.conversationState;
    assert.notEqual(result.intent, "unsupported");
    assert.doesNotMatch(result.reply, /cart is empty/i);
  }
  const clear = await turn(agent, "Clear my cart.", state, cart);
  const cleared = await turn(agent, "Yes.", clear.conversationState, cart);
  assert.equal(cleared.actions.filter(action => action.type === "clear_cart").length, 1);
  cart = [];
  const empty = await turn(agent, "Show my cart.", cleared.conversationState, cart);
  assert.equal(empty.reply, "Your cart is empty.");
});
