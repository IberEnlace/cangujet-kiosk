import assert from "node:assert/strict";
import test from "node:test";
import { checkProductAllergens } from "../../app/services/noriMenuEngine";
import type {
  AIProvider,
  NoriSemanticInterpretation,
} from "../types/aiProvider";
import type {
  NoriCartItem,
  NoriChatRequest,
  NoriConversationState,
  NoriLanguage,
} from "../types/noriChat";
import { NoriAgentService } from "./noriAgentService";

const genericFallback = /not sure what you want|ne yapmamı istediğinizden emin değilim|could not connect that request|ilişkilendiremedim/i;

function request(
  message: string,
  language: NoriLanguage,
  conversationState?: NoriConversationState,
  cart: NoriCartItem[] = [],
): NoriChatRequest {
  return { message, language, conversationState, cart, activeAllergens: [] };
}

async function turn(
  agent: NoriAgentService,
  message: string,
  language: NoriLanguage,
  state?: NoriConversationState,
  cart: NoriCartItem[] = [],
) {
  return agent.process(request(message, language, state, cart));
}

function assertActionable(result: Awaited<ReturnType<typeof turn>>, message: string) {
  assert.notEqual(result.intent, "unsupported", message);
  assert.doesNotMatch(result.reply, genericFallback, message);
  assert.ok(result.recommendedProducts.every(product => product.available && product.inStock), message);
}

test("required Turkish paraphrases become actionable structured restaurant requests", async () => {
  const cases = [
    { message: "Proteinli ama ucuz bir şey istiyorum", priorities: ["protein", "price"] },
    { message: "Uygun fiyatlı ve yüksek proteinli yemek öner", priorities: ["protein", "price"] },
    { message: "Proteini yüksek olsun ama pahalı olmasın", priorities: ["protein", "price"] },
    { message: "Spordan sonra ekonomik ne yiyebilirim?", priorities: ["protein", "price"] },
    { message: "Çok açım ama ağır bir şey istemiyorum", priorities: ["filling", "light"] },
    { message: "Tok tutsun ama kalorisi çok yüksek olmasın", priorities: ["filling", "light"] },
    { message: "Et yemiyorum, ne önerirsin?", dietary: "vegetarian" },
    { message: "Acısız ve hafif bir şey istiyorum", priorities: ["light"], excluded: "spicy" },
    { message: "Çocuklar için uygun bir şey var mı?", kids: true },
    { message: "Süt alerjim var, güvenli seçenekleri göster", allergen: "milk" },
    { message: "Emin değilim, sen seç", priorities: ["popular"] },
    { message: "Hızlı ve uygun fiyatlı bir şey lazım", priorities: ["quick", "price"] },
  ] as const;

  for (const scenario of cases) {
    const result = await turn(new NoriAgentService(), scenario.message, "tr");
    assertActionable(result, scenario.message);
    for (const priority of "priorities" in scenario ? scenario.priorities : []) {
      assert.ok(result.conversationState.rankingPriorities?.includes(priority), `${scenario.message}: ${priority}`);
    }
    if ("dietary" in scenario) assert.ok(result.conversationState.dietaryPreferences.includes(scenario.dietary));
    if ("excluded" in scenario) assert.ok(result.conversationState.excludedIngredients?.includes(scenario.excluded));
    if ("allergen" in scenario) assert.ok(result.conversationState.activeAllergens.some(value => value.toLowerCase() === scenario.allergen));
    if ("kids" in scenario) assert.ok(result.recommendedProducts.every(product => product.category === "kids_meal"));
  }
});

