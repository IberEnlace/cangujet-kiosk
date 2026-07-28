import assert from "node:assert/strict";
import test from "node:test";
import { noriMenuProducts } from "../../app/services/noriMenuEngine";
import type {
  NoriChatRequest,
  NoriConversationState,
  NoriLanguage,
  NoriSelectedCustomization,
  NoriWarning,
} from "../types/noriChat";
import { NoriAgentService } from "./noriAgentService";
import { calculateCustomizedProduct } from "./noriCustomizationService";
import { interpretNoriRequest } from "./noriRequestInterpreter";
import {
  buildAllergyResponse,
  buildCartConfirmationResponse,
  buildCartExecutionResponse,
  buildCheckoutResponse,
  buildClarificationResponse,
  buildCustomizationResponse,
  buildRecommendationResponse,
} from "./noriResponseService";

const bowl = product("bowl-chicken-protein");
const veganBurger = product("burger-veggie");
const kidsMeal = product("kids-tenders");
const miniBurger = product("kids-mini-burger");
const spicyBurger = product("burger-chicken-spicy");
const noDressing = selection(
  bowl,
  "dressing-choice",
  "no-dressing",
);
const customizedBowl = calculateCustomizedProduct(bowl, [noDressing]);

test("builds a budget-specific response", () => {
  const reply = recommendation("Show meals under $12", [veganBurger]);
  assert.match(reply, /within your \$12\.00 budget/i);
  assert.match(reply, /Garden Chickpea Burger/);
  assert.match(reply, /\$7\.90/);
});

test("builds a high-protein-specific response", () => {
  const reply = recommendation("Show meals with at least 35g protein", [bowl]);
  assert.match(reply, /high-protein/i);
  assert.match(reply, /46g protein/i);
});

test("builds a low-calorie-specific response", () => {
  const reply = recommendation("Show meals under 500 calories", [miniBurger]);
  assert.match(reply, /calorie limit/i);
  assert.match(reply, /390 calories/i);
});

test("builds a vegan-specific response", () => {
  const reply = recommendation("Show vegan meals", [veganBurger]);
  assert.match(reply, /plant-based|vegan/i);
  assert.match(reply, /documented vegan/i);
});

test("builds a kids-specific response", () => {
  const reply = recommendation("Show kids meals", [kidsMeal]);
  assert.match(reply, /kids meal/i);
  assert.match(reply, /Tiny Tenders Combo/);
});

test("builds a spicy-specific response", () => {
  const reply = recommendation("Recommend spicy food", [spicyBurger]);
  assert.match(reply, /heat|spicy/i);
  assert.match(reply, /Spicy Nori Chicken Burger/);
});

test("describes multiple recommendations compactly", () => {
  const reply = recommendation("Show meals under $12", [bowl, veganBurger, miniBurger]);
  assert.match(reply, /Other good matches/i);
  assert.match(reply, /Garden Chickpea Burger/);
  assert.match(reply, /Mini Beef Burger Meal/);
});

test("limits recommendation presentation to three products", () => {
  const fourth = product("burger-beef-classic");
  const reply = recommendation("Show meals under $20", [bowl, veganBurger, miniBurger, fourth]);
  assert.doesNotMatch(reply, new RegExp(escape(fourth.name)));
});

test("does not use the generic found-options response", () => {
  const reply = recommendation("Show vegan meals", [veganBurger]);
  assert.doesNotMatch(reply, /I found \d+ available menu options/i);
});

test("uses only the supplied official product facts", () => {
  const reply = recommendation("Show vegan meals", [veganBurger]);
  assert.match(reply, new RegExp(escape(veganBurger.name)));
  assert.match(reply, new RegExp(`\\$${veganBurger.price.toFixed(2)}`));
  assert.doesNotMatch(reply, /Imaginary|12\.34|invented/i);
});

test("returns an English response for English language", () => {
  const reply = recommendation("Show kids meals", [kidsMeal], "en");
  assert.match(reply, /documented kids meal/i);
});

test("returns a Turkish response for Turkish language", () => {
  const reply = recommendation("Vegan bir yemek öner", [veganBurger], "tr");
  assert.match(reply, /vegan bir seçenektir/i);
  assert.match(reply, /Garden Chickpea Burger/);
});

test("asks one filling-meal clarification question", () => {
  const interpretation = interpretNoriRequest("I want something filling.", state());
  assert.equal(interpretation.clarificationNeeded, true);
  const reply = buildClarificationResponse(interpretation.clarificationQuestion ?? "", "en");
  assert.equal(reply, "Would you prefer beef, chicken, or a plant-based option?");
  assert.equal((reply.match(/\?/g) ?? []).length, 1);
});

test("asks one drink-temperature clarification question", () => {
  const interpretation = interpretNoriRequest("I want a drink.", state());
  assert.equal(interpretation.clarificationNeeded, true);
  assert.equal(
    buildClarificationResponse(interpretation.clarificationQuestion ?? "", "en"),
    "Would you like a hot drink or a cold drink?",
  );
});

