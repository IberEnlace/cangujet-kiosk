export type NoriSpeechRate = "slow" | "normal" | "fast";

export type NoriSpeechDirectives = {
  rate: NoriSpeechRate;
  interruptCurrentSpeech?: boolean;
  shouldSpeak?: boolean;
};

const SPEECH_RATE_VALUES: Record<NoriSpeechRate, number> = {
  slow: 0.8,
  normal: 1,
  fast: 1.15,
};

export function browserSpeechRate(rate: NoriSpeechRate) {
  return Math.min(1.25, Math.max(0.75, SPEECH_RATE_VALUES[rate]));
}
