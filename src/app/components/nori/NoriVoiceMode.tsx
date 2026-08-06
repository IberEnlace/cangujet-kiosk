import { Sparkles } from "lucide-react";
import type { VoiceStatus } from "../../hooks/useNoriVoiceSession";
import { voiceStatusLabel, type NoriCopy } from "../../pages/nori/noriCopy";
import { VoiceControls } from "./VoiceControls";
import { VoiceVisualizer } from "./VoiceVisualizer";

export function NoriVoiceMode({
  copy,
  status,
  interimTranscript,
  lastTranscript,
  currentResponse,
  errorMessage,
  canResume,
  onStart,
  onPause,
  onResume,
  onInterrupt,
  onStopSpeaking,
  onEnd,
  onChat,
}: {
  copy: NoriCopy;
  status: VoiceStatus;
  interimTranscript: string;
  lastTranscript: string;
  currentResponse: string;
  errorMessage: string;
  canResume: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onInterrupt: () => void;
  onStopSpeaking: () => void;
  onEnd: () => void;
  onChat: () => void;
}) {
  const activate = status === "speaking"
    ? onInterrupt
    : status === "listening"
      ? onPause
      : status === "paused" || (status === "error" && canResume)
        ? onResume
        : onStart;
  return (
    <section className="mx-auto flex w-full min-w-0 max-w-4xl flex-1 flex-col overflow-x-hidden px-4 pb-5 pt-4 sm:px-7 sm:pb-7">
      <div className="mx-auto flex rounded-2xl border border-[#ECECEC] bg-[#F8F9FA] p-1" aria-label={copy.modeAria}>
        <button type="button" onClick={onChat} className="min-h-10 rounded-xl px-5 text-sm font-semibold text-[#6B7280] transition hover:bg-white hover:text-[#1F1F1F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C41E19]/20">{copy.chat}</button>
        <button type="button" aria-current="page" className="min-h-10 rounded-xl bg-[#C41E19] px-5 text-sm font-bold text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C41E19]/20">{copy.voice}</button>
      </div>

      <div className="my-auto grid min-w-0 items-center gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.72fr)] lg:text-start">
        <div className="min-w-0 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#C41E19]/15 bg-[#C41E19]/5 px-3 py-1.5 text-xs font-semibold text-[#C41E19]"><Sparkles size={14} aria-hidden="true" />{copy.conversationBadge}</div>
          <VoiceVisualizer copy={copy} status={status} canResume={canResume} onActivate={activate} disabled={status === "requesting-permission" || status === "processing" || (status === "error" && !canResume)} />
          <h2 role="status" aria-live="polite" aria-atomic="true" className="mt-5 text-2xl font-bold tracking-[-.025em]">{voiceStatusLabel(copy, status)}</h2>
          <p className="mt-2 min-h-6 text-sm text-[#6B7280]">
            {status === "listening" ? copy.listeningHint : status === "speaking" ? copy.speakingHint : status === "processing" ? copy.processingHint : copy.idleHint}
          </p>
          {status === "idle" && <button type="button" onClick={onStart} className="mt-5 min-h-12 rounded-xl bg-[#C41E19] px-6 font-bold text-white shadow-[0_8px_20px_rgba(196,30,25,.18)] transition hover:bg-[#A8161A] active:scale-[.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C41E19]/15">{copy.startVoice}</button>}
        </div>

        <div className="min-w-0 space-y-3">
          {(interimTranscript || status === "listening") && (
            <article className="min-h-24 min-w-0 rounded-2xl border border-[#C41E19]/15 bg-[#C41E19]/[.035] p-5 shadow-sm" aria-live="polite">
              <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#C41E19]">{copy.liveTranscript}</p>
              <p className={`mt-2 break-words text-lg leading-7 ${interimTranscript ? "text-[#1F1F1F]" : "text-[#9CA3AF]"}`}>{interimTranscript || copy.listeningPlaceholder}</p>
            </article>
          )}
          {lastTranscript && (
            <article className="min-w-0 rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#6B7280]">{copy.youSaid}</p>
              <p className="mt-2 break-words leading-7 text-[#1F1F1F]">“{lastTranscript}”</p>
            </article>
          )}
          {currentResponse && (
            <article className="min-w-0 rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-sm" aria-live="polite">
              <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#C41E19]">Nori</p>
              <p className="mt-2 break-words leading-7 text-[#1F1F1F]">{currentResponse}</p>
            </article>
          )}
          {errorMessage && (
            <div role="alert" className="rounded-2xl border border-[#C41E19]/20 bg-[#C41E19]/5 px-4 py-3 text-sm leading-6 text-[#C41E19]">{errorMessage}</div>
          )}
        </div>
      </div>

      <VoiceControls copy={copy} status={status} canResume={canResume} onPause={onPause} onResume={onResume} onStopSpeaking={onStopSpeaking} onEnd={onEnd} onChat={onChat} />
      <p className="mt-4 text-center text-xs text-[#9CA3AF]">{copy.privacy}</p>
    </section>
  );
}
