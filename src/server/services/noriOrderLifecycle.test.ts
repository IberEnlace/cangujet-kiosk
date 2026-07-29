import assert from "node:assert/strict";
import test from "node:test";
import { isChatRequest } from "../controllers/noriChatController";
import type { NoriChatRequest, NoriConversationState, NoriLanguage } from "../types/noriChat";
import {
  applyNoriOrderLifecycleEvent,
  initialNoriOrderLifecycle,
  shouldClearActiveCart,
  type NoriOrderLifecycleContext,
} from "../../shared/noriOrderLifecycle";
import { NoriAgentService } from "./noriAgentService";

function request(
  message: string,
  lifecycle?: NoriOrderLifecycleContext,
  state?: NoriConversationState,
  language: NoriLanguage = "en",
  lifecycleEvent = false,
): NoriChatRequest {
  return {
    message,
    cart: [{ productId: "burger-beef-classic", quantity: 1 }],
    activeAllergens: [],
    language,
    conversationState: state,
    orderLifecycle: lifecycle,
    lifecycleEvent,
  };
}

const at = (second: number) => `2026-07-29T12:00:${String(second).padStart(2, "0")}.000Z`;

test("typed lifecycle permits legal retries and rejects regressions, duplicates, and stale orders", () => {
  let state = initialNoriOrderLifecycle(at(0));
  let result = applyNoriOrderLifecycleEvent(state, {
    paymentStatus: "pending", paymentMethod: "card", orderId: "order-1",
    source: "checkout", updatedAt: at(1),
  });
  assert.equal(result.applied, true);
  state = result.state;
  result = applyNoriOrderLifecycleEvent(state, {
    paymentStatus: "processing", orderId: "order-1", source: "card_terminal", updatedAt: at(2),
  });
  assert.equal(result.applied, true);
  state = result.state;
  const duplicate = applyNoriOrderLifecycleEvent(state, {
    paymentStatus: "processing", orderId: "order-1", source: "card_terminal", updatedAt: at(2),
  });
  assert.equal(duplicate.reason, "duplicate");
  const staleOrder = applyNoriOrderLifecycleEvent(state, {
    paymentStatus: "completed", orderId: "old-order", source: "card_terminal", updatedAt: at(3),
  });
  assert.equal(staleOrder.reason, "stale_order");
  const completed = applyNoriOrderLifecycleEvent(state, {
    paymentStatus: "completed", orderId: "order-1", orderNumber: "128",
    source: "card_terminal", updatedAt: at(4),
  });
  assert.equal(completed.state.orderStatus, "paid");
  const regression = applyNoriOrderLifecycleEvent(completed.state, {
    paymentStatus: "pending", orderId: "order-1", source: "checkout", updatedAt: at(5),
  });
  assert.equal(regression.reason, "invalid_transition");

  const failed = applyNoriOrderLifecycleEvent(initialNoriOrderLifecycle(at(0)), {
    paymentStatus: "failed", orderId: "retry-order", source: "card_terminal", updatedAt: at(1),
  }).state;
  const retry = applyNoriOrderLifecycleEvent(failed, {
    paymentStatus: "pending", orderId: "retry-order", source: "card_terminal", updatedAt: at(2),
  });
  assert.equal(retry.applied, true);
});

test("cart clearing policy preserves failed/cancelled carts and transfers terminal orders", () => {
  assert.equal(shouldClearActiveCart("failed"), false);
  assert.equal(shouldClearActiveCart("cancelled"), false);
  assert.equal(shouldClearActiveCart("processing"), false);
  assert.equal(shouldClearActiveCart("completed"), true);
  assert.equal(shouldClearActiveCart("pay_at_cashier_pending"), true);
});

