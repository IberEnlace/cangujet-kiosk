import test from "node:test";
import assert from "node:assert/strict";
import { restaurantAIConfig } from "../../app/data/aiMenu";
import type { NoriChatRequest, NoriIntent } from "../types/noriChat";
import { createState, NoriAgentService } from "./noriAgentService";
import { normalizeNoriInput, routeNoriIntent } from "./noriIntentRouter";
import { interpretNoriRequest } from "./noriRequestInterpreter";

const state = () => createState({ message: "", cart: [], activeAllergens: [], language: "en" });
const routeCases: Array<[string, NoriIntent]> = [
  ["Are you open tomorrow?", "opening_hours"], ["What are your opening hours?", "opening_hours"],
  ["Can I pay with Apple Pay?", "payment_methods"], ["How can I pay?", "payment_methods"],
  ["How long will my order take?", "order_timing"], ["When will my order be ready?", "order_timing"],
  ["Do you have halal food?", "restaurant_information"], ["Call a staff member.", "staff_assistance"],
  ["Show my cart.", "show_cart"], ["Clear my cart.", "clear_cart"], ["Proceed to checkout.", "checkout"],
  ["Undo that.", "undo"], ["Increase it to 2.", "update_quantity"], ["Add it to my cart.", "add_to_cart"],
  ["Remove it from my cart.", "remove_from_cart"], ["Compare the two best burgers.", "product_comparison"],
  ["Which item has less sugar?", "nutrition_question"], ["Tell me about this burger.", "product_details"],
  ["I'm allergic to milk.", "allergen_check"], ["Will it become safe?", "allergen_check"],
  ["Show me high-fiber meals.", "recommendation"], ["I need at least 40g protein.", "constraint_update"],
  ["I need 200g protein for $3.", "recommendation"], ["I have $15 for two people.", "recommendation"],
  ["I want something low in sugar.", "recommendation"], ["I want food.", "recommendation"],
  ["Forget my budget.", "clarification_answer"], ["Clear my preferences.", "clarification_answer"],
  ["Start over.", "clarification_answer"], ["New order.", "clarification_answer"],
];
for (const [input, expected] of routeCases) test(`phase4 routes: ${input}`, () => assert.equal(routeNoriIntent(input, state()).intent, expected));

const normalizations: Array<[string, string]> = [
  ["an I replace fries with fruit?", "can i replace fries with fruit?"], ["alf sweet.", "half sweet."],
  ["  NO   BEEF ", "no beef"], ["high-protein", "high protein"], ["gluten_free", "gluten free"],
  ["OPEN TOMORROW", "open tomorrow"], ["Apple Pay", "apple pay"], ["  hello  ", "hello"],
  ["no-sauce", "no sauce"], ["lettuce_wrap", "lettuce wrap"], ["post-workout", "post workout"],
  ["high-fiber", "high fiber"], ["low-sugar", "low sugar"], ["new_order", "new order"],
  ["show-cart", "show cart"], ["staff_assistance", "staff assistance"], ["half   sweet", "half sweet"],
  ["NO   CHEESE", "no cheese"], ["after-tax", "after tax"], ["two_people", "two people"],
  ["cold-drink", "cold drink"], ["hot_drink", "hot drink"], ["plant-based", "plant based"],
  ["cross-contact", "cross contact"], ["more-protein", "more protein"], ["the_first_one", "the first one"],
  ["remove-it", "remove it"], ["add_it_back", "add it back"], ["start_over", "start over"],
  ["opening_hours", "opening hours"],
];
for (const [input, expected] of normalizations) test(`phase4 normalizes: ${input}`, () => assert.equal(normalizeNoriInput(input), expected));

const constraintCases: Array<[string, (value: ReturnType<typeof interpretNoriRequest>) => boolean]> = [
  ["I don't feel like eating beef today.", value => value.constraints.excludedIngredients.includes("beef") && !value.constraints.preferredIngredients.includes("beef")],
  ["No cheese.", value => value.constraints.excludedIngredients.includes("cheese")],
  ["Avoid fried food.", value => value.constraints.excludedIngredients.includes("fried")],
  ["I need less than 20g fat.", value => value.constraints.maxFat === 20],
  ["I need at least 40g protein.", value => value.constraints.minProtein === 40],
  ["Show me high-fiber meals.", value => value.constraints.minFiber === 0],
  ["I want something low in sugar.", value => value.constraints.maxSugars === Number.POSITIVE_INFINITY],
  ["I have $15 for two people.", value => value.constraints.maxBudget === 15 && value.constraints.partySize === 2],
  ["Lunch under $10 after tax.", value => value.constraints.maxBudget === 10 && value.constraints.afterTax],
  ["Under 800mg sodium.", value => value.constraints.maxSodium === 800],
];
for (const [input, check] of constraintCases) test(`phase4 extracts: ${input}`, () => assert.ok(check(interpretNoriRequest(input, state()))));

