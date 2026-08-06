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
          <span className="nori-voice-ring absolute inset-3 rounded-full border border-[#C41E19]/25" aria-hidden="true" />
          <span className="nori-voice-ring nori-voice-ring-delay absolute inset-3 rounded-full border border-[#C41E19]/15" aria-hidden="true" />
        </>
      )}
      <div className="absolute inset-8 rounded-full border border-[#ECECEC] bg-[#F8F9FA] shadow-[0_12px_32px_rgba(31,31,31,.08)]" />
      <button
        type="button"
        onClick={onActivate}
        disabled={disabled}
        aria-label={label}
        className="nori-voice-main-button relative z-10 grid size-28 place-items-center rounded-full bg-[#C41E19] text-white shadow-[0_12px_30px_rgba(196,30,25,.2)] transition duration-200 hover:scale-[1.03] hover:bg-[#A8161A] active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C41E19]/15 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {status === "speaking" ? <Volume2 size={42} aria-hidden="true" /> : status === "paused" ? <MicOff size={42} aria-hidden="true" /> : <Mic size={42} aria-hidden="true" />}
      </button>
      {active && (
        <div className="nori-wave absolute bottom-3 flex h-7 items-center gap-1" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6].map(bar => <span key={bar} style={{ animationDelay: `${bar * 90}ms` }} className="w-1 rounded-full bg-[#C41E19]/75" />)}
        </div>
      )}
    </div>
  );
}