test("translates clarification to Turkish", () => {
  const reply = buildClarificationResponse(
    "Would you like a hot drink or a cold drink?",
    "tr",
  );
  assert.equal(reply, "Sıcak bir içecek mi, soğuk bir içecek mi tercih edersiniz?");
});

test("distinguishes a direct allergen", () => {
  const reply = buildAllergyResponse(bowl, allergenCheck({
    contains: ["Sesame"],
  }), "en");
  assert.match(reply, /directly contains Sesame/i);
  assert.match(reply, /restaurant staff/i);
});

test("distinguishes a may-contain allergen", () => {
  const reply = buildAllergyResponse(bowl, allergenCheck({
    mayContain: ["Gluten"],
  }), "en");
  assert.match(reply, /may contain Gluten/i);
  assert.doesNotMatch(reply, /directly contains/i);
});

test("distinguishes a cross-contact allergen", () => {
  const reply = buildAllergyResponse(bowl, allergenCheck({
    crossContact: ["Milk"],
  }), "en");
  assert.match(reply, /shared-equipment cross-contact with Milk/i);
});

test("never guarantees allergy safety when no risk is documented", () => {
  const reply = buildAllergyResponse(bowl, allergenCheck({}), "en");
  assert.match(reply, /complete safety cannot be guaranteed/i);
});

test("returns a Turkish allergy warning", () => {
  const reply = buildAllergyResponse(bowl, allergenCheck({
    crossContact: ["Milk"],
  }), "tr");
  assert.match(reply, /çapraz temas/i);
  assert.match(reply, /restoran personeli/i);
});

test("states that a customization is documented", () => {
  const reply = customization("en");
  assert.match(reply, /No dressing is documented/i);
});

test("states an unchanged customization price", () => {
  const reply = customization("en");
  assert.match(reply, /price stays the same/i);
  assert.match(reply, /\$10\.80|price stays/i);
});

test("states exact customization calorie changes", () => {
  const reply = customization("en");
  assert.match(reply, /calories change from 590 to 470/i);
});

test("states exact customization protein changes", () => {
  const reply = customization("en");
  assert.match(
    reply,
    new RegExp(`protein changes from 46g to ${customizedBowl.adjustedNutrition.proteinGrams}g`, "i"),
  );
});

test("states allergens removed by customization", () => {
  const reply = customization("en");
  assert.match(reply, /Sesame, Mustard are removed/i);
});

test("preserves customization cross-contact warning", () => {
  const reply = customization("en");
  assert.match(reply, /Cross-contact risk still remains/i);
});

test("returns a Turkish customization response", () => {
  const reply = customization("tr");
  assert.match(reply, /belgelenmiş bir seçenektir/i);
  assert.match(reply, /Çapraz temas riski/i);
});

test("builds a cart confirmation with product and quantity", () => {
  const reply = buildCartConfirmationResponse({
    product: bowl,
    quantity: 1,
    customizations: [],
    adjustedUnitPrice: bowl.price,
    language: "en",
  });
  assert.equal(reply, "Please confirm: add 1 Power Chicken Quinoa Bowl for $10.80.");
});

test("includes customization in cart confirmation", () => {
  const reply = buildCartConfirmationResponse({
    product: bowl,
    quantity: 1,
    customizations: [noDressing],
    adjustedUnitPrice: customizedBowl.adjustedPrice,
    language: "en",
  });
  assert.match(reply, /with No dressing/);
});

test("uses the total for multiple-item confirmation", () => {
  const reply = buildCartConfirmationResponse({
    product: veganBurger,
    quantity: 2,
    customizations: [],
    adjustedUnitPrice: veganBurger.price,
    language: "en",
  });
  assert.match(reply, /\$15\.80/);
});

test("builds a singular cart success response", () => {
  assert.equal(
    buildCartExecutionResponse([bowl.name], true, "en"),
    "Power Chicken Quinoa Bowl was added to your cart.",
  );
});

test("builds a plural cart success response", () => {
  const reply = buildCartExecutionResponse([bowl.name, "Hot Americano"], true, "en");
  assert.match(reply, /were added to your cart/i);
});

test("builds a cart failure response", () => {
  assert.equal(
    buildCartExecutionResponse([bowl.name], false, "en"),
    "I could not add the item to your cart. Please try again.",
  );
});

test("builds a Turkish cart success response", () => {
  const reply = buildCartExecutionResponse([bowl.name], true, "tr");
  assert.match(reply, /sepetinize eklendi/i);
});

test("checkout lists item name, quantity, and line total", () => {
  const reply = checkout("en", false);
  assert.match(reply, /2x Power Chicken Quinoa Bowl/);
  assert.match(reply, /\$21\.60/);
});