test("phase4 unsupported information never becomes a recommendation", async () => {
  const result = await new NoriAgentService().process({ message: "Who won the game?", cart: [], activeAllergens: [], language: "en" });
  assert.equal(result.intent, "unsupported"); assert.equal(result.recommendedProducts.length, 0);
});
test("phase4 hard protein constraint never returns a failed match", async () => {
  const result = await new NoriAgentService().process({ message: "I need 200g protein for $3.", cart: [], activeAllergens: [], language: "en" });
  assert.ok(result.recommendedProducts.every(item => item.proteinGrams >= 200 && item.price <= 3));
});
test("phase4 beef negation excludes beef products", async () => {
  const result = await new NoriAgentService().process({ message: "I don't feel like eating beef today.", cart: [], activeAllergens: [], language: "en" });
  assert.ok(result.recommendedProducts.every(item => ![item.description, ...item.ingredients].join(" ").toLowerCase().includes("beef")));
});

const request = (message: string, conversationState?: ReturnType<typeof state>): NoriChatRequest => ({ message, cart: [], activeAllergens: [], language: "en", conversationState });

test("phase4.1 budget-only input saves context and asks one clarification", async () => {
  const result = await new NoriAgentService().process(request("I only have $3."));
  assert.equal(result.intent, "constraint_update"); assert.equal(result.conversationState.maxBudget, 3);
  assert.equal((result.reply.match(/\?/g) ?? []).length, 1);
});
test("phase4.1 exclusion-only input saves context and asks one clarification", async () => {
  const result = await new NoriAgentService().process(request("I don't feel like eating beef today."));
  assert.equal(result.intent, "constraint_update"); assert.ok(result.conversationState.excludedIngredients?.includes("beef"));
  assert.equal((result.reply.match(/\?/g) ?? []).length, 1);
});
test("phase4.1 a follow-up recommendation preserves the beef exclusion", async () => {
  const agent = new NoriAgentService();
  const context = await agent.process(request("No beef today."));
  const result = await agent.process(request("Recommend a meal.", context.conversationState));
  assert.ok(result.recommendedProducts.every(item => ![item.description, ...item.ingredients].join(" ").toLowerCase().includes("beef")));
});
test("phase4.1 primary and every alternative satisfy numeric minimum protein", async () => {
  const result = await new NoriAgentService().process(request("Recommend a meal with at least 40g protein."));
  assert.ok(result.recommendedProducts.length > 0);
  assert.ok(result.recommendedProducts.every(item => item.proteinGrams >= 40));
});
test("phase4.1 returns fewer alternatives when fewer satisfy a hard constraint", async () => {
  const result = await new NoriAgentService().process(request("Recommend a meal with at least 49g protein."));
  assert.ok(result.recommendedProducts.length < 3);
  assert.ok(result.recommendedProducts.every(item => item.proteinGrams >= 49));
});
test("phase4.1 impossible request offers choices without safe relaxation", async () => {
  const result = await new NoriAgentService().process(request("Recommend 200g protein for $3."));
  assert.match(result.reply, /^No documented item matches both at least 200g of protein and a \$3 budget\./);
  assert.doesNotMatch(result.reply, /safely relax/i);
});
test("phase4.1 remove cheese never selects no extra cheese", async () => {
  const agent = new NoriAgentService();
  const selected = await agent.process(request("Tell me about the cangujet Classic Beef Burger."));
  const result = await agent.process(request("Can I remove the cheese?", selected.conversationState));
  assert.doesNotMatch(result.reply, /no extra cheese/i);
  assert.match(result.reply, /Removing cheddar cheese is documented/i);
});
test("phase4.1 unsupported base-cheese removal states the documented limitation", async () => {
  const agent = new NoriAgentService();
  const selected = await agent.process(request("Tell me about the Spicy Nori Chicken Burger."));
  const result = await agent.process(request("Can I remove the cheese?", selected.conversationState));
  assert.match(result.reply, /Removing the base cheese is not listed as a documented customization/i);
});
test("phase4.1 unchanged nutrition transitions are omitted", async () => {
  const agent = new NoriAgentService();
  const selected = await agent.process(request("Tell me about the cangujet Classic Beef Burger."));
  const result = await agent.process(request("No extra cheese.", selected.conversationState));
  assert.doesNotMatch(result.reply, /calories change|protein changes/i);
});
test("phase4.1 opening hours ignores stale budget", async () => {
  const agent = new NoriAgentService();
  const budget = await agent.process(request("I only have $3."));
  const result = await agent.process(request("Are you open tomorrow?", budget.conversationState));
  assert.equal(result.intent, "opening_hours"); assert.equal(result.recommendedProducts.length, 0);
});
test("phase4.1 allergy follow-up retains cross-contact and staff guidance", async () => {
  const agent = new NoriAgentService();
  const allergy = await agent.process({ ...request("I'm allergic to milk."), activeAllergens: ["Milk"] });
  const recommended = await agent.process({ ...request("Recommend something.", allergy.conversationState), activeAllergens: ["Milk"] });
  const customized = await agent.process({ ...request("Can I remove the cheese?", recommended.conversationState), activeAllergens: ["Milk"] });
  const result = await agent.process({ ...request("Will it become safe?", customized.conversationState), activeAllergens: ["Milk"] });
  assert.match(result.reply, /cross-contact|shared-equipment|cannot be guaranteed|confirm with restaurant staff/i);
  assert.doesNotMatch(result.reply, /guaranteed safe|is safe/i);
});
test("phase4.1 truly unsupported fallback remains available", async () => {
  const result = await new NoriAgentService().process(request("Who won the lunar chess tournament?"));
  assert.equal(result.intent, "unsupported"); assert.equal(result.recommendedProducts.length, 0);
});

