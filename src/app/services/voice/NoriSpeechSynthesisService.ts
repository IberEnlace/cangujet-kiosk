import type { NoriSpeechRate } from "../../../shared/noriSpeech";

export interface NoriSpeechSynthesisService {
  isSupported(): boolean;
  speak(text: string, language: string, rate?: NoriSpeechRate): Promise<void>;
  stop(): void;
}
