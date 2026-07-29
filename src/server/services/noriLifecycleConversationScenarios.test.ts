import assert from "node:assert/strict";
import test from "node:test";
import type {
  NoriCartItem,
  NoriChatRequest,
  NoriChatResponse,
  NoriConversationState,
  NoriLanguage,
} from "../types/noriChat";
import type { NoriOrderLifecycleContext } from "../../shared/noriOrderLifecycle";
import { NoriAgentService } from "./noriAgentService";

type Scenario = {
  state?: NoriConversationState;
  cart: NoriCartItem[];
  language: NoriLanguage;
};

async function turn(
  agent: NoriAgentService,
  scenario: Scenario,
  message: string,
  lifecycle?: NoriOrderLifecycleContext,
  lifecycleEvent = false,
) {
  const request: NoriChatRequest = {
    message,
    cart: scenario.cart,
    activeAllergens: [],
    language: scenario.language,
    conversationState: scenario.state,
    orderLifecycle: lifecycle,
    lifecycleEvent,
  };
  const result = await agent.process(request);
  scenario.state = result.conversationState;
  return result;
}

function applyFirstAdd(scenario: Scenario, result: NoriChatResponse) {
  const action = result.actions.find(value => value.type === "add_to_cart");
  if (!action || action.type !== "add_to_cart") return false;
  scenario.cart = [{
    productId: action.productId,
    quantity: action.quantity,
    unitPrice: action.unitPrice,
    customizationObjects: action.customizations,
    actionId: action.actionId,
  }];
  return true;
}

const time = (second: number) => `2026-07-29T13:00:${String(second).padStart(2, "0")}.000Z`;

test("long Turkish recommendation-to-card-completion conversation preserves context", async () => {
  const agent = new NoriAgentService();
  const scenario: Scenario = { cart: [], language: "tr" };
  await turn(agent, scenario, "Merhaba.");
  const broad = await turn(agent, scenario, "Ne önerirsin?");
  assert.ok(broad.recommendedProducts.length > 0);
  const proteinBudget = await turn(agent, scenario, "Proteinli ama ucuz olsun.");
  assert.ok(proteinBudget.recommendedProducts.length >= 2);
  assert.ok(scenario.state?.rankingPriorities?.includes("protein"));
  assert.ok(scenario.state?.rankingPriorities?.includes("price"));
  await turn(agent, scenario, "Biraz daha hafif.");
  const compared = await turn(agent, scenario, "İlk ikisini karşılaştır.");
  assert.match(compared.reply, /protein|kalori|fiyat/i);
  const simpler = await turn(agent, scenario, "Anlamadım, daha basit anlat.");
  assert.match(simpler.reply, /Daha basit/);
  const pending = await turn(agent, scenario, "İkincisini ekle.");
  assert.equal(pending.conversationState.pendingAction?.type, "confirm_cart_change");
  const safety = await turn(agent, scenario, "Bir dakika, süt içeriyor mu?");
  assert.equal(safety.intent, "allergen_check");
  assert.equal(safety.actions.length, 0);
  assert.equal(safety.conversationState.pendingAction?.type, "confirm_cart_change");
  const added = await turn(agent, scenario, "Tamam, ekle.");
  assert.equal(applyFirstAdd(scenario, added), true);
  await turn(agent, scenario, "Teşekkürler.");
  await turn(agent, scenario, "Ödemeye geçelim.");

  const pendingLifecycle = {
    paymentStatus: "pending", paymentMethod: "card", orderId: "tr-card-1",
    orderNumber: "128", orderStatus: "awaiting_payment", updatedAt: time(1),
  } as const;
  await turn(agent, scenario, "", pendingLifecycle, true);
  const processingLifecycle = {
    ...pendingLifecycle, paymentStatus: "processing", updatedAt: time(2),
  } as const;
  const processing = await turn(agent, scenario, "", processingLifecycle, true);
  assert.equal(processing.conversationState.conversationStage, "payment_processing");
  const slow = await turn(agent, scenario, "Daha yavaş konuş.", processingLifecycle);
  assert.equal(slow.speechDirectives?.rate, "slow");

  const completedLifecycle = {
    ...processingLifecycle,
    paymentStatus: "completed",
    orderStatus: "paid",
    completedAt: time(3),
    updatedAt: time(3),
  } as const;
  const completed = await turn(agent, scenario, "", completedLifecycle, true);
  assert.equal(completed.conversationState.conversationStage, "completed");
  assert.match(completed.reply, /128/);
  assert.equal(completed.speechDirectives?.rate, "slow");
  const finalThanks = await turn(agent, scenario, "Teşekkürler.", completedLifecycle);
  assert.equal(finalThanks.reply, "Rica ederim! Afiyet olsun.");
  assert.equal(finalThanks.recommendedProducts.length, 0);
  assert.equal(finalThanks.actions.length, 0);
});

