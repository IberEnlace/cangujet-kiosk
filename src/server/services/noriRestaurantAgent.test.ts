import assert from "node:assert/strict";
import test from "node:test";
import type { AIProvider } from "../types/aiProvider";
import type { NoriCartItem, NoriChatRequest, NoriConversationState } from "../types/noriChat";
import { NoriAgentService } from "./noriAgentService";

function request(
  message: string,
  conversationState?: NoriConversationState,
  cart: NoriCartItem[] = [],
  language: NoriChatRequest["language"] = "en",
): NoriChatRequest {
  return { message, cart, activeAllergens: [], language, conversationState };
}

async function turn(
  agent: NoriAgentService,
  message: string,
  state?: NoriConversationState,
  cart: NoriCartItem[] = [],
  language: NoriChatRequest["language"] = "en",
) {
  return agent.process(request(message, state, cart, language));
}

test("semantic restaurant needs become structured ranking priorities", async () => {
  const agent = new NoriAgentService();
  const cases: Array<{
    message: string;
    priority: NonNullable<NoriConversationState["rankingPriorities"]>[number];
    validate: (result: Awaited<ReturnType<typeof turn>>) => boolean;
  }> = [
    { message: "I'm starving.", priority: "filling", validate: result => result.recommendedProducts.every(product => !["side", "dessert", "hot_drink", "cold_drink"].includes(product.category)) },
    { message: "I'm on a diet.", priority: "healthy", validate: result => /calories.*protein/i.test(result.reply) },
    { message: "I'm going to the gym.", priority: "protein", validate: result => result.recommendedProducts.every(product => product.proteinGrams >= 20) },
    { message: "I'm in a hurry.", priority: "quick", validate: result => /verified preparation times/i.test(result.reply) },
    { message: "I don't want something heavy.", priority: "light", validate: result => result.recommendedProducts.every(product => ["salad", "healthy_bowl"].includes(product.category)) },
    { message: "I want something refreshing.", priority: "refreshing", validate: result => ["cold_drink", "salad", "healthy_bowl"].includes(result.recommendedProducts[0]?.category ?? "") },
    { message: "I'm not sure.", priority: "popular", validate: result => result.recommendedProducts.length > 0 },
  ];

  for (const scenario of cases) {
    const result = await turn(agent, scenario.message);
    assert.equal(result.intent, "recommendation", scenario.message);
    assert.ok(result.conversationState.rankingPriorities?.includes(scenario.priority), scenario.message);
    assert.ok(scenario.validate(result), scenario.message);
  }
});

test("children and euro budget language infer safe session constraints", async () => {
  const agent = new NoriAgentService();
  const children = await turn(agent, "I have children.");
  assert.ok(children.recommendedProducts.length > 0);
  assert.ok(children.recommendedProducts.every(product => product.category === "kids_meal"));

  const budget = await turn(agent, "I only have 15 euros.");
  assert.equal(budget.intent, "constraint_update");
  assert.equal(budget.conversationState.maxBudget, 15);
  assert.equal((budget.reply.match(/\?/g) ?? []).length, 1);
});

test("ingredient dislikes persist, affect recommendations, and can be forgotten", async () => {
  const agent = new NoriAgentService();
  const dislike = await turn(agent, "I don't like mushrooms.");
  assert.ok(dislike.conversationState.preferenceMemory?.dislikedIngredients.includes("mushrooms"));

  const pizza = await turn(agent, "Recommend a vegetarian pizza.", dislike.conversationState);
  assert.ok(pizza.recommendedProducts.length > 0);
  assert.ok(pizza.recommendedProducts.every(product =>
    ![product.description, ...product.ingredients].join(" ").toLowerCase().includes("mushroom")));

  const forgotten = await turn(agent, "Forget mushrooms.", pizza.conversationState);
  assert.equal(forgotten.conversationState.preferenceMemory?.dislikedIngredients.includes("mushrooms"), false);
});