test("checkout lists selected customizations", () => {
  const reply = checkout("en", false, ["No dressing"]);
  assert.match(reply, /\(No dressing\)/);
});

test("checkout lists subtotal, tax, and total", () => {
  const reply = checkout("en", true);
  assert.match(reply, /Subtotal \$21\.60/);
  assert.match(reply, /estimated tax \$2\.16/);
  assert.match(reply, /total \$23\.76/);
});

test("checkout includes a contextual allergen warning", () => {
  const reply = checkout("en", true, [], [warning()]);
  assert.match(reply, /Documented allergen warnings apply/i);
});

test("checkout does not request card details in chat", () => {
  const reply = checkout("en", true);
  assert.doesNotMatch(reply, /card number|cvv|expiry/i);
  assert.match(reply, /secure payment screen/i);
});

test("checkout supports Turkish", () => {
  const reply = checkout("tr", true);
  assert.match(reply, /Ara toplam/i);
  assert.match(reply, /Güvenli ödeme ekranı/i);
});

test("tracks recently recommended product IDs", async () => {
  const result = await new NoriAgentService().process(request("Show meals under $20"));
  assert.deepEqual(
    result.conversationState.recentlyRecommendedProductIds,
    result.recommendedProducts.map(item => item.id),
  );
});

test("avoids the same leading recommendation when equal valid alternatives exist", async () => {
  const agent = new NoriAgentService();
  const first = await agent.process(request("Show meals under $20"));
  const second = await agent.process(request(
    "Show meals under $20",
    first.conversationState,
  ));
  assert.ok(first.recommendedProducts.length > 0);
  assert.ok(second.recommendedProducts.length > 0);
  assert.notEqual(
    first.recommendedProducts[0]?.id,
    second.recommendedProducts[0]?.id,
  );
});

test("agent never returns more than three recommendations", async () => {
  const result = await new NoriAgentService().process(request("Show meals under $20"));
  assert.ok(result.recommendedProducts.length <= 3);
});

function recommendation(
  message: string,
  products: typeof noriMenuProducts,
  language: NoriLanguage = "en",
) {
  return buildRecommendationResponse({
    products,
    interpretation: interpretNoriRequest(message, state()),
    language,
  });
}

function customization(language: NoriLanguage) {
  return buildCustomizationResponse(
    bowl,
    noDressing,
    customizedBowl,
    language,
  );
}

function checkout(
  language: NoriLanguage,
  confirmation: boolean,
  customizationNames: string[] = [],
  warnings: NoriWarning[] = [],
) {
  return buildCheckoutResponse({
    lines: [{
      product: bowl,
      quantity: 2,
      customizationNames,
      unitPrice: bowl.price,
      lineTotal: bowl.price * 2,
      warnings,
    }],
    subtotal: 21.6,
    tax: 2.16,
    total: 23.76,
    language,
    confirmation,
  });
}

function state(): NoriConversationState {
  return {
    preferredLanguage: "en",
    activeAllergens: [],
    maxBudget: null,
    minProtein: null,
    maxCalories: null,
    dietaryPreferences: [],
    persistentDietaryPreferences: [],
    requestedCategory: null,
    requestedDrink: false,
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
}

function request(
  message: string,
  conversationState?: NoriConversationState,
): NoriChatRequest {
  return {
    message,
    cart: [],
    activeAllergens: [],
    language: "en",
    conversationState,
  };
}

function product(id: string) {
  const found = noriMenuProducts.find(item => item.id === id);
  assert.ok(found, `Missing fixture product ${id}`);
  return found;
}

function selection(
  item: typeof bowl,
  groupId: string,
  optionId: string,
): NoriSelectedCustomization {
  const group = item.customizationGroups.find(candidate => candidate.id === groupId);
  const option = group?.options.find(candidate => candidate.id === optionId);
  assert.ok(group);
  assert.ok(option);
  return {
    productId: item.id,
    groupId: group.id,
    optionId: option.id,
    optionName: option.name,
    priceAdjustment: option.priceAdjustment,
    nutritionAdjustment: option.nutritionAdjustment,
    allergensAdded: option.allergensAdded,
    allergensRemoved: option.allergensRemoved,
  };
}

function allergenCheck(input: {
  contains?: string[];
  mayContain?: string[];
  crossContact?: string[];
}) {
  const contains = input.contains ?? [];
  const mayContain = input.mayContain ?? [];
  const crossContact = input.crossContact ?? [];
  return {
    product: bowl,
    contains,
    mayContain,
    crossContact,
    hasRisk: contains.length + mayContain.length + crossContact.length > 0,
  };
}

function warning(): NoriWarning {
  return {
    type: "cross_contact",
    productId: bowl.id,
    productName: bowl.name,
    allergens: ["Milk"],
    message: bowl.allergenSafetyMessage,
  };
}

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
