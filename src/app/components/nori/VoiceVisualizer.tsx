import { Mic, MicOff, Volume2 } from "lucide-react";
import type { VoiceStatus } from "../../hooks/useNoriVoiceSession";
import type { NoriCopy } from "../../pages/nori/noriCopy";

export function VoiceVisualizer({ copy, status, canResume, onActivate, disabled }: {
  copy: NoriCopy;
  status: VoiceStatus;
  canResume: boolean;
  onActivate: () => void;
  disabled?: boolean;
}) {
  const active = status === "listening" || status === "speaking";
  const label = status === "speaking"
    ? copy.interruptAria
    : status === "listening"
      ? copy.pauseListening
      : status === "paused" || (status === "error" && canResume)
        ? copy.resumeListening
        : status === "error"
          ? copy.unsupported
          : copy.startVoice;
  return (
    <div className={`nori-voice-visualizer ${active ? "is-active" : ""} is-${status} relative mx-auto grid size-52 place-items-center sm:size-60`}>
      {active && (
        <>
          <span className="nori-voice-ring absolute inset-3 rounded-full border border-[#D7FB69]/30" aria-hidden="true" />
          <span className="nori-voice-ring nori-voice-ring-delay absolute inset-3 rounded-full border border-[#D7FB69]/20" aria-hidden="true" />
        </>
      )}
      <div className="absolute inset-8 rounded-full border border-white/8 bg-white/[.025] shadow-[0_0_48px_rgba(215,251,105,.08)]" />
      <button
        type="button"
        onClick={onActivate}
        disabled={disabled}
        aria-label={label}
        className="nori-voice-main-button relative z-10 grid size-28 place-items-center rounded-full bg-[#D7FB69] text-[#17200f] shadow-[0_12px_42px_rgba(215,251,105,.22)] transition hover:scale-[1.03] active:scale-95 focus-visible:outline focus-visible:outline-4 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-45"
      >
        {status === "speaking" ? <Volume2 size={42} aria-hidden="true" /> : status === "paused" ? <MicOff size={42} aria-hidden="true" /> : <Mic size={42} aria-hidden="true" />}
      </button>
      {active && (
        <div className="nori-wave absolute bottom-3 flex h-7 items-center gap-1" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6].map(bar => <span key={bar} style={{ animationDelay: `${bar * 90}ms` }} className="w-1 rounded-full bg-[#D7FB69]/75" />)}
        </div>
      )}
    </div>
  );
}
