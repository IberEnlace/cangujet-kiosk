import assert from "node:assert/strict";
import test from "node:test";
import type { AIProvider } from "../types/aiProvider";
import type {
  NoriChatRequest,
  NoriConversationState,
  NoriLanguage,
} from "../types/noriChat";
import { detectNoriConversationActs } from "./noriConversationActService";
import { NoriAgentService } from "./noriAgentService";
import { isChatRequest } from "../controllers/noriChatController";

function request(
  message: string,
  language: NoriLanguage = "en",
  conversationState?: NoriConversationState,
  cart: NoriChatRequest["cart"] = [],
): NoriChatRequest {
  return { message, cart, activeAllergens: [], language, conversationState };
}

test("detects multiple bilingual conversation acts without replacing business meaning", () => {
  const turkish = detectNoriConversationActs("Merhaba, ne önerirsin?", "tr");
  assert.ok(turkish.acts.includes("greeting"));
  assert.ok(turkish.acts.includes("general_recommendation"));
  assert.equal(turkish.hasRestaurantMeaning, true);

  const english = detectNoriConversationActs("Thanks, add the first one.", "en");
  assert.ok(english.acts.includes("gratitude"));
  assert.equal(english.hasBusinessCommand, true);

  const repair = detectNoriConversationActs("Anlamadım, tekrar söyler misin?", "tr");
  assert.ok(repair.acts.includes("misunderstanding"));
  assert.ok(repair.acts.includes("request_repetition"));
});

test("classifies the required bilingual social and repair phrase families", () => {
  const examples: Array<[string, NoriLanguage, string]> = [
    ["Teşekkürler", "tr", "gratitude"],
    ["Sağ ol", "tr", "gratitude"],
    ["Çok yardımcı oldun", "tr", "gratitude"],
    ["Thanks", "en", "gratitude"],
    ["That helps", "en", "gratitude"],
    ["Anlamadım", "tr", "misunderstanding"],
    ["Tekrar söyler misin?", "tr", "request_repetition"],
    ["Daha basit anlat", "tr", "request_simplification"],
    ["Yanlış anladın", "tr", "correction"],
    ["I did not understand", "en", "misunderstanding"],
    ["Can you repeat that?", "en", "request_repetition"],
    ["Explain it more simply", "en", "request_simplification"],
    ["You misunderstood me", "en", "correction"],
    ["Hayır, başka bir şey", "tr", "rejection"],
    ["Bunu istemiyorum", "tr", "rejection"],
    ["Fikrimi değiştirdim", "tr", "change_mind"],
    ["Öncekileri unut", "tr", "change_mind"],
    ["No, something else", "en", "rejection"],
    ["I do not want that", "en", "rejection"],
    ["I changed my mind", "en", "change_mind"],
    ["Forget those options", "en", "change_mind"],
    ["Görüşürüz", "tr", "farewell"],
    ["Bu kadar", "tr", "farewell"],
    ["Başka bir şey istemiyorum", "tr", "farewell"],
    ["Siparişim tamam", "tr", "farewell"],
    ["Goodbye", "en", "farewell"],
    ["That is all", "en", "farewell"],
    ["Nothing else", "en", "farewell"],
    ["I am done", "en", "farewell"],
  ];
  for (const [message, language, expected] of examples) {
    assert.ok(
      detectNoriConversationActs(message, language).acts.includes(expected as never),
      `${message} should include ${expected}`,
    );
  }
});

test("handles Turkish and English greeting variants with deterministic stage-aware variation", async () => {
  for (const [message, language] of [
    ["Merhaba", "tr"],
    ["Selamlar", "tr"],
    ["Hello", "en"],
    ["Good morning", "en"],
  ] as const) {
    const result = await new NoriAgentService().process(request(message, language));
    assert.equal(result.intent, "conversation");
    assert.equal(result.conversationState.conversationStage, "welcomed");
    assert.match(result.reply, language === "tr" ? /Merhaba|Selam|Hoş geldiniz/ : /Hello|Hi|Welcome/);
  }

  const agent = new NoriAgentService();
  const first = await agent.process(request("Hello", "en"));
  const repeated = await agent.process(request("Hello again", "en", first.conversationState));
  assert.notEqual(repeated.reply, first.reply);
  const active = await agent.process(request("What do you recommend?", "en", repeated.conversationState));
  const activeGreeting = await agent.process(request("Hello", "en", active.conversationState));
  assert.match(activeGreeting.reply, /continue|pick up/i);
});

