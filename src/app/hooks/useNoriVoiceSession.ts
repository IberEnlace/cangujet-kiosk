import { useCallback, useEffect, useRef, useState } from "react";
import {
  isSecureVoiceContext,
  SpeechRecognitionFailureError,
  useSpeechRecognition,
  type SpeechRecognitionFailure,
} from "./useSpeechRecognition";
import { useSpeechSynthesis } from "./useSpeechSynthesis";
import { shouldSpeakNoriReply } from "../services/voice/speakableText";
import { getLanguageDefinition, type SupportedLanguage } from "../config/languages";
import type { NoriCopy } from "../pages/nori/noriCopy";
import type { NoriConversationReply } from "../context/NoriConversationContext";

export type VoiceStatus =
  | "idle"
  | "requesting-permission"
  | "listening"
  | "processing"
  | "speaking"
  | "paused"
  | "error";

interface UseNoriVoiceSessionOptions {
  language: SupportedLanguage;
  copy: NoriCopy;
  sendMessage: (text: string) => Promise<NoriConversationReply | null>;
  onSpeechInterrupted?: () => void;
}

function recognitionMessage(code: SpeechRecognitionFailure, copy: NoriCopy) {
  if (code === "permission-denied") return copy.denied;
  if (code === "microphone-not-found") return copy.microphoneNotFound;
  if (code === "network") return copy.networkError;
  if (code === "unsupported" || code === "service-unavailable" || code === "language-not-supported") return copy.unsupported;
  if (code === "insecure-context") return copy.insecureContext;
  if (code === "no-speech") return copy.noSpeech;
  return copy.error;
}

function errorName(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error
    ? String((error as { name: unknown }).name)
    : "";
}

function microphonePermissionError(error: unknown): SpeechRecognitionFailure {
  const name = errorName(error);
  if (name === "NotAllowedError" || name === "SecurityError") return "permission-denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "microphone-not-found";
  return "unknown";
}

function failureCanResume(code: SpeechRecognitionFailure) {
  return code === "no-speech" || code === "network" || code === "aborted" || code === "already-active" || code === "unknown";
}

function sessionIsStopped(status: VoiceStatus) {
  return status === "idle" || status === "paused";
}

