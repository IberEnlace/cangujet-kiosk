import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Hand } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import BackgroundVideo from "../components/idle/BackgroundVideo";
import MorrowLogo from "../components/branding/MorrowLogo";
import { idleScreenConfig as config } from "../config/idleScreenConfig";

export default function IdleScreen({ onStart }: { onStart: () => void }) {
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
    <main className="relative isolate min-h-[100dvh] w-full cursor-pointer overflow-hidden bg-[#0b1009] font-['DM_Sans'] text-white selection:bg-transparent" onClick={handleStart}>
      <BackgroundVideo videos={config.videos} intervalMs={config.videoIntervalMs} minimumPlaybackBeforeTransitionMs={config.minimumPlaybackBeforeTransitionMs} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,.48)_100%),linear-gradient(to_top,rgba(5,8,4,.92),transparent_58%)]" aria-hidden="true" />

      <motion.section animate={{ opacity: isStarting ? 0 : 1, scale: isStarting && !reducedMotion ? .985 : 1 }} transition={{ duration: reducedMotion ? .1 : .45 }}
        className="relative z-10 mx-auto flex min-h-[100dvh] max-w-5xl flex-col items-center justify-center px-6 py-12 text-center sm:px-10">
        <motion.div {...enter(0)} className="mb-7">
          <MorrowLogo variant="full" priority className="h-auto w-[clamp(15rem,42vw,24rem)]" />
        </motion.div>
        <motion.p {...enter(.08)} className="mb-3 font-['Space_Mono'] text-[11px] font-bold uppercase tracking-[.45em] text-[#d7ff7a] sm:text-xs">Restaurant kiosk</motion.p>
        <motion.p {...enter(.25)} className="mt-5 text-[clamp(1.15rem,2.8vw,1.8rem)] font-medium tracking-wide text-white/90">{config.slogan}</motion.p>
        <motion.p {...enter(.32)} className="mt-3 text-base text-white/55 sm:text-lg">{config.description}</motion.p>
        <motion.button {...enter(.4)} animate={reducedMotion ? undefined : { scale: [1, 1.025, 1] }} transition={reducedMotion ? undefined : { duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
          type="button" aria-label="Start order" disabled={isStarting} onClick={event => { event.stopPropagation(); handleStart(); }}
          className="group mt-10 flex min-h-20 w-full max-w-[430px] items-center justify-center gap-4 rounded-3xl bg-[#d7ff7a] px-8 text-lg font-extrabold tracking-[.12em] text-[#17200f] shadow-[0_22px_70px_rgba(215,255,122,.22)] transition hover:bg-[#e2ff9d] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white active:scale-[.98] disabled:pointer-events-none sm:min-h-24 sm:text-xl">
          {config.buttonLabel}<ArrowRight className="transition-transform group-hover:translate-x-1" />
        </motion.button>
        <motion.div {...enter(.52)} className="mt-8 flex items-center gap-3 text-sm font-medium tracking-wide text-white/55">
          <Hand size={18} /> {config.touchLabel}
        </motion.div>
      </motion.section>
    </main>
  );
}