test("greeting and politeness never hide recommendation or cart intents", async () => {
  const agent = new NoriAgentService();
  const recommendations = await agent.process(request("Merhaba Nori, proteinli bir şey istiyorum", "tr"));
  assert.equal(recommendations.intent, "recommendation");
  assert.ok(recommendations.recommendedProducts.length > 0);
  assert.match(recommendations.reply, /^Merhaba!/);

  const add = await agent.process(request(
    "Sağ ol, ikincisini ekle",
    "tr",
    recommendations.conversationState,
  ));
  assert.equal(add.intent, "add_to_cart");
  assert.equal(add.conversationState.pendingAction?.type, "confirm_cart_change");
  assert.match(add.reply, /^Rica ederim!/);

  const englishRecommendations = await agent.process(request("Hi, what do you recommend?", "en"));
  const cheaper = await agent.process(request(
    "Thanks, add the cheaper one.",
    "en",
    englishRecommendations.conversationState,
  ));
  assert.equal(cheaper.intent, "add_to_cart");
  assert.equal(cheaper.conversationState.pendingAction?.type, "confirm_cart_change");
  assert.match(cheaper.reply, /^You’re welcome!/);
});

test("capabilities are concise, bilingual, and limited to supported restaurant functions", async () => {
  const agent = new NoriAgentService();
  const tr = await agent.process(request("Nori nedir, ne yapabilirsin?", "tr"));
  assert.equal(tr.intent, "conversation");
  assert.match(tr.reply, /önerebilir|karşılaştırabilir|alerjen|sepet|ödeme/);
  const en = await agent.process(request("Who are you and what can you do?", "en"));
  assert.match(en.reply, /recommend|compare|allergen|cart|checkout/i);
  assert.doesNotMatch(en.reply, /doctor|medical advice|delivery/i);
});

test("gratitude and acknowledgement use recommendation and cart context without restarting", async () => {
  const agent = new NoriAgentService();
  const recommended = await agent.process(request("What do you recommend?", "en"));
  const thanks = await agent.process(request("Thank you, that helps", "en", recommended.conversationState));
  assert.equal(thanks.intent, "conversation");
  assert.equal(thanks.conversationState.conversationStage, "recommending");
  assert.match(thanks.reply, /compare|add/i);
  assert.equal(thanks.recommendedProducts.length, 0);

  const withCart = await agent.process(request(
    "Teşekkürler",
    "tr",
    { ...recommended.conversationState, preferredLanguage: "tr", conversationStage: "cart_review" },
    [{ productId: recommended.recommendedProducts[0].id, quantity: 1 }],
  ));
  assert.match(withCart.reply, /Başka bir şey|sepetinize/);
});

test("broad recommendation and indecision turns return useful menu options", async () => {
  const cases: Array<[string, NoriLanguage]> = [
    ["Selam, ne önerirsin?", "tr"],
    ["Günaydın, bana yardımcı olur musun?", "tr"],
    ["Bilmiyorum, sen seç", "tr"],
    ["Karar veremiyorum", "tr"],
    ["Fark etmez", "tr"],
    ["Hi, what do you recommend?", "en"],
    ["Good morning, help me choose", "en"],
    ["I cannot decide", "en"],
    ["You choose", "en"],
    ["Surprise me", "en"],
  ];
  for (const [message, language] of cases) {
    const result = await new NoriAgentService().process(request(message, language));
    assert.ok(
      result.recommendedProducts.length > 0 || /lighter|hafif|affordable|uygun fiyatlı/i.test(result.reply),
      `${message}: ${result.reply}`,
    );
    assert.notEqual(result.intent, "unsupported");
  }
});

test("personal-choice questions disclose that Nori does not eat before recommending", async () => {
  const tr = await new NoriAgentService().process(request("Sen olsan ne yerdin?", "tr"));
  assert.ok(tr.recommendedProducts.length > 0);
  assert.match(tr.reply, /^Ben yemek yemiyorum/);
  const en = await new NoriAgentService().process(request("What would you choose?", "en"));
  assert.ok(en.recommendedProducts.length > 0);
  assert.match(en.reply, /^I don’t eat/);
});