test("vegetarian and non-spicy preferences remain active until cleared", async () => {
  const agent = new NoriAgentService();
  const vegetarian = await turn(agent, "Only vegetarian today.");
  const mild = await turn(agent, "No spicy food.", vegetarian.conversationState);
  const result = await turn(agent, "Recommend a meal.", mild.conversationState);
  assert.ok(result.recommendedProducts.length > 0);
  assert.ok(result.recommendedProducts.every(product =>
    product.dietaryTags.includes("vegetarian") || product.dietaryTags.includes("vegan")));
  assert.ok(result.recommendedProducts.every(product => product.spiceLevel === 0));

  const cleared = await turn(agent, "Clear my preferences.", result.conversationState);
  assert.deepEqual(cleared.conversationState.persistentDietaryPreferences, []);
  assert.deepEqual(cleared.conversationState.preferenceMemory?.dislikedIngredients, []);
  assert.equal(cleared.conversationState.preferenceMemory?.avoidSpicy, false);
});

test("allergy memory remains active and requires an explicit safety reset", async () => {
  const agent = new NoriAgentService();
  const allergy = await turn(agent, "I have a milk allergy.");
  assert.ok(allergy.conversationState.activeAllergens.some(value => value.toLowerCase() === "milk"));
  const cleared = await turn(agent, "Clear my allergies.", allergy.conversationState);
  assert.deepEqual(cleared.conversationState.activeAllergens, []);
  assert.match(cleared.reply, /tell me again if any allergy still applies/i);
});

test("pizza and dessert show useful choices while drinks ask one useful follow-up", async () => {
  const agent = new NoriAgentService();

  const pizza = await turn(agent, "I want pizza.");
  assert.ok(pizza.recommendedProducts.length > 0);
  assert.ok(pizza.recommendedProducts.every(product => product.category === "pizza"));

  const drinkQuestion = await turn(agent, "I want a drink.");
  assert.match(drinkQuestion.reply, /hot drink or a cold drink/i);
  assert.equal((drinkQuestion.reply.match(/\?/g) ?? []).length, 1);
  const cold = await turn(agent, "Cold.", drinkQuestion.conversationState);
  assert.ok(cold.recommendedProducts.every(product => product.category === "cold_drink"));

  const dessert = await turn(agent, "I want dessert.");
  assert.ok(dessert.recommendedProducts.length > 0);
  assert.ok(dessert.recommendedProducts.every(product => product.category === "dessert"));
});

test("short refinements preserve context through comparison and cart confirmation", async () => {
  const agent = new NoriAgentService();
  const healthy = await turn(agent, "Healthy.");
  const protein = await turn(agent, "More protein.", healthy.conversationState);
  assert.equal(protein.conversationState.rankingPriorities?.[0], "protein");
  const cheaper = await turn(agent, "Cheaper.", protein.conversationState);
  assert.equal(cheaper.conversationState.rankingPriorities?.[0], "price");

  const compared = await turn(agent, "Compare the first two.", cheaper.conversationState);
  assert.equal(compared.intent, "compare_products");
  assert.equal(compared.recommendedProducts.length, 2);
  const customized = await turn(agent, "Remove cheese.", compared.conversationState);
  assert.equal(customized.intent, "customization_question");
  const add = await turn(agent, "Add the second one.", customized.conversationState);
  assert.equal(add.conversationState.pendingAction?.type, "confirm_cart_change");
  const confirmed = await turn(agent, "Yes.", add.conversationState);
  const action = confirmed.actions.find(item => item.type === "add_to_cart");
  assert.ok(action && action.type === "add_to_cart");
  if (!action || action.type !== "add_to_cart") return;
  const cart: NoriCartItem[] = [{
    productId: action.productId,
    quantity: action.quantity,
    unitPrice: action.unitPrice,
    customizations: Object.fromEntries(action.customizations.map(item => [item.groupId, item.optionName])),
  }];
  const checkout = await turn(agent, "Checkout.", confirmed.conversationState, cart);
  assert.equal(checkout.intent, "checkout");
  assert.equal(checkout.conversationState.pendingAction?.type, "confirm_checkout");
});

test("a confirmed main item receives one safe, non-mutating companion suggestion", async () => {
  const agent = new NoriAgentService();
  const selected = await turn(agent, "Tell me about the cangujet Classic Beef Burger.");
  const pending = await turn(agent, "Add it to my cart.", selected.conversationState);
  const confirmed = await turn(agent, "Yes.", pending.conversationState);
  assert.equal(confirmed.actions.filter(action => action.type === "add_to_cart").length, 1);
  assert.match(confirmed.reply, /Rosemary Fries.*natural match/i);
  assert.ok(confirmed.conversationState.suggestedCompanionProductIds?.includes("side-rosemary-fries"));
});

