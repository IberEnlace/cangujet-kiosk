function normalizedLanguage(value: string) {
  return value.replace(/_/g, "-").toLowerCase();
}

export function selectSpeechVoice(voices: SpeechSynthesisVoice[], language: string) {
  const requested = normalizedLanguage(language);
  const exact = voices.find(voice => normalizedLanguage(voice.lang) === requested);
  if (exact) return exact;
  const baseLanguage = requested.split("-")[0];
  return voices.find(voice => normalizedLanguage(voice.lang).split("-")[0] === baseLanguage);
}
