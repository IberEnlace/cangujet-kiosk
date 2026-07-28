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
      <div className="mx-auto flex rounded-2xl border border-white/10 bg-[#1A1A1A] p-1" aria-label={copy.modeAria}>
        <button type="button" onClick={onChat} className="min-h-10 rounded-xl px-5 text-sm font-semibold text-white/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D7FB69]">{copy.chat}</button>
        <button type="button" aria-current="page" className="min-h-10 rounded-xl bg-[#D7FB69] px-5 text-sm font-bold text-[#17200f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">{copy.voice}</button>
      </div>

      <div className="my-auto grid min-w-0 items-center gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.72fr)] lg:text-start">
        <div className="min-w-0 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#D7FB69]/15 bg-[#D7FB69]/7 px-3 py-1.5 text-xs font-semibold text-[#D7FB69]"><Sparkles size={14} aria-hidden="true" />{copy.conversationBadge}</div>
          <VoiceVisualizer copy={copy} status={status} canResume={canResume} onActivate={activate} disabled={status === "requesting-permission" || status === "processing" || (status === "error" && !canResume)} />
          <h2 role="status" aria-live="polite" aria-atomic="true" className="mt-5 text-2xl font-bold tracking-[-.025em]">{voiceStatusLabel(copy, status)}</h2>
          <p className="mt-2 min-h-6 text-sm text-white/45">
            {status === "listening" ? copy.listeningHint : status === "speaking" ? copy.speakingHint : status === "processing" ? copy.processingHint : copy.idleHint}
          </p>
          {status === "idle" && <button type="button" onClick={onStart} className="mt-5 min-h-12 rounded-xl bg-[#D7FB69] px-6 font-bold text-[#17200f] shadow-[0_10px_28px_rgba(215,251,105,.16)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-white">{copy.startVoice}</button>}
        </div>

        <div className="min-w-0 space-y-3">
          {(interimTranscript || status === "listening") && (
            <article className="min-h-24 min-w-0 rounded-3xl border border-[#D7FB69]/20 bg-[#D7FB69]/[.055] p-5" aria-live="polite">
              <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#D7FB69]">{copy.liveTranscript}</p>
              <p className={`mt-2 break-words text-lg leading-7 ${interimTranscript ? "text-white" : "text-white/35"}`}>{interimTranscript || copy.listeningPlaceholder}</p>
            </article>
          )}
          {lastTranscript && (
            <article className="min-w-0 rounded-3xl border border-white/10 bg-white/[.035] p-5">
              <p className="text-[11px] font-bold uppercase tracking-[.16em] text-white/40">{copy.youSaid}</p>
              <p className="mt-2 break-words leading-7 text-white/80">“{lastTranscript}”</p>
            </article>
          )}
          {currentResponse && (
            <article className="min-w-0 rounded-3xl border border-white/10 bg-[#1A1A1A] p-5" aria-live="polite">
              <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#D7FB69]">Nori</p>
              <p className="mt-2 break-words leading-7 text-white/80">{currentResponse}</p>
            </article>
          )}
          {errorMessage && (
            <div role="alert" className="rounded-2xl border border-amber-300/20 bg-amber-300/[.07] px-4 py-3 text-sm leading-6 text-amber-50">{errorMessage}</div>
          )}
        </div>
      </div>

      <VoiceControls copy={copy} status={status} canResume={canResume} onPause={onPause} onResume={onResume} onStopSpeaking={onStopSpeaking} onEnd={onEnd} onChat={onChat} />
      <p className="mt-4 text-center text-xs text-white/35">{copy.privacy}</p>
    </section>
  );
}
