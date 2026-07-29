import assert from "node:assert/strict";
import test from "node:test";
import { browserSpeechRate } from "../../shared/noriSpeech";
import type { NoriChatRequest, NoriConversationState, NoriLanguage } from "../types/noriChat";
import { NoriAgentService } from "./noriAgentService";
import { detectNoriSpeechPreferenceCommand } from "./noriSpeechPreferenceService";

function request(message: string, language: NoriLanguage, state?: NoriConversationState): NoriChatRequest {
  return { message, cart: [], activeAllergens: [], language, conversationState: state };
}

test("deterministic bilingual speech-rate commands map to semantic rates", () => {
  const cases = [
    ["Daha yavaş konuş", "tr", "slow"],
    ["Yavaş konuşur musun?", "tr", "slow"],
    ["Çok hızlı konuşuyorsun", "tr", "slow"],
    ["Biraz yavaş", "tr", "slow"],
    ["Normal konuş", "tr", "normal"],
    ["Daha hızlı konuş", "tr", "fast"],
    ["Hızlı söyle", "tr", "fast"],
    ["Speak more slowly", "en", "slow"],
    ["Slow down", "en", "slow"],
    ["You are speaking too fast", "en", "slow"],
    ["A little slower", "en", "slow"],
    ["Speak normally", "en", "normal"],
    ["Speak faster", "en", "fast"],
    ["Speed up", "en", "fast"],
  ] as const;
  for (const [message, language, expected] of cases) {
    assert.equal(detectNoriSpeechPreferenceCommand(message, language)?.rate, expected, message);
  }
});

test("clear rate commands bypass the semantic provider and persist across text and voice turns", async () => {
  let providerCalls = 0;
  const provider = {
    async interpret() {
      providerCalls += 1;
      throw new Error("speech commands must be deterministic");
    },
  };
  const agent = new NoriAgentService(provider as never);
  const slow = await agent.process(request("Speak more slowly", "en"));
  assert.equal(providerCalls, 0);
  assert.equal(slow.conversationState.speechRate, "slow");
  assert.equal(slow.speechDirectives?.rate, "slow");
  assert.match(slow.reply, /more slowly/i);

  const next = await agent.process(request("What do you recommend?", "en", slow.conversationState));
  assert.equal(next.speechDirectives?.rate, "slow");
  assert.ok(next.recommendedProducts.length > 0);
  const normal = await agent.process(request("Speak normally", "en", next.conversationState));
  assert.equal(normal.speechDirectives?.rate, "normal");
});

test("repeat plus slower uses the structured safe previous-response summary", async () => {
  const agent = new NoriAgentService();
  const recommendation = await agent.process(request("Proteinli bir şey öner.", "tr"));
  const repeat = await agent.process(request(
    "Daha yavaş konuş ve tekrar söyle.",
    "tr",
    recommendation.conversationState,
  ));
  assert.equal(repeat.conversationState.speechRate, "slow");
  assert.equal(repeat.speechDirectives?.rate, "slow");
  assert.match(repeat.reply, /Kısaca tekrar/);
  assert.match(repeat.reply, /g protein/);

  const english = await agent.process(request("Say that again more slowly.", "en", {
    ...recommendation.conversationState,
    preferredLanguage: "en",
  }));
  assert.equal(english.speechDirectives?.rate, "slow");
  assert.match(english.reply, /Briefly/);
});

test("browser speech-rate mapping is bounded and reset state defaults to normal", async () => {
  assert.equal(browserSpeechRate("slow"), 0.8);
  assert.equal(browserSpeechRate("normal"), 1);
  assert.equal(browserSpeechRate("fast"), 1.15);
  const initial = await new NoriAgentService().process(request("Hello", "en"));
  assert.equal(initial.conversationState.speechRate, "normal");
  assert.equal(initial.speechDirectives?.rate, "normal");
});

test("interruption diagnostics do not reset the persisted speech rate", async () => {
  const agent = new NoriAgentService();
  const slow = await agent.process(request("Slow down", "en"));
  const interruptedState = { ...slow.conversationState, lastTtsInterrupted: true };
  const refinement = await agent.process(request("Actually, something cheaper.", "en", interruptedState));
  assert.equal(refinement.conversationState.lastTtsInterrupted, true);
  assert.equal(refinement.conversationState.speechRate, "slow");
  assert.equal(refinement.speechDirectives?.rate, "slow");
  assert.ok(refinement.conversationState.rankingPriorities?.includes("price"));
});
