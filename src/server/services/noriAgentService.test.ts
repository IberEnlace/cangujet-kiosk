import assert from "node:assert/strict";
import test from "node:test";
import type { AIProvider, AIToolCall } from "../types/aiProvider";
import type { NoriChatRequest, NoriConversationState } from "../types/noriChat";
import { buildRecommendationToolCalls, NoriAgentService } from "./noriAgentService";
import { executeNoriCartActions } from "../../app/services/noriCartActions";

function request(
  message: string,
  conversationState?: NoriConversationState,
  cart: NoriChatRequest["cart"] = [],
): NoriChatRequest {
  return {
    message,
    cart,
    activeAllergens: [],
    language: "en",
    conversationState,
  };
}

test("preserves allergy and budget context for a high-protein meal with a drink", async () => {
  const agent = new NoriAgentService();
  const allergy = await agent.process(request("I'm allergic to milk and gluten."));
  const budget = await agent.process(request("I have $15.", allergy.conversationState));
  const result = await agent.process(request(
    "I need a high-protein lunch with a drink. Recommend the best option and explain why.",
    budget.conversationState,
  ));

  assert.deepEqual(
    result.conversationState.activeAllergens.map(value => value.toLowerCase()).sort(),
    ["gluten", "milk"],
  );
  assert.equal(result.conversationState.maxBudget, 15);
  assert.equal(result.conversationState.requestedDrink, true);
  assert.ok(result.conversationState.rankingPriorities?.includes("protein"));
  assert.equal(result.conversationState.minProtein, null);
  assert.ok(result.recommendedProducts.length <= 3);
  assert.match(result.reply, /best match|could not find/i);
  assert.ok(result.warnings.every(warning => warning.type !== "contains"));
});

test("repeating a compatible constraint keeps the previous valid recommendation", async () => {
  const agent = new NoriAgentService();
  const first = await agent.process(request("Recommend a high-protein lunch with a drink under $15."));
  const selectedProductId = first.conversationState.selectedProductId;
  assert.ok(selectedProductId);

  const repeated = await agent.process(request(
    "I need a high-protein lunch with a drink.",
    first.conversationState,
  ));
  assert.equal(repeated.conversationState.selectedProductId, selectedProductId);
  assert.ok(repeated.recommendedProducts.some(product => product.id === selectedProductId));
  assert.doesNotMatch(repeated.reply, /could not find/i);
});

test("asks for a product before answering a customization question", async () => {
  const result = await new NoriAgentService().process(request("Can I remove the cheese?"));
  assert.equal(result.intent, "customization_question");
  assert.equal(result.conversationState.pendingAction?.type, "clarify_product");
  assert.match(result.reply, /which product/i);
});

test("uses the selected product for a later customization question", async () => {
  const agent = new NoriAgentService();
  const selected = await agent.process(request("Tell me about the Morrow Classic Beef Burger."));
  const result = await agent.process(request("Can I remove the cheese?", selected.conversationState));

  assert.equal(result.intent, "customization_question");
  assert.equal(result.conversationState.selectedProductId, "burger-beef-classic");
  assert.match(result.reply, /Morrow Classic Beef Burger/i);
  assert.match(result.reply, /cross-contact/i);
});

test("matches sauce to dressing customization synonyms", async () => {
  const agent = new NoriAgentService();
  const selected = await agent.process(request("Tell me about the Power Chicken Quinoa Bowl."));
  const result = await agent.process(request("Can I remove the sauce?", selected.conversationState));
  assert.equal(result.intent, "customization_question");
  assert.match(result.reply, /dressing|sauce/i);
  assert.doesNotMatch(result.reply, /does not list/i);
});

test("does not start checkout when the cart is empty", async () => {
  const result = await new NoriAgentService().process(request("Proceed to checkout."));
  assert.equal(result.intent, "checkout");
  assert.match(result.reply, /cart is empty/i);
  assert.equal(result.actions.length, 0);
});

test("summarizes totals and returns a confirmation action for checkout", async () => {
  const result = await new NoriAgentService().process(request(
    "Proceed to checkout.",
    undefined,
    [{ productId: "burger-beef-classic", quantity: 2 }],
  ));
  assert.equal(result.intent, "checkout");
  assert.match(result.reply, /subtotal/i);
  assert.match(result.reply, /estimated tax/i);
  assert.match(result.reply, /total/i);
  assert.equal(result.actions[0]?.type, "CONFIRM_CHECKOUT");
  assert.doesNotMatch(result.reply, /card number|cvv/i);
});

