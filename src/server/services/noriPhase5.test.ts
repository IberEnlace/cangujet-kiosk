import test from "node:test";
import assert from "node:assert/strict";
import { executeNoriCartActions } from "../../app/services/noriCartActions";
import type { NoriCartItem, NoriChatRequest, NoriConversationState } from "../types/noriChat";
import { NoriAgentService } from "./noriAgentService";

function request(message: string, conversationState?: NoriConversationState, cart: NoriCartItem[] = []): NoriChatRequest {
  return { message, cart, activeAllergens: [], language: "en", conversationState };
}

async function modifiedPendingAdd(agent = new NoriAgentService()) {
  const recommended = await agent.process(request("Recommend a burger."));
  const pending = await agent.process(request("Add the first one.", recommended.conversationState));
  const modified = await agent.process(request("No sauce.", pending.conversationState));
  return { agent, recommended, pending, modified };
}

test("phase5 yes executes a pending add exactly once", async () => {
  const { agent, modified } = await modifiedPendingAdd();
  const result = await agent.process(request("Yes.", modified.conversationState));
  assert.equal(result.actions.filter(item => item.type === "add_to_cart").length, 1);
  assert.match(result.reply, /^Added 1 /); assert.doesNotMatch(result.reply, /please confirm/i);
});
test("phase5 customization updates the pending payload before execution", async () => {
  const { modified } = await modifiedPendingAdd();
  const pending = modified.conversationState.pendingAction;
  assert.equal(pending?.type, "confirm_cart_change"); assert.equal(pending?.status, "modified_awaiting_confirmation");
  if (pending?.type === "confirm_cart_change") {
    assert.ok(pending.customizations.some(item => item.optionName === "No sauce"));
    assert.equal(pending.unitPrice, 8.9); assert.ok(pending.adjustedNutrition); assert.ok(pending.adjustedAllergens);
  }
});
test("phase5 yes executes the modified customization payload", async () => {
  const { agent, modified } = await modifiedPendingAdd();
  const result = await agent.process(request("Yes.", modified.conversationState));
  const action = result.actions.find(item => item.type === "add_to_cart");
  assert.ok(action && action.type === "add_to_cart");
  assert.ok(action.customizations.some(item => item.optionName === "No sauce")); assert.equal(action.unitPrice, 8.9);
});
test("phase5 completed action leaves active pending state", async () => {
  const { agent, modified } = await modifiedPendingAdd();
  const result = await agent.process(request("Confirm.", modified.conversationState));
  assert.equal(result.conversationState.pendingAction, null);
  assert.equal(last(result.conversationState.pendingActionHistory)?.status, "completed");
});
test("phase5 executable action reuses the unique pending action id", async () => {
  const { agent, modified } = await modifiedPendingAdd();
  const pendingId = modified.conversationState.pendingAction?.id;
  const result = await agent.process(request("Go ahead.", modified.conversationState));
  const action = result.actions.find(item => item.type === "add_to_cart");
  assert.ok(action && action.type === "add_to_cart"); assert.equal(action.actionId, pendingId); assert.ok(action.actionId);
});
test("phase5 separate pending additions receive unique action ids", async () => {
  const first = await modifiedPendingAdd(); const second = await modifiedPendingAdd();
  assert.notEqual(first.modified.conversationState.pendingAction?.id, second.modified.conversationState.pendingAction?.id);
});
test("phase5 duplicate confirmation returns no duplicate cart action", async () => {
  const { agent, modified } = await modifiedPendingAdd();
  const first = await agent.process(request("Yes.", modified.conversationState));
  const second = await agent.process(request("Yes.", first.conversationState));
  assert.equal(second.actions.filter(item => item.type === "add_to_cart").length, 0);
  assert.match(second.reply, /already been added/i);
});
test("phase5 cancellation prevents pending add execution", async () => {
  const { agent, modified } = await modifiedPendingAdd();
  const cancelled = await agent.process(request("Never mind.", modified.conversationState));
  const confirmation = await agent.process(request("Yes.", cancelled.conversationState));
  assert.equal(last(cancelled.conversationState.pendingActionHistory)?.status, "cancelled");
  assert.equal(confirmation.actions.filter(item => item.type === "add_to_cart").length, 0);
});
test("phase5 add action has the frontend cart contract", async () => {
  const { agent, modified } = await modifiedPendingAdd();
  const result = await agent.process(request("Add that.", modified.conversationState));
  const action = result.actions.find(item => item.type === "add_to_cart");
  assert.ok(action && action.type === "add_to_cart");
  assert.equal(typeof action.actionId, "string"); assert.equal(typeof action.productId, "string");
  assert.equal(action.quantity, 1); assert.ok(Array.isArray(action.customizations)); assert.equal(typeof action.unitPrice, "number");
});
test("phase5 frontend executor retains no sauce and adjusted price", async () => {
  const { agent, modified } = await modifiedPendingAdd();
  const result = await agent.process(request("Okay.", modified.conversationState));
  let added: { price: number; customizations?: Record<string, string> } | undefined;
  executeNoriCartActions(result.actions, { addItem: item => { added = item; } });
  assert.equal(added?.price, 8.9); assert.equal(Object.values(added?.customizations ?? {})[0], "No sauce");
});
test("phase5 frontend executor deduplicates repeated action ids", async () => {
  const { agent, modified } = await modifiedPendingAdd();
  const result = await agent.process(request("Proceed.", modified.conversationState));
  let additions = 0; const adapter = { addItem: () => { additions += 1; } };
  executeNoriCartActions(result.actions, adapter); executeNoriCartActions(result.actions, adapter);
  assert.equal(additions, 1);
});
test("phase5 next request summarizes the frontend-synchronized cart", async () => {
  const { agent, modified } = await modifiedPendingAdd();
  const result = await agent.process(request("Yes.", modified.conversationState));
  const cart: NoriCartItem[] = [];
  executeNoriCartActions(result.actions, {
    addItem: item => cart.push({
      productId: item.productId ?? item.id.split("::")[0],
      quantity: 1,
      customizations: item.customizations,
    }),
  });
  const summary = await agent.process(request("Show my cart.", result.conversationState, cart));
  assert.doesNotMatch(summary.reply, /cart is empty/i); assert.match(summary.reply, /Morrow Classic Beef Burger|No sauce/i);
});
test("phase5 confirmation is handled before generic recommendation routing", async () => {
  const { agent, modified } = await modifiedPendingAdd();
  const result = await agent.process(request("Yes.", modified.conversationState));
  assert.equal(result.intent, "add_to_cart"); assert.equal(result.recommendedProducts.length, 0);
});
test("phase5 initial and modified pending states follow the strict lifecycle", async () => {
  const { pending, modified } = await modifiedPendingAdd();
  assert.equal(pending.conversationState.pendingAction?.status, "awaiting_confirmation");
  assert.equal(modified.conversationState.pendingAction?.status, "modified_awaiting_confirmation");
});
test("phase5 action history retains the completed customized payload", async () => {
  const { agent, modified } = await modifiedPendingAdd();
  const result = await agent.process(request("Yes.", modified.conversationState));
  const historical = last(result.conversationState.pendingActionHistory);
  assert.equal(historical?.status, "completed");
  if (historical?.type === "confirm_cart_change") assert.ok(historical.customizations.some(item => item.optionName === "No sauce"));
});

function last<T>(values: T[] | undefined): T | undefined { return values?.[values.length - 1]; }