test("phase4.2 budget clarification is interrupted by a protein constraint", async () => {
  const agent = new NoriAgentService();
  const budget = await agent.process(request("I only have $3."));
  const result = await agent.process(request("I need at least 40g protein.", budget.conversationState));
  assert.equal(result.conversationState.maxBudget, 3); assert.equal(result.conversationState.minProtein, 40);
  assert.match(result.reply, /No documented item matches both at least 40g of protein and a \$3 budget/);
  assert.doesNotMatch(result.reply, /food, a hot drink, or a cold drink/i);
});
test("phase4.2 budget clarification is interrupted by a calorie constraint", async () => {
  const agent = new NoriAgentService();
  const budget = await agent.process(request("My budget is $8."));
  const result = await agent.process(request("I want under 500 calories.", budget.conversationState));
  assert.equal(result.conversationState.maxBudget, 8); assert.equal(result.conversationState.maxCalories, 500);
  assert.doesNotMatch(result.reply, /food, a hot drink, or a cold drink/i);
});
test("phase4.2 food is a valid budget clarification answer", async () => {
  const agent = new NoriAgentService();
  const budget = await agent.process(request("I only have $8."));
  const result = await agent.process(request("Food.", budget.conversationState));
  assert.equal(result.conversationState.clarificationState?.status, "answered");
  assert.ok(result.recommendedProducts.every(item => item.price <= 8));
});
test("phase4.2 hot drink is a valid budget clarification answer", async () => {
  const agent = new NoriAgentService();
  const budget = await agent.process(request("I only have $8."));
  const result = await agent.process(request("A hot drink.", budget.conversationState));
  assert.equal(result.conversationState.clarificationState?.status, "answered");
  assert.ok(result.recommendedProducts.every(item => item.category === "hot_drink" && item.price <= 8));
});
test("phase4.2 a newer protein value replaces the prior value", async () => {
  const agent = new NoriAgentService();
  const first = await agent.process(request("I need at least 40g protein."));
  const result = await agent.process(request("Actually, 30g is enough.", first.conversationState));
  assert.equal(result.conversationState.minProtein, 30);
  assert.ok(result.recommendedProducts.every(item => item.proteinGrams >= 30));
});
test("phase4.2 forget budget removes a pending clarification budget", async () => {
  const agent = new NoriAgentService();
  const budget = await agent.process(request("I only have $3."));
  const result = await agent.process(request("Forget my budget.", budget.conversationState));
  assert.equal(result.conversationState.maxBudget, null);
  assert.equal(result.conversationState.clarificationState?.status, "superseded");
});
test("phase4.2 cart command supersedes recommendation clarification", async () => {
  const agent = new NoriAgentService();
  const budget = await agent.process(request("I only have $3."));
  const result = await agent.process(request("Show my cart.", budget.conversationState));
  assert.equal(result.intent, "show_cart"); assert.equal(result.conversationState.clarificationState?.status, "superseded");
});
test("phase4.2 customization supersedes recommendation clarification", async () => {
  const agent = new NoriAgentService();
  const budget = await agent.process(request("I only have $3."));
  const result = await agent.process(request("Can I remove the cheese?", budget.conversationState));
  assert.equal(result.intent, "customization_question"); assert.equal(result.conversationState.clarificationState?.status, "superseded");
});
test("phase4.2 superseded clarification preserves its structured metadata", async () => {
  const agent = new NoriAgentService();
  const budget = await agent.process(request("I only have $3."));
  const result = await agent.process(request("Nothing spicy.", budget.conversationState));
  const clarification = result.conversationState.clarificationState;
  assert.equal(clarification?.status, "superseded"); assert.equal(clarification?.clarificationType, "recommendation_kind");
  assert.ok(clarification?.clarificationId); assert.ok(clarification?.createdAt);
});