test("compares two named products using menu data", async () => {
  const result = await new NoriAgentService().process(request(
    "Compare Morrow Classic Beef Burger versus Spicy Nori Chicken Burger.",
  ));
  assert.equal(result.intent, "product_comparison");
  assert.equal(result.recommendedProducts.length, 2);
  assert.match(result.reply, /protein/i);
  assert.match(result.reply, /calories/i);
});

test("builds a multi-tool recommendation plan from combined constraints", () => {
  const state: NoriConversationState = {
    preferredLanguage: "en",
    activeAllergens: ["Milk"],
    maxBudget: 15,
    minProtein: 30,
    maxCalories: 650,
    dietaryPreferences: [],
    persistentDietaryPreferences: [],
    requestedCategory: "healthy_bowl",
    requestedDrink: true,
    requestedSpicy: false,
    requestedKids: false,
    requestedDessert: false,
    selectedProductId: null,
    selectedCustomizations: [],
    currentRecommendation: null,
    selectedCartItemId: null,
    latestAddedCartItemId: null,
    latestSuccessfulMutation: null,
    executedActionIds: [],
    recentlyRecommendedProductIds: [],
    pendingAction: null,
  };
  const calls = buildRecommendationToolCalls("high protein bowl with a drink", state);
  assert.ok(calls.length >= 5);
  assert.ok(calls.some(call => call.name === "findByBudget"));
  assert.ok(calls.some(call => call.name === "findHighProtein"));
  assert.ok(calls.some(call => call.name === "findHealthyMeals"));
});

test("falls back to the deterministic plan when a provider returns an invalid tool", async () => {
  const invalidProvider: AIProvider = {
    buildPrompt: () => "test",
    callTools: async () => [{
      name: "inventMenuProduct" as AIToolCall["name"],
      arguments: {},
    }],
    generateResponse: async () => {
      throw new Error("generateResponse should not be used by the decision layer");
    },
  };
  const result = await new NoriAgentService(invalidProvider).process(request(
    "Recommend a high-protein meal under $15.",
  ));
  assert.equal(result.intent, "recommendation");
  assert.ok(result.recommendedProducts.length > 0);
  assert.ok(result.recommendedProducts.every(product => product.price <= 15));
});

test("add request requires confirmation and yes executes the cart action", async () => {
  const agent = new NoriAgentService();
  const recommendations = await agent.process(request("Recommend a high-protein meal under $15."));
  const selected = await agent.process(request("Select the first option.", recommendations.conversationState));
  const requested = await agent.process(request("Add it to my cart.", selected.conversationState));
  const added = await agent.process(request("yes", requested.conversationState));
  const cart: Array<{ id: string; qty: number }> = [];

  executeNoriCartActions(added.actions, {
    addItem: item => {
      const existing = cart.find(entry => entry.id === item.id);
      if (existing) existing.qty += 1;
      else cart.push({ id: item.id, qty: 1 });
    },
  });

  assert.equal(added.actions[0]?.type, "add_to_cart");
  assert.equal(cart[0]?.id, selected.conversationState.selectedProductId);
  assert.equal(cart[0]?.qty, 1);
});

test("repeating add it confirms a pending add action", async () => {
  const agent = new NoriAgentService();
  const selected = await agent.process(request("Tell me about the Power Chicken Quinoa Bowl."));
  const requested = await agent.process(request("Add it to my cart.", selected.conversationState));
  const confirmed = await agent.process(request("Add it to my cart.", requested.conversationState));
  assert.equal(requested.actions.length, 0);
  assert.equal(confirmed.actions[0]?.type, "add_to_cart");
  assert.equal(confirmed.conversationState.pendingAction, null);
});

test("the same confirmation cannot execute a cleared pending action twice", async () => {
  const agent = new NoriAgentService();
  const selected = await agent.process(request("Tell me about the Power Chicken Quinoa Bowl."));
  const requested = await agent.process(request("Add it to my cart.", selected.conversationState));
  const firstConfirmation = await agent.process(request("yes", requested.conversationState));
  const duplicateConfirmation = await agent.process(request("yes", firstConfirmation.conversationState));
  assert.equal(firstConfirmation.actions.filter(action => action.type === "add_to_cart").length, 1);
  assert.equal(duplicateConfirmation.actions.filter(action => action.type === "add_to_cart").length, 0);
});

test("cancellation clears the pending action and selected customizations", async () => {
  const agent = new NoriAgentService();
  const selected = await agent.process(request("Tell me about the Power Chicken Quinoa Bowl."));
  const customized = await agent.process(request("Can I remove the sauce?", selected.conversationState));
  const cancelled = await agent.process(request("cancel", customized.conversationState));
  assert.equal(cancelled.conversationState.pendingAction, null);
  assert.deepEqual(cancelled.conversationState.selectedCustomizations, []);
  assert.equal(cancelled.actions.length, 0);
});