test("required Turkish refinements preserve and reorder the current preference set", async () => {
  const agent = new NoriAgentService();
  const budget = await turn(agent, "10 dolar bütçem var", "tr");
  const initial = await turn(agent, "Proteinli bir yemek öner", "tr", budget.conversationState);
  const cheaper = await turn(agent, "Bir tık daha ucuzu var mı?", "tr", initial.conversationState);
  assertActionable(cheaper, "Bir tık daha ucuzu var mı?");
  assert.equal(cheaper.conversationState.rankingPriorities?.[0], "price");
  assert.ok(cheaper.conversationState.rankingPriorities?.includes("protein"));
  assert.equal(cheaper.conversationState.maxBudget, 10);

  const protein = await turn(agent, "Daha proteinli olanı göster", "tr", cheaper.conversationState);
  assertActionable(protein, "Daha proteinli olanı göster");
  assert.equal(protein.conversationState.rankingPriorities?.[0], "protein");
  const sameBudget = await turn(agent, "Aynı bütçede başka ne var?", "tr", protein.conversationState);
  assertActionable(sameBudget, "Aynı bütçede başka ne var?");
  assert.equal(sameBudget.conversationState.maxBudget, 10);
  assert.ok(sameBudget.recommendedProducts.every(product => product.price <= 10));
});

test("required Turkish candidate references resolve without guessing", async () => {
  const agent = new NoriAgentService();
  const options = await turn(agent, "Uygun fiyatlı yemek öner", "tr");
  assert.ok(options.recommendedProducts.length >= 2);
  const secondId = options.recommendedProducts[1]!.id;

  const second = await turn(agent, "İlki yerine ikincisini ekle", "tr", options.conversationState);
  assert.equal(second.conversationState.pendingAction?.type, "confirm_cart_change");
  assert.equal(second.conversationState.pendingAction?.productId, secondId);

  const other = await turn(agent, "Bunu değil öbürünü", "tr", options.conversationState);
  assert.equal(other.intent, "product_details");
  assert.equal(other.recommendedProducts[0]?.id, secondId);

  const compared = await turn(agent, "İlk ikisini karşılaştır ve ucuz olanı seç", "tr", options.conversationState);
  assert.equal(compared.intent, "compare_products");
  const expectedCheapest = [...options.recommendedProducts.slice(0, 2)].sort((a, b) => a.price - b.price)[0]!;
  assert.equal(compared.conversationState.selectedProductId, expectedCheapest.id);

  const healthier = await turn(agent, "Daha sağlıklı olan hangisi?", "tr", compared.conversationState);
  assert.equal(healthier.intent, "comparison_follow_up");
  assert.equal(healthier.recommendedProducts.length, 2);
});

test("Turkish multi-customization language stays in the documented customization flow", async () => {
  const agent = new NoriAgentService();
  const selected = await turn(agent, "cangujet Classic Beef Burger hakkında bilgi ver", "tr");
  const result = await turn(agent, "Peyniri çıkarıp büyük boy yap", "tr", selected.conversationState);
  assert.equal(result.intent, "customization_question");
  assert.doesNotMatch(result.reply, genericFallback);
  assert.ok((result.reply.match(/\?/g) ?? []).length <= 1);
});

test("required English paraphrases use the shared structured behavior", async () => {
  const cases = [
    { message: "I want something high in protein but affordable", priorities: ["protein", "price"] },
    { message: "Cheap and healthy", priorities: ["price", "healthy"] },
    { message: "Something filling but not too heavy", priorities: ["filling", "light"] },
    { message: "I just finished working out", priorities: ["protein"] },
    { message: "I do not eat meat", dietary: "vegetarian" },
    { message: "I have a milk allergy", allergen: "milk" },
    { message: "Something quick for my children", priorities: ["quick"], kids: true },
    { message: "What would you choose?", priorities: ["popular"] },
    { message: "I am not sure, recommend something", priorities: ["popular"] },
  ] as const;

  for (const scenario of cases) {
    const result = await turn(new NoriAgentService(), scenario.message, "en");
    assertActionable(result, scenario.message);
    for (const priority of "priorities" in scenario ? scenario.priorities : []) {
      assert.ok(result.conversationState.rankingPriorities?.includes(priority), `${scenario.message}: ${priority}`);
    }
    if ("dietary" in scenario) assert.ok(result.conversationState.dietaryPreferences.includes(scenario.dietary));
    if ("allergen" in scenario) assert.ok(result.conversationState.activeAllergens.some(value => value.toLowerCase() === scenario.allergen));
    if ("kids" in scenario) assert.ok(result.recommendedProducts.every(product => product.category === "kids_meal"));
  }
});