test("long English failed-payment retry preserves the cart and completes once", async () => {
  const agent = new NoriAgentService();
  const scenario: Scenario = { cart: [], language: "en" };
  await turn(agent, scenario, "Hi, what do you recommend?");
  const affordable = await turn(agent, scenario, "Something filling but affordable.");
  assert.ok(affordable.recommendedProducts.length > 0);
  const pendingAdd = await turn(agent, scenario, "Add the first one.");
  assert.equal(pendingAdd.conversationState.pendingAction?.type, "confirm_cart_change");
  const added = await turn(agent, scenario, "Yes.");
  assert.equal(applyFirstAdd(scenario, added), true);
  const cartBeforeFailure = structuredClone(scenario.cart);
  await turn(agent, scenario, "Let us check out.");

  const processing = {
    paymentStatus: "processing", paymentMethod: "card", orderId: "retry-1",
    orderStatus: "awaiting_payment", updatedAt: time(1),
  } as const;
  await turn(agent, scenario, "", processing, true);
  const failed = {
    ...processing, paymentStatus: "failed", paymentErrorMessage: "The card was declined.",
    updatedAt: time(2),
  } as const;
  const failedResult = await turn(agent, scenario, "", failed, true);
  assert.match(failedResult.reply, /try again/i);
  assert.deepEqual(scenario.cart, cartBeforeFailure);
  const explanation = await turn(agent, scenario, "What happened?", failed);
  assert.match(explanation.reply, /could not be completed/i);
  await turn(agent, scenario, "Try card payment again.", failed);
  const retryProcessing = { ...processing, updatedAt: time(3) } as const;
  await turn(agent, scenario, "", retryProcessing, true);
  const completed = {
    ...retryProcessing, paymentStatus: "completed", orderStatus: "paid",
    orderNumber: "A204", completedAt: time(4), updatedAt: time(4),
  } as const;
  const success = await turn(agent, scenario, "", completed, true);
  assert.match(success.reply, /A204/);
  const duplicate = await turn(agent, scenario, "", completed, true);
  assert.equal(duplicate.reply, "");
  const closing = await turn(agent, scenario, "That is all, thanks.", completed);
  assert.match(closing.reply, /Enjoy your meal/);
  assert.equal(closing.recommendedProducts.length, 0);
});

test("pay-at-cashier scenario distinguishes order creation from payment completion", async () => {
  const agent = new NoriAgentService();
  const scenario: Scenario = { cart: [], language: "tr" };
  const recommendation = await turn(agent, scenario, "Merhaba, hafif bir şey öner.");
  assert.ok(recommendation.recommendedProducts.length > 0);
  await turn(agent, scenario, "İlkini ekle.");
  const added = await turn(agent, scenario, "Evet.");
  assert.equal(applyFirstAdd(scenario, added), true);
  await turn(agent, scenario, "Kasada ödeyeceğim.");
  const cashier = {
    paymentStatus: "pay_at_cashier_pending", paymentMethod: "pay_at_cashier",
    orderId: "cashier-205", orderNumber: "205", orderStatus: "accepted", updatedAt: time(1),
  } as const;
  const created = await turn(agent, scenario, "", cashier, true);
  assert.match(created.reply, /kasada tamamlayabilirsiniz/);
  assert.doesNotMatch(created.reply, /ödemeniz tamamlandı/i);
  const asked = await turn(agent, scenario, "Siparişim tamam mı?", cashier);
  assert.match(asked.reply, /kasada tamamlayabilirsiniz/);
  assert.doesNotMatch(asked.reply, /ödemeniz tamamlandı/i);
});

test("voice repair scenario keeps slow rate through interruption and structured repetition", async () => {
  const agent = new NoriAgentService();
  const scenario: Scenario = { cart: [], language: "en" };
  const slow = await turn(agent, scenario, "Speak more slowly.");
  assert.equal(slow.speechDirectives?.rate, "slow");
  const recommendation = await turn(agent, scenario, "What do you recommend?");
  assert.equal(recommendation.speechDirectives?.rate, "slow");
  assert.ok(recommendation.recommendedProducts.length > 0);
  scenario.state = { ...scenario.state!, lastTtsInterrupted: true };
  const cheaper = await turn(agent, scenario, "Actually, something cheaper.");
  assert.equal(cheaper.speechDirectives?.rate, "slow");
  assert.ok(cheaper.conversationState.rankingPriorities?.includes("price"));
  assert.equal(cheaper.conversationState.lastTtsInterrupted, true);
  const repeat = await turn(agent, scenario, "Say that again more slowly.");
  assert.equal(repeat.speechDirectives?.rate, "slow");
  assert.match(repeat.reply, /Briefly/);
  assert.doesNotMatch(repeat.reply, /Hello|Welcome/);
});
