import assert from "node:assert/strict";
import test from "node:test";
import { shouldSpeakNoriReply, toSpeakableText } from "./voice/speakableText";
import { selectSpeechVoice } from "./voice/speechVoiceSelection";

test("removes markdown and technical action metadata from spoken replies", () => {
  assert.equal(
    toSpeakableText("## Great choice\n**Bowl** [details](https://example.com) [[action:add_to_cart]]", "en-US"),
    "Great choice Bowl details",
  );
});

test("turns formatted prices into natural English speech", () => {
  assert.equal(
    toSpeakableText("Your total is $12.50.", "en-US"),
    "Your total is 12 dollars and 50 cents.",
  );
});

test("keeps Turkish response text and locale-aware prices speakable", () => {
  assert.equal(toSpeakableText("Toplam: $12.50", "tr-TR"), "Toplam: 12,5 dolar");
});

test("does not speak backend failure messages", () => {
  assert.equal(shouldSpeakNoriReply("Nori could not respond right now. Please try again."), false);
  assert.equal(shouldSpeakNoriReply("The bowl could not be added, so your cart is unchanged."), true);
});

test("removes IDs, tool names, JSON, and hidden button directives", () => {
  const response = [
    "Your bowl is ready.",
    "Action ID: action-12345",
    '"productId": "bowl-chicken-protein",',
    "add_to_cart",
    "[[button: Review cart]]",
    "550e8400-e29b-41d4-a716-446655440000",
  ].join("\n");
  assert.equal(toSpeakableText(response, "en-US"), "Your bowl is ready.");
});

test("selects only an exact or same-language speech voice", () => {
  const voice = (name: string, lang: string, isDefault = false) => ({
    default: isDefault,
    lang,
    localService: true,
    name,
    voiceURI: name,
  }) as SpeechSynthesisVoice;
  const voices = [voice("English", "en-US", true), voice("Turkish fallback", "tr-CY"), voice("Turkish", "tr-TR")];
  assert.equal(selectSpeechVoice(voices, "tr-TR")?.name, "Turkish");
  assert.equal(selectSpeechVoice(voices.slice(0, 2), "tr-TR")?.name, "Turkish fallback");
  assert.equal(selectSpeechVoice([voices[0]], "tr-TR"), undefined);
  assert.equal(selectSpeechVoice(voices, "de-DE"), undefined);
});