test("no dressing persists into the confirmed cart action with adjusted calculations", async () => {
  const agent = new NoriAgentService();
  const selected = await agent.process(request("Tell me about the Power Chicken Quinoa Bowl."));
  const customized = await agent.process(request("Can I remove the sauce?", selected.conversationState));
  const applied = await agent.process(request("yes", customized.conversationState));
  const requested = await agent.process(request("Add it to my cart.", applied.conversationState));
  const confirmed = await agent.process(request("yes confirm", requested.conversationState));
  const action = confirmed.actions.find(item => item.type === "add_to_cart");

  assert.ok(applied.conversationState.selectedCustomizations.some(item => /dressing/i.test(item.optionName)));
  assert.ok(action && action.type === "add_to_cart");
  assert.ok(action.customizations.some(item => /dressing/i.test(item.optionName)));
  assert.match(requested.reply, /No dressing/i);
  assert.match(requested.reply, /\$\d+\.\d{2}/);
  assert.match(requested.reply, /calories.*protein/i);
  assert.match(requested.reply, /cross-contact/i);
});

test("meal plus drink recommendation asks which portion to add", async () => {
  const agent = new NoriAgentService();
  const recommendation = await agent.process(request("Recommend a high-protein lunch with a drink under $15."));
  const clarification = await agent.process(request("Add it.", recommendation.conversationState));
  assert.equal(clarification.conversationState.pendingAction?.type, "clarify_recommendation");
  assert.equal(clarification.actions.length, 0);
  assert.match(clarification.reply, /only the .* or the .* with/i);
});

test("add both returns two executable cart actions", async () => {
  const agent = new NoriAgentService();
  const recommendation = await agent.process(request("Recommend a high-protein lunch with a drink under $15."));
  const clarification = await agent.process(request("Add it.", recommendation.conversationState));
  const added = await agent.process(request("Add both.", clarification.conversationState));
  assert.equal(added.actions.filter(action => action.type === "add_to_cart").length, 2);
  assert.equal(added.conversationState.pendingAction, null);
  assert.doesNotMatch(added.reply, /^added/i);
  assert.match(added.reply, /please confirm/i);
});

test("yes confirms a pending customization without returning to recommendations", async () => {
  const agent = new NoriAgentService();
  const selected = await agent.process(request("Tell me about the Power Chicken Quinoa Bowl."));
  const proposed = await agent.process(request("Can I remove the sauce from the bowl?", selected.conversationState));
  assert.equal(proposed.conversationState.pendingAction?.type, "apply_customization");
  const confirmed = await agent.process(request("Yes.", proposed.conversationState));
  assert.equal(confirmed.intent, "customization_question");
  assert.equal(confirmed.conversationState.pendingAction, null);
  assert.ok(confirmed.conversationState.selectedCustomizations.some(item => item.optionId === "no-dressing"));
  assert.match(confirmed.reply, /No dressing is now selected/i);
});

test("confirmed customization updates an existing cart item instead of adding a duplicate", async () => {
  const agent = new NoriAgentService();
  const selected = await agent.process(request(
    "Tell me about the Power Chicken Quinoa Bowl.",
    undefined,
    [{ productId: "bowl-chicken-protein", quantity: 1 }],
  ));
  const proposed = await agent.process(request(
    "Can I remove the sauce from the bowl?",
    selected.conversationState,
    [{ productId: "bowl-chicken-protein", quantity: 1 }],
  ));
  const confirmed = await agent.process(request(
    "apply it",
    proposed.conversationState,
    [{ productId: "bowl-chicken-protein", quantity: 1 }],
  ));
  assert.equal(confirmed.actions.length, 1);
  assert.equal(confirmed.actions[0]?.type, "update_cart_customization");
});

test("frontend executor applies every action from a full recommendation", async () => {
  const agent = new NoriAgentService();
  const recommendation = await agent.process(request("Recommend a high-protein lunch with a drink under $15."));
  const clarification = await agent.process(request("Add it.", recommendation.conversationState));
  const actionResponse = await agent.process(request("Add both.", clarification.conversationState));
  const cart: Array<{ id: string; qty: number }> = [];
  const results = executeNoriCartActions(actionResponse.actions, {
    addItem: item => {
      const existing = cart.find(entry => entry.id === item.id);
      if (existing) existing.qty += 1;
      else cart.push({ id: item.id, qty: 1 });
    },
  });
  assert.equal(results.filter(result => result.status === "success").length, 2);
  assert.equal(cart.length, 2);
});

