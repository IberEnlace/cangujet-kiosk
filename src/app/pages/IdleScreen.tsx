import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Hand } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import BackgroundVideo from "../components/idle/BackgroundVideo";
import MorrowLogo from "../components/branding/MorrowLogo";
import { useKiosk } from "../context/BootstrapContext";

export default function IdleScreen({ onStart }: { onStart: () => void }) {
  const kiosk = useKiosk();
  const bootstrapConfig = kiosk!.idle;
  const config = {
    videos: bootstrapConfig.videos,
    videoIntervalMs: bootstrapConfig.videoIntervalMs,
    minimumPlaybackBeforeTransitionMs: bootstrapConfig.minimumPlaybackMs,
    startTransitionMs: bootstrapConfig.transitionMs,
    title: bootstrapConfig.title,
    slogan: bootstrapConfig.slogan,
    description: bootstrapConfig.description,
    buttonLabel: bootstrapConfig.buttonLabel,
    touchLabel: bootstrapConfig.touchLabel,
  };
  const [isStarting, setIsStarting] = useState(false);
  const startingRef = useRef(false);
  const reducedMotion = useReducedMotion();
  const handleStart = useCallback(() => {
    if (startingRef.current) return;
    startingRef.current = true;
    setIsStarting(true);
    window.setTimeout(onStart, reducedMotion ? 100 : config.startTransitionMs);
  }, [onStart, reducedMotion]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); handleStart(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [handleStart]);

  const enter = (delay: number) => reducedMotion ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: .7, delay } };
  return (
    <main className="relative isolate min-h-[100dvh] w-full cursor-pointer overflow-hidden bg-white/20 text-[#1F1F1F] selection:bg-transparent" onClick={handleStart}>
      <BackgroundVideo videos={config.videos} intervalMs={config.videoIntervalMs} minimumPlaybackBeforeTransitionMs={config.minimumPlaybackBeforeTransitionMs} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,.1)_10%,rgba(255,255,255,.7)_100%),linear-gradient(to_top,rgba(255,255,255,.96),rgba(255,255,255,.28)_58%)]" aria-hidden="true" />

      <motion.section animate={{ opacity: isStarting ? 0 : 1, scale: isStarting && !reducedMotion ? .985 : 1 }} transition={{ duration: reducedMotion ? .1 : .45 }}
        className="relative z-10 mx-auto flex min-h-[100dvh] max-w-5xl flex-col items-center justify-center px-6 py-12 text-center sm:px-10">
        <motion.div {...enter(0)} className="mb-7">
          <MorrowLogo variant="full" priority className="h-auto w-[clamp(15rem,42vw,24rem)]" />
        </motion.div>
        <motion.p {...enter(.08)} className="mb-3 text-[11px] font-bold uppercase tracking-[.45em] text-[#C41E19] sm:text-xs">Restaurant kiosk</motion.p>
        <motion.p {...enter(.25)} className="mt-5 text-[clamp(1.15rem,2.8vw,1.8rem)] font-semibold tracking-wide text-white">{config.slogan}</motion.p>
        <motion.p {...enter(.32)} className="mt-3 text-base text-white/80 sm:text-lg">{config.description}</motion.p>
        <motion.button {...enter(.4)}
          type="button" aria-label="Start order" disabled={isStarting} onClick={event => { event.stopPropagation(); handleStart(); }}
          className="group mt-10 flex min-h-20 w-full max-w-[430px] items-center justify-center gap-4 rounded-2xl bg-[#C41E19] px-8 text-lg font-bold tracking-[.08em] text-white shadow-[0_12px_28px_rgba(196,30,25,.2)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#A8161A] hover:shadow-[0_16px_32px_rgba(196,30,25,.24)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C41E19]/15 active:translate-y-0 active:scale-[.98] disabled:pointer-events-none sm:min-h-24 sm:text-xl">
          {config.buttonLabel}<ArrowRight className="transition-transform group-hover:translate-x-1" />
        </motion.button>
        <motion.div {...enter(.52)} className="mt-8 flex items-center gap-3 text-sm font-medium tracking-wide text-white/70">
          <Hand size={18} /> {config.touchLabel}
        </motion.div>
      </motion.section>
    </main>
  );
}