export function useNoriVoiceSession({ language, copy, sendMessage, onSpeechInterrupted }: UseNoriVoiceSessionOptions) {
  const {
    abort: abortRecognition,
    interimTranscript,
    start: startRecognition,
    supported: recognitionSupported,
  } = useSpeechRecognition();
  const {
    cancel: cancelSpeech,
    speak,
    supported: synthesisSupported,
  } = useSpeechSynthesis();
  const [status, setStatusState] = useState<VoiceStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [lastTranscript, setLastTranscript] = useState("");
  const [currentResponse, setCurrentResponse] = useState("");
  const [canResume, setCanResumeState] = useState(true);
  const languageDefinition = getLanguageDefinition(language);
  const mountedRef = useRef(true);
  const statusRef = useRef<VoiceStatus>("idle");
  const canResumeRef = useRef(true);
  const sessionEpochRef = useRef(0);
  const nextTurnIdRef = useRef(0);
  const activeTurnIdRef = useRef<number | null>(null);
  const permissionGrantedRef = useRef(false);
  const permissionRequestRef = useRef<Promise<SpeechRecognitionFailure | null> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousLanguageRef = useRef(language);

  const setStatus = useCallback((next: VoiceStatus) => {
    statusRef.current = next;
    if (mountedRef.current) setStatusState(next);
  }, []);

  const setCanResume = useCallback((value: boolean) => {
    canResumeRef.current = value;
    if (mountedRef.current) setCanResumeState(value);
  }, []);

  const fail = useCallback((message: string, resumable: boolean) => {
    if (!mountedRef.current) return;
    setErrorMessage(message);
    setCanResume(resumable);
    setStatus("error");
  }, [setCanResume, setStatus]);

  const failRecognition = useCallback((code: SpeechRecognitionFailure) => {
    fail(recognitionMessage(code, copy), failureCanResume(code));
  }, [copy, fail]);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current === null) return;
    globalThis.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
  }, []);

  const listenForTurnRef = useRef<() => Promise<void>>(async () => undefined);

  const continueListening = useCallback((sessionEpoch: number) => {
    if (
      !mountedRef.current
      || sessionEpoch !== sessionEpochRef.current
      || sessionIsStopped(statusRef.current)
      || activeTurnIdRef.current !== null
    ) return;
    clearRestartTimer();
    restartTimerRef.current = globalThis.setTimeout(() => {
      restartTimerRef.current = null;
      if (
        mountedRef.current
        && sessionEpoch === sessionEpochRef.current
        && !sessionIsStopped(statusRef.current)
        && activeTurnIdRef.current === null
      ) void listenForTurnRef.current();
    }, 220);
  }, [clearRestartTimer]);

  const listenForTurn = useCallback(async () => {
    if (!mountedRef.current || sessionIsStopped(statusRef.current) || activeTurnIdRef.current !== null) return;
    const sessionEpoch = sessionEpochRef.current;
    const turnId = ++nextTurnIdRef.current;
    activeTurnIdRef.current = turnId;
    const isCurrentTurn = () => (
      mountedRef.current
      && sessionEpoch === sessionEpochRef.current
      && activeTurnIdRef.current === turnId
    );
    setErrorMessage("");
    try {
      const transcript = await startRecognition({
        language: languageDefinition.speechRecognitionLocale,
        onStart: () => {
          if (isCurrentTurn()) setStatus("listening");
        },
      });
      if (!isCurrentTurn() || sessionIsStopped(statusRef.current)) return;
      const value = transcript.trim();
      if (!value) {
        activeTurnIdRef.current = null;
        failRecognition("no-speech");
        return;
      }

      setLastTranscript(value);
      setStatus("processing");
      const reply = await sendMessage(value);
      if (!isCurrentTurn() || sessionIsStopped(statusRef.current)) return;
      if (!reply) {
        activeTurnIdRef.current = null;
        fail(copy.responseError, true);
        return;
      }

      const responseText = reply.text;
      setCurrentResponse(responseText);
      if (reply.speechDirectives.shouldSpeak === false) {
        activeTurnIdRef.current = null;
        setStatus("listening");
        continueListening(sessionEpoch);
        return;
      }
      if (!shouldSpeakNoriReply(responseText)) {
        activeTurnIdRef.current = null;
        fail(responseText, true);
        return;
      }
      abortRecognition();
      if (!synthesisSupported) {
        activeTurnIdRef.current = null;
        fail(copy.voiceUnavailable, false);
        return;
      }

      try {
        setStatus("speaking");
        await speak(responseText, {
          language: languageDefinition.speechSynthesisLocale,
          rate: reply.speechDirectives.rate,
          onStart: () => {
            if (isCurrentTurn()) setStatus("speaking");
          },
        });
      } catch (error) {
        if (!isCurrentTurn()) return;
        activeTurnIdRef.current = null;
        fail(errorName(error) === "VoiceUnavailableError" ? copy.voiceUnavailable : copy.playbackError, false);
        return;
      }

      if (isCurrentTurn() && !sessionIsStopped(statusRef.current)) {
        activeTurnIdRef.current = null;
        setStatus("listening");
        continueListening(sessionEpoch);
      }
    } catch (error) {
      if (!isCurrentTurn()) return;
      activeTurnIdRef.current = null;
      const code = error instanceof SpeechRecognitionFailureError ? error.code : "unknown";
      if (code === "aborted" || sessionIsStopped(statusRef.current)) return;
      failRecognition(code);
    }
  }, [
    abortRecognition,
    continueListening,
    copy,
    fail,
    failRecognition,
    languageDefinition.speechRecognitionLocale,
    languageDefinition.speechSynthesisLocale,
    sendMessage,
    setStatus,
    speak,
    startRecognition,
    synthesisSupported,
  ]);

  listenForTurnRef.current = listenForTurn;

  const requestPermission = useCallback((): Promise<SpeechRecognitionFailure | null> => {
    if (permissionGrantedRef.current) return Promise.resolve(null);
    if (permissionRequestRef.current) return permissionRequestRef.current;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return Promise.resolve(null);

    const request = navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        stream.getTracks().forEach(track => track.stop());
        permissionGrantedRef.current = true;
        return null;
      })
      .catch((error: unknown) => microphonePermissionError(error))
      .finally(() => {
        if (permissionRequestRef.current === request) permissionRequestRef.current = null;
      });
    permissionRequestRef.current = request;
    return request;
  }, []);

  const startSession = useCallback(async () => {
    if (statusRef.current !== "idle" && statusRef.current !== "error") return;
    const sessionEpoch = ++sessionEpochRef.current;
    activeTurnIdRef.current = null;
    clearRestartTimer();
    abortRecognition();
    cancelSpeech();
    setErrorMessage("");
    setCanResume(true);
    if (!recognitionSupported) {
      failRecognition("unsupported");
      return;
    }
    if (!isSecureVoiceContext()) {
      failRecognition("insecure-context");
      return;
    }

    setStatus("requesting-permission");
    const permissionError = await requestPermission();
    if (sessionEpoch !== sessionEpochRef.current || !mountedRef.current) return;
    if (permissionError) {
      failRecognition(permissionError);
      return;
    }
    setStatus("listening");
    void listenForTurnRef.current();
  }, [
    abortRecognition,
    cancelSpeech,
    clearRestartTimer,
    failRecognition,
    recognitionSupported,
    requestPermission,
    setCanResume,
    setStatus,
  ]);

  const pause = useCallback(() => {
    if (statusRef.current !== "listening" && statusRef.current !== "requesting-permission") return;
    sessionEpochRef.current += 1;
    activeTurnIdRef.current = null;
    clearRestartTimer();
    abortRecognition();
    setCanResume(true);
    setStatus("paused");
  }, [abortRecognition, clearRestartTimer, setCanResume, setStatus]);

  const resume = useCallback(() => {
    if ((statusRef.current !== "paused" && statusRef.current !== "error") || !canResumeRef.current) return;
    sessionEpochRef.current += 1;
    activeTurnIdRef.current = null;
    clearRestartTimer();
    setErrorMessage("");
    setStatus("listening");
    void listenForTurnRef.current();
  }, [clearRestartTimer, setStatus]);

  const interrupt = useCallback(() => {
    if (statusRef.current !== "speaking") return;
    sessionEpochRef.current += 1;
    activeTurnIdRef.current = null;
    clearRestartTimer();
    cancelSpeech();
    onSpeechInterrupted?.();
    abortRecognition();
    setErrorMessage("");
    setCanResume(true);
    setStatus("listening");
    void listenForTurnRef.current();
  }, [abortRecognition, cancelSpeech, clearRestartTimer, onSpeechInterrupted, setCanResume, setStatus]);

  const stopSpeaking = useCallback(() => {
    if (statusRef.current !== "speaking") return;
    sessionEpochRef.current += 1;
    activeTurnIdRef.current = null;
    clearRestartTimer();
    cancelSpeech();
    setCanResume(true);
    setStatus("paused");
  }, [cancelSpeech, clearRestartTimer, setCanResume, setStatus]);

  const endSession = useCallback(() => {
    sessionEpochRef.current += 1;
    activeTurnIdRef.current = null;
    clearRestartTimer();
    abortRecognition();
    cancelSpeech();
    setErrorMessage("");
    setLastTranscript("");
    setCurrentResponse("");
    setCanResume(true);
    setStatus("idle");
  }, [abortRecognition, cancelSpeech, clearRestartTimer, setCanResume, setStatus]);

  useEffect(() => {
    if (previousLanguageRef.current === language) return;
    previousLanguageRef.current = language;
    const wasRequestingPermission = statusRef.current === "requesting-permission";
    const wasActive = statusRef.current === "requesting-permission"
      || statusRef.current === "listening"
      || statusRef.current === "processing"
      || statusRef.current === "speaking";
    const sessionEpoch = ++sessionEpochRef.current;
    activeTurnIdRef.current = null;
    clearRestartTimer();
    abortRecognition();
    cancelSpeech();
    setErrorMessage("");
    if (!wasActive) return;
    setCanResume(true);
    if (wasRequestingPermission) {
      setStatus("requesting-permission");
      void requestPermission().then(permissionError => {
        if (!mountedRef.current || sessionEpoch !== sessionEpochRef.current) return;
        if (permissionError) {
          failRecognition(permissionError);
          return;
        }
        setStatus("listening");
        void listenForTurnRef.current();
      });
      return;
    }
    setStatus("listening");
    restartTimerRef.current = globalThis.setTimeout(() => {
      restartTimerRef.current = null;
      if (mountedRef.current && statusRef.current === "listening") void listenForTurnRef.current();
    }, 0);
  }, [abortRecognition, cancelSpeech, clearRestartTimer, failRecognition, language, requestPermission, setCanResume, setStatus]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionEpochRef.current += 1;
      activeTurnIdRef.current = null;
      clearRestartTimer();
      abortRecognition();
      cancelSpeech();
    };
  }, [abortRecognition, cancelSpeech, clearRestartTimer]);

  return {
    canResume,
    currentResponse,
    endSession,
    errorMessage,
    interimTranscript,
    interrupt,
    lastTranscript,
    pause,
    recognitionSupported,
    resume,
    startSession,
    status,
    stopSpeaking,
    synthesisSupported,
  };
}