test("frontend executor updates customization on an existing item", async () => {
  const agent = new NoriAgentService();
  const cart = [{ productId: "bowl-chicken-protein", quantity: 1 }];
  const selected = await agent.process(request("Tell me about the Power Chicken Quinoa Bowl.", undefined, cart));
  const proposed = await agent.process(request("Can I remove the sauce?", selected.conversationState, cart));
  const confirmed = await agent.process(request("do it", proposed.conversationState, cart));
  let updated: Record<string, string> | undefined;
  const results = executeNoriCartActions(confirmed.actions, {
    addItem: () => { throw new Error("Customization must not add another item."); },
    updateCustomizations: (_id, customizations) => { updated = customizations; },
  });
  assert.equal(results[0]?.status, "success");
  assert.equal(updated?.["dressing-choice"], "No dressing");
});

test("confirmed frontend actions are reflected in checkout", async () => {
  const agent = new NoriAgentService();
  const selected = await agent.process(request("Tell me about the Power Chicken Quinoa Bowl."));
  const requested = await agent.process(request("Add it to my cart.", selected.conversationState));
  const added = await agent.process(request("yes", requested.conversationState));
  const cart: Array<{ productId: string; quantity: number }> = [];

  executeNoriCartActions(added.actions, {
    addItem: item => {
      const existing = cart.find(entry => entry.productId === item.id);
      if (existing) existing.quantity += 1;
      else cart.push({ productId: item.id, quantity: 1 });
    },
  });
  const checkout = await agent.process(request("Proceed to checkout.", added.conversationState, cart));

  assert.ok(cart.length > 0);
  assert.equal(checkout.actions[0]?.type, "CONFIRM_CHECKOUT");
  assert.doesNotMatch(checkout.reply, /cart is empty/i);
});

test("independent consecutive searches satisfy only their current filters", async () => {
  const agent = new NoriAgentService();
  let result = await agent.process(request("Show me meals under $10."));
  assert.equal(result.conversationState.maxBudget, 10);
  assert.ok(result.recommendedProducts.length > 0);
  assert.ok(
    result.recommendedProducts.every(product => product.price <= 10),
    JSON.stringify(result.recommendedProducts.map(product => ({ id: product.id, price: product.price }))),
  );

  result = await agent.process(request("Show meals with at least 35g protein.", result.conversationState));
  assert.ok(result.recommendedProducts.length > 0);
  assert.ok(result.recommendedProducts.every(product => product.price <= 10 && product.proteinGrams >= 35));

  result = await agent.process(request("Show meals under 500 calories.", result.conversationState));
  assert.ok(result.recommendedProducts.length > 0);
  assert.ok(result.recommendedProducts.every(product => product.price <= 10 && product.cal <= 500));

  result = await agent.process(request("Show me vegan meals.", result.conversationState));
  assert.ok(result.recommendedProducts.length > 0);
  assert.ok(result.recommendedProducts.every(product => product.price <= 10));
  assert.ok(result.recommendedProducts.every(product => product.dietaryTags.includes("vegan")));

  result = await agent.process(request("Show kids meals.", result.conversationState));
  assert.ok(result.recommendedProducts.length > 0);
  assert.ok(result.recommendedProducts.every(product =>
    product.price <= 10 && product.category === "kids_meal"));

  result = await agent.process(request("Recommend spicy food.", result.conversationState));
  assert.ok(result.recommendedProducts.length > 0);
  assert.ok(result.recommendedProducts.every(product =>
    product.price <= 10
    && [...product.tags, ...product.keywords, ...product.vectorTags].some(tag => tag.toLowerCase().includes("spicy"))));
});

test("a prior selected product is not reused by an unrelated fresh search", async () => {
  const agent = new NoriAgentService();
  const selected = await agent.process(request("Tell me about the Roasted Lentil Harvest Salad."));
  assert.equal(selected.conversationState.selectedProductId, "salad-lentil");
  const protein = await agent.process(request("Find meals over 35g protein.", selected.conversationState));
  assert.ok(protein.recommendedProducts.every(product => product.proteinGrams >= 35));
  assert.ok(!protein.recommendedProducts.some(product => product.id === "salad-lentil"));
});

test("a prior allergy check does not override a fresh dietary recommendation", async () => {
  const agent = new NoriAgentService();
  const allergy = await agent.process(request("I'm allergic to milk."));
  const vegan = await agent.process(request("Show me vegan meals.", allergy.conversationState));
  assert.equal(vegan.intent, "recommendation");
  assert.ok(vegan.recommendedProducts.length > 0);
  assert.ok(vegan.recommendedProducts.every(product => product.dietaryTags.includes("vegan")));
});