test("structured semantic requests avoid unnecessary provider planning calls", async () => {
  let calls = 0;
  const provider: AIProvider = {
    buildPrompt: () => "",
    callTools: async () => { calls += 1; return []; },
    generateResponse: async () => { throw new Error("not used"); },
  };
  const result = await turn(new NoriAgentService(provider), "I'm starving.");
  assert.ok(result.recommendedProducts.length > 0);
  assert.equal(calls, 0);
});

test("Turkish semantic needs use the same reasoning pipeline", async () => {
  const result = await turn(new NoriAgentService(), "Çok açım, doyurucu bir şey istiyorum.", undefined, [], "tr");
  assert.equal(result.intent, "recommendation");
  assert.ok(result.conversationState.rankingPriorities?.includes("filling"));
  assert.ok(result.recommendedProducts.length > 0);
  assert.match(result.reply, /doyurucu|protein|kalori/i);
});

test("Turkish protein and affordability language produces structured recommendations", async () => {
  const agent = new NoriAgentService();
  const cases = [
    { message: "Proteinli ama ucuz bir şey istiyorum", priorities: ["protein", "price"] },
    { message: "Uygun fiyatlı yüksek proteinli yemek öner", priorities: ["protein", "price"] },
    { message: "Spordan sonra ekonomik ne yiyebilirim?", priorities: ["protein", "price"] },
    { message: "Proteini yüksek olsun ama çok pahalı olmasın", priorities: ["protein", "price"] },
    { message: "Proteinli bir şey istiyorum", priorities: ["protein"] },
    { message: "Ucuz bir yemek istiyorum", priorities: ["price"] },
  ] as const;

  for (const scenario of cases) {
    const result = await turn(agent, scenario.message, undefined, [], "tr");
    assert.equal(result.intent, "recommendation", scenario.message);
    assert.ok(result.recommendedProducts.length > 0, scenario.message);
    assert.doesNotMatch(result.reply, /ne yapmamı istediğinizden emin değilim/i, scenario.message);
    for (const priority of scenario.priorities) {
      assert.ok(result.conversationState.rankingPriorities?.includes(priority), `${scenario.message}: ${priority}`);
    }
    for (const product of result.recommendedProducts) {
      assert.ok(result.reply.includes(product.name), `${scenario.message}: ${product.name}`);
      assert.ok(result.reply.includes(`${product.proteinGrams.toLocaleString("tr-TR")} g protein`), `${scenario.message}: protein`);
      assert.ok(result.reply.includes(`$${product.price.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`), `${scenario.message}: price`);
    }
  }
});

test("Daha ucuz refines a prior Turkish protein recommendation", async () => {
  const agent = new NoriAgentService();
  const protein = await turn(agent, "Proteinli bir şey istiyorum", undefined, [], "tr");
  const cheaper = await turn(agent, "Daha ucuz", protein.conversationState, [], "tr");

  assert.equal(cheaper.intent, "recommendation");
  assert.equal(cheaper.conversationState.rankingPriorities?.[0], "price");
  assert.ok(cheaper.conversationState.rankingPriorities?.includes("protein"));
  assert.equal(cheaper.conversationState.minProtein, protein.conversationState.minProtein);
  assert.ok(cheaper.recommendedProducts.length > 0);
  assert.match(cheaper.reply, /fiyat\/protein dengesi/i);
});

test("Biraz daha proteinli refines a prior Turkish affordable recommendation", async () => {
  const agent = new NoriAgentService();
  const affordable = await turn(agent, "Ucuz bir yemek istiyorum", undefined, [], "tr");
  const protein = await turn(agent, "Biraz daha proteinli", affordable.conversationState, [], "tr");

  assert.equal(protein.intent, "recommendation");
  assert.equal(protein.conversationState.rankingPriorities?.[0], "protein");
  assert.ok(protein.conversationState.rankingPriorities?.includes("price"));
  assert.equal(protein.conversationState.minProtein, null);
  assert.ok(protein.recommendedProducts.length > 0);
  assert.match(protein.reply, /fiyat\/protein dengesi/i);
});