test("phase4.3 hot-drink clarification preserves minimum protein", async () => {
  const agent = new NoriAgentService();
  const protein = await agent.process(request("I need at least 40g protein."));
  const result = await agent.process(request("A hot drink.", protein.conversationState));
  assert.equal(result.conversationState.minProtein, 40); assert.equal(result.conversationState.requestedCategory, "hot_drink");
  assert.match(result.reply, /No documented hot drink provides at least 40g of protein/);
  assert.equal(result.recommendedProducts.length, 0);
});
test("phase4.3 burger clarification preserves maximum calories", async () => {
  const agent = new NoriAgentService();
  const calories = await agent.process(request("Under 500 calories."));
  const result = await agent.process(request("A burger.", calories.conversationState));
  assert.equal(result.conversationState.maxCalories, 500);
  assert.ok(result.recommendedProducts.every(item => item.category === "burger" && item.cal <= 500));
});
test("phase4.3 hot-drink clarification preserves budget for every alternative", async () => {
  const agent = new NoriAgentService();
  const budget = await agent.process(request("I only have $3."));
  const result = await agent.process(request("A hot drink.", budget.conversationState));
  assert.equal(result.conversationState.maxBudget, 3);
  assert.ok(result.recommendedProducts.every(item => item.category === "hot_drink" && item.price <= 3));
});
test("phase4.3 dietary clarification preserves prior calorie constraint", async () => {
  const agent = new NoriAgentService();
  const calories = await agent.process(request("Under 500 calories."));
  const result = await agent.process(request("Vegetarian.", calories.conversationState));
  assert.equal(result.conversationState.maxCalories, 500);
  assert.ok(result.recommendedProducts.every(item => item.cal <= 500 && item.dietaryTags.some(tag => tag === "vegetarian" || tag === "vegan")));
});
test("phase4.3 a single hot-drink request does not create a pairing", async () => {
  const agent = new NoriAgentService();
  const budget = await agent.process(request("I only have $3."));
  const result = await agent.process(request("A hot drink.", budget.conversationState));
  assert.deepEqual(result.conversationState.currentRecommendation?.companionProductIds ?? [], []);
  assert.doesNotMatch(result.reply, /bringing the pair|add .* for \$/i);
});
test("phase4.3 explicit meal-and-drink request creates only a budget-valid pairing", async () => {
  const result = await new NoriAgentService().process(request("Recommend a meal with a drink under $15."));
  const recommendation = result.conversationState.currentRecommendation;
  assert.equal(recommendation?.companionProductIds.length, 1);
  assert.ok((recommendation?.totalPrice ?? Infinity) <= 15);
});
test("phase4.3 after-tax pairing respects the after-tax budget", async () => {
  const result = await new NoriAgentService().process(request("Recommend a meal and drink under $15 after tax."));
  const recommendation = result.conversationState.currentRecommendation;
  assert.equal(recommendation?.companionProductIds.length, 1);
  assert.ok((recommendation?.totalPrice ?? Infinity) * (1 + restaurantAIConfig.defaultTaxRate) <= 15);
});
test("phase4.3 forget budget removes only budget fields", async () => {
  const agent = new NoriAgentService();
  const constrained = await agent.process(request("Recommend at least 30g protein under $10 after tax."));
  const result = await agent.process(request("Forget my budget.", constrained.conversationState));
  assert.equal(result.conversationState.maxBudget, null); assert.equal(result.conversationState.afterTaxBudget, false);
  assert.equal(result.conversationState.minProtein, 30);
});
test("phase4.3 forget budget returns a budget-specific response", async () => {
  const agent = new NoriAgentService();
  const budget = await agent.process(request("I only have $3."));
  const result = await agent.process(request("Forget my budget.", budget.conversationState));
  assert.equal(result.reply, "Okay. I removed your budget limit.");
});
test("phase4.3 sentences after periods begin with a capital letter", async () => {
  const result = await new NoriAgentService().process(request("Recommend something."));
  assert.doesNotMatch(result.reply, /\.\s+[a-z]/);
});