test("pending and processing payment drive checkout stages with bilingual responses", async () => {
  const agent = new NoriAgentService();
  const pending = await agent.process(request("", {
    paymentStatus: "pending", paymentMethod: "card", orderId: "o-1", updatedAt: at(1),
  }, undefined, "tr", true));
  assert.equal(pending.conversationState.conversationStage, "checkout_ready");
  assert.match(pending.reply, /henüz tamamlanmadı/);

  const processing = await agent.process(request("", {
    paymentStatus: "processing", paymentMethod: "card", orderId: "o-1", updatedAt: at(2),
  }, pending.conversationState, "tr", true));
  assert.equal(processing.conversationState.conversationStage, "payment_processing");
  assert.match(processing.reply, /işleniyor/);
});

test("successful card and cash payments use documented order numbers only", async () => {
  const agent = new NoriAgentService();
  const card = await agent.process(request("", {
    paymentStatus: "completed", paymentMethod: "card", orderId: "card-1",
    orderNumber: "128", orderStatus: "paid", completedAt: at(3), updatedAt: at(3),
  }, undefined, "tr", true));
  assert.equal(card.conversationState.conversationStage, "completed");
  assert.equal(card.conversationState.closingStatus, "order_completed");
  assert.match(card.reply, /Sipariş numaranız 128/);

  const cash = await agent.process(request("", {
    paymentStatus: "completed", paymentMethod: "cash", orderId: "cash-1",
    orderNumber: "C42", completedAt: at(3), updatedAt: at(3),
  }, undefined, "en", true));
  assert.match(cash.reply, /cash payment is complete/i);
  assert.match(cash.reply, /C42/);

  const withoutNumber = await agent.process(request("", {
    paymentStatus: "completed", paymentMethod: "card", orderId: "card-2",
    completedAt: at(3), updatedAt: at(3),
  }, undefined, "en", true));
  assert.match(withoutNumber.reply, /order has been placed/i);
  assert.doesNotMatch(withoutNumber.reply, /order number/i);
});

test("order number arriving after completion is acknowledged once without replaying duplicate success", async () => {
  const agent = new NoriAgentService();
  const completed = await agent.process(request("", {
    paymentStatus: "completed", paymentMethod: "card", orderId: "late-number",
    completedAt: at(2), updatedAt: at(2),
  }, undefined, "en", true));
  const numbered = await agent.process(request("", {
    paymentStatus: "completed", paymentMethod: "card", orderId: "late-number",
    orderNumber: "A204", completedAt: at(2), updatedAt: at(3),
  }, completed.conversationState, "en", true));
  assert.match(numbered.reply, /A204/);
  const duplicate = await agent.process(request("", {
    paymentStatus: "completed", paymentMethod: "card", orderId: "late-number",
    orderNumber: "A204", completedAt: at(2), updatedAt: at(3),
  }, numbered.conversationState, "en", true));
  assert.equal(duplicate.reply, "");
  assert.equal(duplicate.speechDirectives?.shouldSpeak, false);
});

test("pay at cashier never claims completed payment", async () => {
  const result = await new NoriAgentService().process(request("", {
    paymentStatus: "pay_at_cashier_pending", paymentMethod: "pay_at_cashier",
    orderId: "cashier-1", orderNumber: "205", orderStatus: "accepted", updatedAt: at(2),
  }, undefined, "tr", true));
  assert.equal(result.conversationState.closingStatus, "pay_at_cashier_pending");
  assert.match(result.reply, /kasada tamamlayabilirsiniz/);
  assert.doesNotMatch(result.reply, /ödemeniz tamamlandı/i);
});

test("failed and cancelled payments retain checkout/cart stages and expose no technical payload", async () => {
  const agent = new NoriAgentService();
  const failed = await agent.process(request("", {
    paymentStatus: "failed", paymentMethod: "card", orderId: "fail-1",
    paymentErrorCode: "provider_500",
    paymentErrorMessage: "provider payload stack token=secret",
    updatedAt: at(2),
  }, undefined, "en", true));
  assert.equal(failed.conversationState.conversationStage, "checkout_ready");
  assert.match(failed.reply, /try again/i);
  assert.doesNotMatch(failed.reply, /provider|stack|token|500/i);

  const cancelled = await agent.process(request("", {
    paymentStatus: "cancelled", paymentMethod: "card", orderId: "cancel-1", updatedAt: at(2),
  }, undefined, "tr", true));
  assert.equal(cancelled.conversationState.conversationStage, "cart_review");
  assert.match(cancelled.reply, /iptal edildi/);
});