test("required English references and refinements operate on latest candidates", async () => {
  const agent = new NoriAgentService();
  const initial = await turn(agent, "I want something high in protein but affordable", "en");
  const cheaper = await turn(agent, "Show me a cheaper option", "en", initial.conversationState);
  assert.equal(cheaper.conversationState.rankingPriorities?.[0], "price");
  const protein = await turn(agent, "More protein", "en", cheaper.conversationState);
  assert.equal(protein.conversationState.rankingPriorities?.[0], "protein");
  const compared = await turn(agent, "Compare the first two", "en", protein.conversationState);
  assert.equal(compared.intent, "compare_products");
  const add = await turn(agent, "Add whichever is healthier", "en", compared.conversationState);
  assert.equal(add.conversationState.pendingAction?.type, "confirm_cart_change");

  const other = await turn(agent, "Not that one, the other one", "en", protein.conversationState);
  assert.equal(other.intent, "product_details");
  assert.notEqual(other.recommendedProducts[0]?.id, protein.conversationState.selectedProductId);

  const sameBudget = await turn(agent, "Keep it under my current budget", "en", cheaper.conversationState);
  assertActionable(sameBudget, "Keep it under my current budget");
  assert.equal(sameBudget.conversationState.maxBudget, cheaper.conversationState.maxBudget);
});

test("required multi-turn Turkish recommendation and confirmation flow accumulates soft goals", async () => {
  const agent = new NoriAgentService();
  let result = await turn(agent, "Proteinli bir şey istiyorum.", "tr");
  result = await turn(agent, "Daha ucuz.", "tr", result.conversationState);
  result = await turn(agent, "Biraz daha hafif.", "tr", result.conversationState);
  assert.deepEqual(result.conversationState.rankingPriorities?.slice(0, 3), ["light", "price", "protein"]);
  result = await turn(agent, "İlk ikisini karşılaştır.", "tr", result.conversationState);
  assert.equal(result.intent, "compare_products");
  result = await turn(agent, "Daha sağlıklı olanı ekle.", "tr", result.conversationState);
  assert.equal(result.conversationState.pendingAction?.type, "confirm_cart_change");
  assert.equal(result.actions.length, 0);
});

test("required multi-turn pizza flow keeps dislikes and resolves the second option", async () => {
  const agent = new NoriAgentService();
  let result = await turn(agent, "I don't like mushrooms.", "en");
  result = await turn(agent, "Recommend a pizza.", "en", result.conversationState);
  assert.ok(result.recommendedProducts.length >= 2);
  assert.ok(result.recommendedProducts.every(product =>
    ![product.description, ...product.ingredients].join(" ").toLowerCase().includes("mushroom")));
  result = await turn(agent, "Make it cheaper.", "en", result.conversationState);
  const expectedId = result.recommendedProducts[1]!.id;
  result = await turn(agent, "Add the second one.", "en", result.conversationState);
  assert.equal(result.conversationState.pendingAction?.type, "confirm_cart_change");
  assert.equal(result.conversationState.pendingAction?.productId, expectedId);
});

test("required multi-turn allergy and drink clarifications preserve original tasks", async () => {
  const agent = new NoriAgentService();
  let dessert = await turn(agent, "Süt alerjim var.", "tr");
  dessert = await turn(agent, "Tatlı öner.", "tr", dessert.conversationState);
  assert.ok(dessert.recommendedProducts.every(product => checkProductAllergens(product, ["Milk"]).contains.length === 0));
  dessert = await turn(agent, "İlki güvenli mi?", "tr", dessert.conversationState);
  assert.equal(dessert.intent, "allergen_check");
  dessert = await turn(agent, "Sepete ekle.", "tr", dessert.conversationState);
  assert.equal(dessert.conversationState.pendingAction?.type, "confirm_cart_change");

  let drink = await turn(agent, "I want a drink.", "en");
  assert.equal((drink.reply.match(/\?/g) ?? []).length, 1);
  drink = await turn(agent, "Cold.", "en", drink.conversationState);
  assert.ok(drink.recommendedProducts.length > 0);
  assert.ok(drink.recommendedProducts.every(product => product.category === "cold_drink"));
});