test("repetition and simplification use safe structured response summaries", async () => {
  const agent = new NoriAgentService();
  const recommendation = await agent.process(request("Proteinli bir şey öner", "tr"));
  assert.ok(recommendation.conversationState.lastAssistantResponseSummary?.documentedValues.length);

  const repeat = await agent.process(request("Anlamadım, tekrar söyler misin?", "tr", recommendation.conversationState));
  assert.equal(repeat.intent, "conversation");
  assert.match(repeat.reply, /Kısaca tekrar/);
  assert.match(repeat.reply, /g protein/);
  assert.equal(repeat.conversationState.activeRepairContext?.type, "repeat");

  const simpler = await agent.process(request("Daha basit anlat", "tr", recommendation.conversationState));
  assert.match(simpler.reply, /Daha basit/);
  assert.equal(simpler.conversationState.activeRepairContext?.type, "simplify");
});

test("correction with a recovered business constraint reroutes without defensiveness", async () => {
  const agent = new NoriAgentService();
  const first = await agent.process(request("Recommend something high protein.", "en"));
  const corrected = await agent.process(request(
    "You misunderstood me, I want something light.",
    "en",
    first.conversationState,
  ));
  assert.ok(["recommendation", "healthy_recommendation"].includes(corrected.intent));
  assert.match(corrected.reply, /^You’re right; I misunderstood you\./);
  assert.ok(corrected.conversationState.rankingPriorities?.includes("light"));
});

test("clear noise bypasses provider interpretation and escalates to visible choices", async () => {
  let providerCalls = 0;
  const provider = {
    async interpret() {
      providerCalls += 1;
      throw new Error("provider must not be called for noise");
    },
  } as unknown as AIProvider;
  const agent = new NoriAgentService(provider);
  let state: NoriConversationState | undefined;
  for (const message of ["", "   ", "...", "x", "uh uh uh uh"]) {
    const result = await agent.process(request(message, "en", state));
    state = result.conversationState;
    assert.equal(result.intent, "conversation");
    assert.ok(result.conversationState.consecutiveNoiseCount);
  }
  assert.equal(providerCalls, 0);
  const finalNoise = await agent.process(request("...", "en", state));
  assert.match(finalNoise.reply, /recommend food|view cart/i);
});

test("controller accepts repairable empty transcripts and rejects invalid conversation state", async () => {
  const state = (await new NoriAgentService().process(request("Hello", "en"))).conversationState;
  assert.equal(isChatRequest({
    message: "   ",
    cart: [],
    activeAllergens: [],
    language: "en",
    conversationState: state,
  }), true);
  assert.equal(isChatRequest({
    message: "Hello",
    cart: [],
    activeAllergens: [],
    language: "en",
    conversationState: { ...state, conversationStage: "invalid_stage" },
  }), false);
  assert.equal(isChatRequest({
    message: "Hello",
    cart: [],
    activeAllergens: [],
    language: "en",
    conversationState: { ...state, consecutiveNoiseCount: -1 },
  }), false);
});

test("rejection and change of mind temporarily exclude the rejected recommendation", async () => {
  const agent = new NoriAgentService();
  const first = await agent.process(request("Recommend something.", "en"));
  const rejectedId = first.recommendedProducts[0].id;
  const alternative = await agent.process(request("No, something else.", "en", first.conversationState));
  assert.equal(alternative.intent, "recommendation");
  assert.ok(alternative.conversationState.temporaryRejectedProductIds?.includes(rejectedId));
  assert.ok(alternative.recommendedProducts.every(product => product.id !== rejectedId));
});

test("negative feedback becomes a recommendation refinement", async () => {
  const agent = new NoriAgentService();
  const first = await agent.process(request("Recommend something.", "en"));
  const cheaper = await agent.process(request("Too expensive.", "en", first.conversationState));
  assert.equal(cheaper.intent, "recommendation");
  assert.ok(cheaper.conversationState.rankingPriorities?.includes("price"));

  const spicy = await agent.process(request("Fazla acı.", "tr", {
    ...first.conversationState,
    preferredLanguage: "tr",
  }));
  assert.equal(spicy.conversationState.preferenceMemory?.avoidSpicy, true);
});

test("farewell is cart-aware and checkout-aware", async () => {
  const agent = new NoriAgentService();
  const empty = await agent.process(request("Goodbye", "en"));
  assert.match(empty.reply, /Goodbye/);
  assert.equal(empty.conversationState.closingStatus, "closed");

  const withCart = await agent.process(request(
    "Bu kadar, görüşürüz",
    "tr",
    undefined,
    [{ productId: "burger-beef-classic", quantity: 1 }],
  ));
  assert.match(withCart.reply, /Sepetinizde ürünler var/);
  assert.match(withCart.reply, /Ödemeye geçmek|iptal/);
  assert.equal(withCart.conversationState.closingStatus, "awaiting_checkout_decision");
  assert.equal(withCart.conversationState.conversationStage, "closing");
});

