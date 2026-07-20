import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface BackgroundVideoProps {
  videos: readonly string[];
  intervalMs?: number;
  transitionDurationMs?: number;
  minimumPlaybackBeforeTransitionMs?: number;
  className?: string;
}

type Layer = 0 | 1;

const otherLayer = (layer: Layer): Layer => layer === 0 ? 1 : 0;

export default function BackgroundVideo({
  videos,
  intervalMs = 9000,
  transitionDurationMs = 1200,
  minimumPlaybackBeforeTransitionMs = 4000,
  className = "",
}: BackgroundVideoProps) {
  const sources = useMemo(() => [...new Set(videos.filter(Boolean))], [videos]);
  const video0Ref = useRef<HTMLVideoElement>(null);
  const video1Ref = useRef<HTMLVideoElement>(null);
  const videoRefs = useRef([video0Ref, video1Ref] as const);
  const [layerSources, setLayerSources] = useState<[string, string]>([sources[0] ?? "", sources[1] ?? ""]);
  const [activeLayer, setActiveLayer] = useState<Layer>(0);
  const [hasVisibleVideo, setHasVisibleVideo] = useState(false);
  const activeLayerRef = useRef<Layer>(0);
  const activeIndexRef = useRef(0);
  const layerSourcesRef = useRef<[string, string]>(layerSources);
  const readyRef = useRef<[boolean, boolean]>([false, false]);
  const failedRef = useRef(new Set<string>());
  const isTransitioningRef = useRef(false);
  const transitionRequestedRef = useRef(false);
  const rotationTimerRef = useRef<number>();
  const transitionTimerRef = useRef<number>();
  const mountedRef = useRef(true);

  const debug = useCallback((message: string, details?: object) => {
    if (import.meta.env.DEV) console.debug(`[IdleVideo] ${message}`, details ?? "");
  }, []);

  const getNextIndex = useCallback((afterIndex: number) => {
    for (let offset = 1; offset <= sources.length; offset += 1) {
      const index = (afterIndex + offset) % sources.length;
      if (!failedRef.current.has(sources[index])) return index;
    }
    return -1;
  }, [sources]);

  const assignSource = useCallback((layer: Layer, source: string) => {
    readyRef.current[layer] = false;
    layerSourcesRef.current = layer === 0
      ? [source, layerSourcesRef.current[1]]
      : [layerSourcesRef.current[0], source];
    setLayerSources([...layerSourcesRef.current]);
    window.requestAnimationFrame(() => {
      const video = videoRefs.current[layer].current;
      if (!video || !mountedRef.current) return;
      video.muted = true;
      video.defaultMuted = true;
      video.load();
    });
  }, []);

  const scheduleRotation = useCallback((requestTransition: () => void) => {
    if (rotationTimerRef.current) window.clearTimeout(rotationTimerRef.current);
    rotationTimerRef.current = window.setTimeout(requestTransition, Math.max(intervalMs, minimumPlaybackBeforeTransitionMs));
  }, [intervalMs, minimumPlaybackBeforeTransitionMs]);

  const beginTransitionRef = useRef<() => void>(() => undefined);
  const beginTransition = useCallback(async () => {
    if (isTransitioningRef.current || document.hidden) return;
    const fromLayer = activeLayerRef.current;
    const toLayer = otherLayer(fromLayer);
    const nextVideo = videoRefs.current[toLayer].current;
    if (!nextVideo || !readyRef.current[toLayer]) {
      transitionRequestedRef.current = true;
      debug("transition waiting for preload", { nextLayer: toLayer, readyState: nextVideo?.readyState ?? 0 });
      return;
    }

    isTransitioningRef.current = true;
    transitionRequestedRef.current = false;
    if (rotationTimerRef.current) window.clearTimeout(rotationTimerRef.current);
    nextVideo.muted = true;
    nextVideo.defaultMuted = true;
    try {
      await nextVideo.play();
    } catch (error) {
      debug("playback error", { source: layerSourcesRef.current[toLayer], error });
      isTransitioningRef.current = false;
      failedRef.current.add(layerSourcesRef.current[toLayer]);
      const replacementIndex = getNextIndex(activeIndexRef.current);
      if (replacementIndex >= 0 && sources[replacementIndex] !== layerSourcesRef.current[fromLayer]) {
        assignSource(toLayer, sources[replacementIndex]);
      }
      return;
    }
    if (!mountedRef.current) return;

    debug("transition start", { activeIndex: activeIndexRef.current, nextIndex: sources.indexOf(layerSourcesRef.current[toLayer]), readyState: nextVideo.readyState });
    setHasVisibleVideo(true);
    setActiveLayer(toLayer);
    transitionTimerRef.current = window.setTimeout(() => {
      if (!mountedRef.current) return;
      const oldVideo = videoRefs.current[fromLayer].current;
      oldVideo?.pause();
      if (oldVideo) oldVideo.currentTime = 0;
      activeLayerRef.current = toLayer;
      activeIndexRef.current = Math.max(0, sources.indexOf(layerSourcesRef.current[toLayer]));
      isTransitioningRef.current = false;
      debug("transition complete", { activeIndex: activeIndexRef.current });

      const followingIndex = getNextIndex(activeIndexRef.current);
      if (followingIndex >= 0 && sources[followingIndex] !== layerSourcesRef.current[toLayer]) {
        assignSource(fromLayer, sources[followingIndex]);
      }
      scheduleRotation(() => beginTransitionRef.current());
    }, transitionDurationMs);
  }, [assignSource, debug, getNextIndex, scheduleRotation, sources, transitionDurationMs]);

  useEffect(() => { beginTransitionRef.current = () => { void beginTransition(); }; }, [beginTransition]);

  const handleCanPlay = (layer: Layer) => {
    readyRef.current[layer] = true;
    const video = videoRefs.current[layer].current;
    debug("video ready", { layer, readyState: video?.readyState ?? 0, source: layerSourcesRef.current[layer] });
    if (layer === activeLayerRef.current && !hasVisibleVideo && video) {
      video.muted = true;
      video.defaultMuted = true;
      void video.play().then(() => {
        if (!mountedRef.current) return;
        setHasVisibleVideo(true);
        scheduleRotation(() => beginTransitionRef.current());
      }).catch(error => handleError(layer, error));
    } else if (transitionRequestedRef.current && layer === otherLayer(activeLayerRef.current)) {
      void beginTransition();
    }
  };

  const handleError = (layer: Layer, error?: unknown) => {
    const failedSource = layerSourcesRef.current[layer];
    if (!failedSource) return;
    failedRef.current.add(failedSource);
    readyRef.current[layer] = false;
    debug("playback error", { layer, source: failedSource, error });
    const replacementIndex = getNextIndex(activeIndexRef.current);
    if (replacementIndex < 0) { if (layer === activeLayerRef.current) setHasVisibleVideo(false); return; }
    if (layer === activeLayerRef.current) {
      const hiddenLayer = otherLayer(layer);
      if (readyRef.current[hiddenLayer]) void beginTransition();
      else if (sources[replacementIndex] !== layerSourcesRef.current[hiddenLayer]) assignSource(hiddenLayer, sources[replacementIndex]);
    } else if (sources[replacementIndex] !== layerSourcesRef.current[activeLayerRef.current]) {
      assignSource(layer, sources[replacementIndex]);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const onVisibilityChange = () => {
      if (document.hidden) {
        videoRefs.current.forEach(ref => ref.current?.pause());
        if (rotationTimerRef.current) window.clearTimeout(rotationTimerRef.current);
      } else {
        const activeVideo = videoRefs.current[activeLayerRef.current].current;
        if (activeVideo && readyRef.current[activeLayerRef.current]) {
          activeVideo.muted = true;
          activeVideo.defaultMuted = true;
          void activeVideo.play().then(() => scheduleRotation(() => beginTransitionRef.current())).catch(error => handleError(activeLayerRef.current, error));
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      mountedRef.current = false;
      if (rotationTimerRef.current) window.clearTimeout(rotationTimerRef.current);
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      videoRefs.current.forEach(ref => ref.current?.pause());
    };
  }, [scheduleRotation]);

  const layerStyle = { transitionDuration: `${transitionDurationMs}ms`, willChange: "opacity", transform: "translateZ(0)", backfaceVisibility: "hidden" as const };
  return (
    <div className={`absolute inset-0 overflow-hidden bg-black ${className}`} aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(215,255,122,.18),transparent_34%),radial-gradient(circle_at_80%_75%,rgba(126,85,45,.25),transparent_38%),linear-gradient(135deg,#12190f,#080b08_68%,#17200f)]" />
      <video ref={video0Ref} src={layerSources[0]} className={`absolute inset-0 size-full object-cover transition-opacity ease-in-out ${hasVisibleVideo && activeLayer === 0 ? "opacity-100" : "opacity-0"}`} style={layerStyle}
        autoPlay muted playsInline controls={false} disablePictureInPicture preload="auto" onCanPlay={() => handleCanPlay(0)} onCanPlayThrough={() => handleCanPlay(0)} onEnded={() => { if (!isTransitioningRef.current) void beginTransition(); }} onError={event => handleError(0, event)} onContextMenu={event => event.preventDefault()} />
      <video ref={video1Ref} src={layerSources[1]} className={`absolute inset-0 size-full object-cover transition-opacity ease-in-out ${hasVisibleVideo && activeLayer === 1 ? "opacity-100" : "opacity-0"}`} style={layerStyle}
        muted playsInline controls={false} disablePictureInPicture preload="auto" onCanPlay={() => handleCanPlay(1)} onCanPlayThrough={() => handleCanPlay(1)} onEnded={() => { if (!isTransitioningRef.current && activeLayerRef.current === 1) void beginTransition(); }} onError={event => handleError(1, event)} onContextMenu={event => event.preventDefault()} />
    </div>
  );
}