test("validated semantic provider output recovers unfamiliar meaningful wording without direct actions", async () => {
  let semanticCalls = 0;
  let toolCalls = 0;
  const semantic: NoriSemanticInterpretation = {
    primaryIntent: "recommendation",
    secondaryIntents: [],
    confidence: 0.91,
    needsClarification: false,
    clarificationReason: null,
    constraints: {
      maxBudget: null,
      pricePreference: "affordable",
      minProtein: null,
      maxCalories: null,
      portionPreference: null,
      dietaryPreferences: [],
      allergens: [],
      excludedIngredients: [],
      preferredIngredients: [],
      spicePreference: null,
      temperaturePreference: null,
      category: null,
      mealType: "meal",
      speedPreference: null,
      healthPreference: null,
      satietyPreference: "filling",
    },
    references: {
      selectedOrdinal: null,
      refersToPreviousRecommendations: false,
      refersToCurrentCart: false,
      refersToLastProduct: false,
    },
  };
  const provider: AIProvider = {
    buildPrompt: () => "",
    interpret: async () => { semanticCalls += 1; return semantic; },
    callTools: async () => { toolCalls += 1; return []; },
    generateResponse: async () => { throw new Error("not used"); },
  };
  const result = await turn(new NoriAgentService(provider), "Could you find me a sensible refuel that won't strain my wallet?", "en");
  assert.equal(result.intent, "recommendation");
  assert.ok(result.conversationState.rankingPriorities?.includes("price"));
  assert.ok(result.conversationState.rankingPriorities?.includes("filling"));
  assert.ok(result.recommendedProducts.length > 0);
  assert.equal(result.actions.filter(action => action.type === "add_to_cart").length, 0);
  assert.equal(semanticCalls, 1);
  assert.equal(toolCalls, 0);
});

test("invalid semantic provider output is rejected and diagnostics contain no raw message", async () => {
  const message = "A wholly unfamiliar dining expression";
  let toolCalls = 0;
  const provider: AIProvider = {
    buildPrompt: () => "",
    interpret: async () => ({ primaryIntent: "add_to_cart", confidence: 7 }),
    callTools: async () => { toolCalls += 1; return []; },
    generateResponse: async () => { throw new Error("not used"); },
  };
  const result = await turn(new NoriAgentService(provider), message, "en");
  assert.equal(result.intent, "unsupported");
  assert.equal(result.actions.length, 0);
  assert.equal(toolCalls, 0);
  assert.ok(result.conversationState.understandingDiagnostics?.fallbackReason);
  assert.doesNotMatch(JSON.stringify(result.conversationState.understandingDiagnostics), new RegExp(message, "i"));
});

test("high-confidence deterministic requests avoid semantic and planning provider calls", async () => {
  let semanticCalls = 0;
  let toolCalls = 0;
  const provider: AIProvider = {
    buildPrompt: () => "",
    interpret: async () => { semanticCalls += 1; return {}; },
    callTools: async () => { toolCalls += 1; return []; },
    generateResponse: async () => { throw new Error("not used"); },
  };
  const result = await turn(new NoriAgentService(provider), "Proteinli ama ucuz bir şey istiyorum", "tr");
  assert.ok(result.recommendedProducts.length > 0);
  assert.equal(semanticCalls, 0);
  assert.equal(toolCalls, 0);
  assert.deepEqual(result.conversationState.understandingDiagnostics?.selectedTools.sort(), [
    "recommendProducts",
  ]);
});

test("recommendation facts are copied from menu products and direct allergens are never returned", async () => {
  const result = await turn(new NoriAgentService(), "Proteinli ama ucuz bir şey istiyorum", "tr");
  for (const product of result.recommendedProducts) {
    assert.ok(result.reply.includes(product.name));
    assert.ok(result.reply.includes(product.proteinGrams.toLocaleString("tr-TR")));
    assert.ok(result.reply.includes(product.price.toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })));
  }

  const allergy = await turn(new NoriAgentService(), "I have a milk allergy", "en");
  const safe = await turn(new NoriAgentService(), "Recommend a meal", "en", allergy.conversationState);
  assert.ok(safe.recommendedProducts.every(product => checkProductAllergens(product, ["Milk"]).contains.length === 0));
});