test("safety and cart-review interruptions take priority over pending cart and checkout actions", async () => {
  const agent = new NoriAgentService();
  const recommended = await agent.process(request("Proteinli bir şey öner.", "tr"));
  const pending = await agent.process(request("İlkini ekle.", "tr", recommended.conversationState));
  assert.equal(pending.conversationState.pendingAction?.type, "confirm_cart_change");

  const safety = await agent.process(request(
    "Bir dakika, süt içeriyor mu?",
    "tr",
    pending.conversationState,
  ));
  assert.equal(safety.intent, "allergen_check");
  assert.equal(safety.actions.length, 0);
  assert.equal(safety.conversationState.pendingAction?.type, "confirm_cart_change");

  const corrected = await agent.process(request(
    "Yanlış anladın, hafif bir şey istiyorum.",
    "tr",
    safety.conversationState,
  ));
  assert.ok(["recommendation", "healthy_recommendation"].includes(corrected.intent));
  assert.equal(corrected.conversationState.pendingAction, null);
  const pendingHistory = corrected.conversationState.pendingActionHistory ?? [];
  assert.equal(
    pendingHistory[pendingHistory.length - 1]?.status,
    "cancelled",
  );

  const cartFirst = await agent.process(request(
    "Ödemeye geçelim ama önce sepetimde ne var?",
    "tr",
    undefined,
    [{ productId: "burger-beef-classic", quantity: 1 }],
  ));
  assert.equal(cartFirst.intent, "show_cart");
  assert.ok(cartFirst.actions.some(action => action.type === "OPEN_CART"));
  assert.equal(cartFirst.conversationState.pendingAction, null);
});

test("polite rejection can transition to checkout while preserving confirmation policy", async () => {
  const result = await new NoriAgentService().process(request(
    "Hayır teşekkürler, ödemeye geçelim.",
    "tr",
    undefined,
    [{ productId: "burger-beef-classic", quantity: 1 }],
  ));
  assert.equal(result.intent, "checkout");
  assert.equal(result.conversationState.pendingAction?.type, "confirm_checkout");
  assert.equal(result.conversationState.conversationStage, "awaiting_confirmation");
});

test("unrelated and abusive content redirects, while mixed restaurant work still proceeds", async () => {
  const unrelated = await new NoriAgentService().process(request("Can you debug my JavaScript?", "en"));
  assert.equal(unrelated.intent, "conversation");
  assert.match(unrelated.reply, /menu|order/i);

  const abuse = await new NoriAgentService().process(request("You are stupid.", "en"));
  assert.match(abuse.reply, /I’m here to help/);

  const mixed = await new NoriAgentService().process(request("Stupid bot, recommend something light.", "en"));
  assert.ok(["recommendation", "healthy_recommendation"].includes(mixed.intent));
  assert.ok(mixed.recommendedProducts.length > 0);
});

test("multi-turn stages progress through welcome, recommendation, confirmation, cart, and closing", async () => {
  const agent = new NoriAgentService();
  const hello = await agent.process(request("Merhaba", "tr"));
  assert.equal(hello.conversationState.conversationStage, "welcomed");
  const rec = await agent.process(request("Ne önerirsin?", "tr", hello.conversationState));
  assert.equal(rec.conversationState.conversationStage, "recommending");
  const refined = await agent.process(request("Daha proteinli olsun.", "tr", rec.conversationState));
  assert.equal(refined.conversationState.conversationStage, "recommending");
  const add = await agent.process(request("İlkini ekle.", "tr", refined.conversationState));
  assert.equal(add.conversationState.conversationStage, "awaiting_confirmation");
  const confirmed = await agent.process(request("Evet", "tr", add.conversationState));
  assert.equal(confirmed.intent, "add_to_cart");
  assert.equal(confirmed.conversationState.conversationStage, "cart_review");
  const thanks = await agent.process(request(
    "Teşekkürler",
    "tr",
    confirmed.conversationState,
    [{ productId: refined.recommendedProducts[0].id, quantity: 1 }],
  ));
  assert.match(thanks.reply, /Rica ederim/);
  const end = await agent.process(request(
    "Bu kadar",
    "tr",
    thanks.conversationState,
    [{ productId: refined.recommendedProducts[0].id, quantity: 1 }],
  ));
  assert.equal(end.conversationState.conversationStage, "closing");
});
