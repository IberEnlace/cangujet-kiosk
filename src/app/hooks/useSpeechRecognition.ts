import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechRecognitionFailure =
  | "aborted"
  | "already-active"
  | "insecure-context"
  | "microphone-not-found"
  | "network"
  | "no-speech"
  | "permission-denied"
  | "service-unavailable"
  | "language-not-supported"
  | "unsupported"
  | "unknown";

export class SpeechRecognitionFailureError extends Error {
  constructor(readonly code: SpeechRecognitionFailure) {
    super(code);
    this.name = "SpeechRecognitionFailureError";
  }
}

interface StartRecognitionOptions {
  language: string;
  onStart?: () => void;
}

interface RecognitionOperation {
  id: number;
  recognition: SpeechRecognition;
  abort: () => void;
}

function recognitionConstructor() {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function isSecureVoiceContext() {
  if (typeof window === "undefined") return false;
  if (window.isSecureContext) return true;
  const hostname = window.location?.hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function mapRecognitionError(error: SpeechRecognitionErrorEvent["error"]): SpeechRecognitionFailure {
  if (error === "not-allowed") return "permission-denied";
  if (error === "service-not-allowed") return "service-unavailable";
  if (error === "language-not-supported") return "language-not-supported";
  if (error === "audio-capture") return "microphone-not-found";
  if (error === "no-speech") return "no-speech";
  if (error === "network") return "network";
  if (error === "aborted") return "aborted";
  return "unknown";
}

function detachRecognitionHandlers(recognition: SpeechRecognition) {
  recognition.onstart = null;
  recognition.onresult = null;
  recognition.onnomatch = null;
  recognition.onerror = null;
  recognition.onend = null;
}

export function useSpeechRecognition() {
  const activeRef = useRef<RecognitionOperation | null>(null);
  const nextOperationIdRef = useRef(0);
  const mountedRef = useRef(true);
  const [interimTranscript, setInterimTranscript] = useState("");
  const supported = Boolean(recognitionConstructor());

  const abort = useCallback(() => {
    activeRef.current?.abort();
    if (mountedRef.current) setInterimTranscript("");
  }, []);

  const stop = useCallback(() => {
    const recognition = activeRef.current?.recognition;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      // Chrome can throw InvalidStateError if its native session already ended.
    }
  }, []);

  const start = useCallback(({ language, onStart }: StartRecognitionOptions) => {
    const Recognition = recognitionConstructor();
    if (!Recognition) return Promise.reject(new SpeechRecognitionFailureError("unsupported"));
    if (!isSecureVoiceContext()) return Promise.reject(new SpeechRecognitionFailureError("insecure-context"));
    if (activeRef.current) return Promise.reject(new SpeechRecognitionFailureError("already-active"));

    const recognition = new Recognition();
    const operationId = ++nextOperationIdRef.current;
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    return new Promise<string>((resolve, reject) => {
      let finalTranscript = "";
      let settled = false;
      let stopRequested = false;
      const finalResults = new Map<number, string>();

      const isCurrent = () => activeRef.current?.id === operationId;
      const finish = (error?: SpeechRecognitionFailureError) => {
        if (settled) return;
        settled = true;
        if (isCurrent()) activeRef.current = null;
        detachRecognitionHandlers(recognition);
        if (mountedRef.current) setInterimTranscript("");
        if (error) reject(error);
        else if (finalTranscript.trim()) resolve(finalTranscript.trim());
        else reject(new SpeechRecognitionFailureError("no-speech"));
      };

      const abortOperation = () => {
        if (settled) return;
        finish(new SpeechRecognitionFailureError("aborted"));
        try {
          recognition.abort();
        } catch {
          // The native operation may already be closed; the JS operation is settled.
        }
      };

      activeRef.current = { id: operationId, recognition, abort: abortOperation };
      recognition.onstart = () => {
        if (isCurrent() && mountedRef.current) onStart?.();
      };
      recognition.onresult = event => {
        if (!isCurrent() || settled) return;
        let interim = "";
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result[0]?.transcript?.trim() ?? "";
          if (result.isFinal) finalResults.set(index, transcript);
          else if (transcript) interim += `${transcript} `;
        }
        finalTranscript = [...finalResults.entries()]
          .sort(([left], [right]) => left - right)
          .map(([, transcript]) => transcript)
          .filter(Boolean)
          .join(" ");
        if (mountedRef.current) setInterimTranscript(interim.trim());
        if (finalTranscript && !stopRequested) {
          stopRequested = true;
          try {
            recognition.stop();
          } catch {
            finish();
          }
        }
      };
      recognition.onnomatch = () => {
        if (!isCurrent() || settled) return;
        stopRequested = true;
        try {
          recognition.stop();
        } catch {
          finish(new SpeechRecognitionFailureError("no-speech"));
        }
      };
      recognition.onerror = event => {
        if (isCurrent()) finish(new SpeechRecognitionFailureError(mapRecognitionError(event.error)));
      };
      recognition.onend = () => {
        if (isCurrent()) finish();
      };

      try {
        recognition.start();
      } catch (error) {
        const isDomException = typeof DOMException !== "undefined" && error instanceof DOMException;
        const code = isDomException && error.name === "InvalidStateError"
          ? "already-active"
          : isDomException && error.name === "SecurityError"
            ? "permission-denied"
            : "unknown";
        finish(new SpeechRecognitionFailureError(code));
      }
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRef.current?.abort();
    };
  }, []);

  return { abort, interimTranscript, start, stop, supported };
}
