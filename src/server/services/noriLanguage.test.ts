import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  LANGUAGE_CONFIG,
  SUPPORTED_LANGUAGE_CODES,
  getNoriLanguageInstruction,
  normalizeSupportedLanguage,
} from "../../shared/languages";
import { supportedLanguages } from "../../app/config/languages";
import { noriCopy } from "../../app/pages/nori/noriCopy";
import { createState, NoriAgentService } from "./noriAgentService";
import { normalizeNoriInput, routeNoriIntent } from "./noriIntentRouter";

test("the shared language contract contains only English and Turkish", () => {
  assert.deepEqual(SUPPORTED_LANGUAGE_CODES, ["en", "tr"]);
  assert.deepEqual(supportedLanguages.map(language => language.code), ["en", "tr"]);
  assert.deepEqual(Object.keys(noriCopy), ["en", "tr"]);
});

test("legacy and unknown persisted languages migrate safely to English", () => {
  for (const value of ["ar", "ar-SA", "Arabic", "de-DE", "", null]) {
    assert.equal(normalizeSupportedLanguage(value), "en");
  }
  assert.equal(normalizeSupportedLanguage("tr-TR"), "tr");
});

test("speech locales come from the shared language configuration", () => {
  assert.equal(LANGUAGE_CONFIG.en.speechRecognitionLocale, "en-US");
  assert.equal(LANGUAGE_CONFIG.en.speechSynthesisLocale, "en-US");
  assert.equal(LANGUAGE_CONFIG.tr.speechRecognitionLocale, "tr-TR");
  assert.equal(LANGUAGE_CONFIG.tr.speechSynthesisLocale, "tr-TR");
});

test("provider language instructions explicitly constrain English and Turkish output", () => {
  assert.equal(getNoriLanguageInstruction("en"), "Respond entirely in English.");
  assert.match(getNoriLanguageInstruction("tr"), /Respond entirely in natural Turkish/);
  assert.match(getNoriLanguageInstruction("tr"), /Keep product names/);
});

test("Turkish lowercase normalization handles dotted and dotless I without altering the transcript", () => {
  const transcript = "İLKİNİ SEÇ, ILIK İÇECEK İSTİYORUM";
  assert.equal(normalizeNoriInput(transcript, "tr"), "ilkini seç, ılık içecek istiyorum");
  assert.equal(transcript, "İLKİNİ SEÇ, ILIK İÇECEK İSTİYORUM");
});

const turkishIntentCases = [
  ["Sağlıklı bir şey öner", "healthy_recommendation"],
  ["Protein oranı yüksek bir yemek istiyorum", "recommendation"],
  ["Acılı bir şey istiyorum", "recommendation"],
  ["Vejetaryen seçenekler neler?", "recommendation"],
  ["Bütçeme uygun bir şey öner", "recommendation"],
  ["İlk iki seçeneği karşılaştır", "compare_products"],
  ["Hangisi daha sağlıklı?", "comparison_follow_up"],
  ["İlkini seç", "product_details"],
  ["Bunu sepete ekle", "add_to_cart"],
  ["Peyniri çıkar", "customization_question"],
  ["Sepeti temizle", "clear_cart"],
  ["Ödemeye geç", "checkout"],
] as const;

for (const [message, intent] of turkishIntentCases) {
  test(`routes Turkish command: ${message}`, () => {
    const state = createState({ message: "", cart: [], activeAllergens: [], language: "tr" });
    assert.equal(routeNoriIntent(message, state).intent, intent);
  });
}

test("Turkish confirmation and cancellation are contextual pending-action commands", () => {
  const state = createState({ message: "", cart: [], activeAllergens: [], language: "tr" });
  state.pendingAction = {
    id: "pending-test",
    createdAt: Date.now(),
    status: "awaiting_confirmation",
    type: "confirm_clear_cart",
  };
  assert.equal(routeNoriIntent("Evet", state).intent, "confirmation");
  assert.equal(routeNoriIntent("İptal et", state).intent, "cancellation");
});

test("Turkish deterministic Nori responses remain Turkish and preserve menu product names", async () => {
  const result = await new NoriAgentService().process({
    message: "Sağlıklı bir şey öner",
    cart: [],
    activeAllergens: [],
    language: "tr",
  });
  assert.equal(result.conversationState.preferredLanguage, "tr");
  assert.ok(result.recommendedProducts.length > 0);
  assert.match(result.reply, /önerim|seçenek|kalori|protein|fiyatı/i);
  assert.ok(result.recommendedProducts.some(product => result.reply.includes(product.name)));
});

test("chat and voice consume the same language context and voice locale changes invalidate active work", () => {
  const chat = readFileSync(new URL("../../app/pages/nori/NoriTextChat.tsx", import.meta.url), "utf8");
  const voicePage = readFileSync(new URL("../../app/pages/nori/NoriVoiceConversation.tsx", import.meta.url), "utf8");
  const voiceHook = readFileSync(new URL("../../app/hooks/useNoriVoiceSession.ts", import.meta.url), "utf8");
  assert.match(chat, /useLanguage\(\)/);
  assert.match(voicePage, /useLanguage\(\)/);
  assert.match(voicePage, /language,\s*copy: text,\s*sendMessage/);
  assert.match(voiceHook, /previousLanguageRef/);
  assert.match(voiceHook, /abortRecognition\(\);\s*cancelSpeech\(\);/);
});