test("authoritative completion blocks recommendations and turns later thanks into a short closing", async () => {
  const agent = new NoriAgentService();
  const completed = await agent.process(request("", {
    paymentStatus: "completed", paymentMethod: "card", orderId: "done-1",
    orderNumber: "128", updatedAt: at(2),
  }, undefined, "tr", true));
  const thanks = await agent.process(request("Teşekkürler", {
    paymentStatus: "completed", paymentMethod: "card", orderId: "done-1",
    orderNumber: "128", updatedAt: at(2),
  }, completed.conversationState, "tr"));
  assert.equal(thanks.reply, "Rica ederim! Afiyet olsun.");
  assert.equal(thanks.recommendedProducts.length, 0);

  const add = await agent.process(request("Başka bir şey eklemek istiyorum.", {
    paymentStatus: "completed", paymentMethod: "card", orderId: "done-1",
    orderNumber: "128", updatedAt: at(2),
  }, thanks.conversationState, "tr"));
  assert.match(add.reply, /Tamamlanan siparişi değiştiremeyiz/);
  assert.equal(add.actions.length, 0);

  const recommendation = await agent.process(request("Ne önerirsin?", {
    paymentStatus: "completed", paymentMethod: "card", orderId: "done-1",
    orderNumber: "128", updatedAt: at(2),
  }, add.conversationState, "tr"));
  assert.equal(recommendation.recommendedProducts.length, 0);
  assert.match(recommendation.reply, /sipariş tamamlandı/i);
});

test("conversational done phrases never manufacture payment completion", async () => {
  const result = await new NoriAgentService().process(request(
    "Siparişim tamam",
    undefined,
    undefined,
    "tr",
  ));
  assert.notEqual(result.conversationState.conversationStage, "completed");
  assert.notEqual(result.conversationState.closingStatus, "order_completed");
  assert.equal(result.conversationState.orderLifecycle, undefined);
  assert.doesNotMatch(result.reply, /Ödemeniz tamamlandı/);
});

test("controller validates lifecycle enums/timestamps and older clients remain valid", () => {
  assert.equal(isChatRequest({
    message: "Hello", cart: [], activeAllergens: [], language: "en",
  }), true);
  assert.equal(isChatRequest({
    message: "", cart: [], activeAllergens: [], language: "en",
    orderLifecycle: { paymentStatus: "approved" },
  }), false);
  assert.equal(isChatRequest({
    message: "", cart: [], activeAllergens: [], language: "en",
    orderLifecycle: { paymentStatus: "completed", completedAt: "yesterday" },
  }), false);
  assert.equal(isChatRequest({
    message: "", cart: [], activeAllergens: [], language: "en",
    orderLifecycle: null,
  }), false);
});

test("new-order reset removes stale correlation and accepts a different order", async () => {
  const agent = new NoriAgentService();
  const failed = await agent.process(request("", {
    paymentStatus: "failed", paymentMethod: "card", orderId: "old-order", updatedAt: at(1),
  }, undefined, "en", true));
  const reset = await agent.process(request("Start over", {
    paymentStatus: "idle", orderStatus: "draft", updatedAt: at(2),
  }, failed.conversationState, "en"));
  assert.equal(reset.conversationState.orderLifecycle, undefined);
  assert.equal(reset.conversationState.lastAcknowledgedOrderId, null);

  const next = await agent.process(request("", {
    paymentStatus: "pending", paymentMethod: "card", orderId: "new-order", updatedAt: at(3),
  }, reset.conversationState, "en", true));
  assert.equal(next.conversationState.orderLifecycle?.orderId, "new-order");
  assert.match(next.reply, /not been completed yet/i);
});
