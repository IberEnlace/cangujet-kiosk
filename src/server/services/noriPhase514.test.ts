import test from "node:test";
import assert from "node:assert/strict";
import { restaurantAIConfig } from "../../app/data/aiMenu";
import { NoriAgentService } from "./noriAgentService";
import type { NoriCartItem, NoriChatRequest, NoriConversationState } from "../types/noriChat";

const agent = new NoriAgentService();
const burger = (quantity = 1, unitPrice = 8.9): NoriCartItem => ({
  productId: "burger-beef-classic", name: "cangujet Classic Beef Burger", quantity, unitPrice,
  customizations: { "sauce-choice": "No sauce" },
});
const request = (message: string, cart: NoriCartItem[] = [], conversationState?: NoriConversationState): NoriChatRequest => ({
  message, cart, activeAllergens: [], language: "en", conversationState,
});

test("What is my cart total maps to cart_total", async () => {
  assert.equal((await agent.process(request("What is my cart total?", [burger()]))).intent, "cart_total");
});

test("What is the total maps to cart_total", async () => {
  assert.equal((await agent.process(request("What is the total?", [burger()]))).intent, "cart_total");
});

test("cart subtotal uses quantity multiplied by normalized unitPrice", async () => {
  const result = await agent.process(request("Cart total", [burger(2)]));
  assert.match(result.reply, /subtotal is \$17\.80/);
});

test("cart total uses the configured tax rate", async () => {
  const result = await agent.process(request("Total price", [burger()]));
  assert.equal(restaurantAIConfig.defaultTaxRate, 0.08);
  assert.match(result.reply, /estimated tax is \$0\.71/);
  assert.match(result.reply, /total is \$9\.61/);
});

test("cart total preserves the normalized customized product price", async () => {
  const result = await agent.process(request("How much is my cart?", [burger(1, 7.7)]));
  assert.match(result.reply, /subtotal is \$7\.70/);
});

test("empty cart total returns the empty-cart message", async () => {
  const result = await agent.process(request("How much do I owe?"));
  assert.equal(result.reply, "Your cart is empty.");
});

async function confirmedClear() {
  const proposed = await agent.process(request("Clear my cart.", [burger()]));
  return agent.process(request("Yes.", [burger()], proposed.conversationState));
}

test("confirmed clear returns the cart-cleared success response", async () => {
  assert.equal((await confirmedClear()).reply, "Your cart has been cleared.");
});

test("confirmed clear returns exactly one clear_cart action", async () => {
  const result = await confirmedClear();
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0]?.type, "clear_cart");
});

test("confirmed clear does not ask for confirmation again", async () => {
  assert.doesNotMatch((await confirmedClear()).reply, /confirm/i);
});

test("show-cart interruption does not execute a pending clear", async () => {
  const proposed = await agent.process(request("Clear my cart.", [burger()]));
  const interrupted = await agent.process(request("Show my cart.", [burger()], proposed.conversationState));
  assert.equal(interrupted.intent, "show_cart");
  assert.equal(interrupted.actions.some(action => action.type === "clear_cart"), false);
  assert.match(interrupted.reply, /cangujet Classic Beef Burger/);
});

test("confirmed clear action transitions to completed history", async () => {
  const result = await confirmedClear();
  assert.equal(result.conversationState.pendingAction, null);
  const history = result.conversationState.pendingActionHistory ?? [];
  const historical = history[history.length - 1];
  assert.equal(historical?.type, "confirm_clear_cart");
  assert.equal(historical?.status, "completed");
  assert.equal(result.actions[0] && "actionId" in result.actions[0] ? result.actions[0].actionId : null, historical?.id);
});
