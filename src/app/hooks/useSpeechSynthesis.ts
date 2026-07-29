import { useCallback, useEffect, useRef } from "react";
import { toSpeakableText } from "../services/voice/speakableText";
import { selectSpeechVoice } from "../services/voice/speechVoiceSelection";
import { browserSpeechRate, type NoriSpeechRate } from "../../shared/noriSpeech";

interface SpeakOptions {
  language: string;
  rate?: NoriSpeechRate;
  onStart?: () => void;
}

interface SynthesisOperation {
  id: number;
  utterance: SpeechSynthesisUtterance | null;
  cleanupPreparation: () => void;
  cancel: () => void;
}

function synthesisEngine() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

function waitForVoices(engine: SpeechSynthesis, ready: (voices: SpeechSynthesisVoice[]) => void) {
  const existing = engine.getVoices();
  if (existing.length) {
    ready(existing);
    return () => undefined;
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timeout);
    engine.removeEventListener("voiceschanged", onVoicesChanged);
    ready(engine.getVoices());
  };
  const onVoicesChanged = () => finish();
  const timeout = window.setTimeout(finish, 750);
  engine.addEventListener("voiceschanged", onVoicesChanged);
  return () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timeout);
    engine.removeEventListener("voiceschanged", onVoicesChanged);
  };
}

export function useSpeechSynthesis() {
  const supported = Boolean(synthesisEngine()) && typeof SpeechSynthesisUtterance !== "undefined";
  const activeRef = useRef<SynthesisOperation | null>(null);
  const nextOperationIdRef = useRef(0);
  const mountedRef = useRef(true);

  const cancel = useCallback(() => {
    activeRef.current?.cancel();
  }, []);

  const speak = useCallback((displayText: string, { language, rate = "normal", onStart }: SpeakOptions) => {
    const engine = synthesisEngine();
    if (!engine || typeof SpeechSynthesisUtterance === "undefined") {
      return Promise.reject(new Error("speech-synthesis-unsupported"));
    }
    cancel();
    const text = toSpeakableText(displayText, language);
    if (!text) return Promise.resolve();
    const operationId = ++nextOperationIdRef.current;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const operation: SynthesisOperation = {
        id: operationId,
        utterance: null,
        cleanupPreparation: () => undefined,
        cancel: () => undefined,
      };
      const isCurrent = () => activeRef.current?.id === operationId;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        operation.cleanupPreparation();
        if (operation.utterance) {
          operation.utterance.onstart = null;
          operation.utterance.onend = null;
          operation.utterance.onerror = null;
        }
        if (isCurrent()) activeRef.current = null;
        if (error) reject(error);
        else resolve();
      };
      operation.cancel = () => {
        if (settled) return;
        finish();
        engine.cancel();
      };
      activeRef.current = operation;

      operation.cleanupPreparation = waitForVoices(engine, voices => {
        if (!mountedRef.current || !isCurrent() || settled) return;
        const voice = selectSpeechVoice(voices, language);
        if (!voice) {
          const unavailable = new Error("speech-synthesis-voice-unavailable");
          unavailable.name = "VoiceUnavailableError";
          finish(unavailable);
          return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        operation.utterance = utterance;
        utterance.lang = language;
        utterance.voice = voice;
        utterance.rate = browserSpeechRate(rate);
        utterance.pitch = 1;
        utterance.volume = 1;
        utterance.onstart = () => {
          if (mountedRef.current && isCurrent()) onStart?.();
        };
        utterance.onend = () => {
          if (isCurrent()) finish();
        };
        utterance.onerror = event => {
          if (!isCurrent()) return;
          if (event.error === "canceled" || event.error === "interrupted") finish();
          else finish(new Error("speech-synthesis-failed"));
        };
        try {
          engine.speak(utterance);
        } catch {
          finish(new Error("speech-synthesis-failed"));
        }
      });
    });
  }, [cancel]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRef.current?.cancel();
    };
  }, []);

  return { cancel, speak, supported };
}
