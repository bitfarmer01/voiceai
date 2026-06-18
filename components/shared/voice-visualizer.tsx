"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type VoiceVisualizerProps = {
  /**
   * "demo" runs a synthetic two-speaker conversation (turn-taking + prosody) for
   * the marketing hero. "live" is driven by real call audio via `level`/`speaking`.
   */
  mode?: "demo" | "live";
  /** Number of bars (a few-bar equalizer, not a dense waveform). */
  bars?: number;
  /** live: current loudness 0..1 (e.g. VAPI volume-level). */
  level?: number;
  /** live: true when the agent is speaking (amber), false for the caller. */
  speaking?: boolean;
  /** live: whether a call is in progress; when false the bars rest. */
  active?: boolean;
  className?: string;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const ri = (a: number, b: number) => a + ((Math.random() * (b - a + 1)) | 0);

/**
 * Few-bar voice visualizer that reads like a real call. The center bars carry the
 * loud low-mid energy (center-weighted gain); demo mode models speech timing
 * (syllables -> words -> phrases -> pauses) with two-speaker turn-taking and
 * per-phrase declination so it never looks like a looping animation.
 *
 * transform-only animation, rAF with cleanup, paused off-screen + when tab hidden,
 * static under prefers-reduced-motion.
 */
export function VoiceVisualizer({
  mode = "demo",
  bars = 5,
  level = 0,
  speaking = false,
  active = false,
  className,
}: VoiceVisualizerProps) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const barEls = React.useRef<(HTMLSpanElement | null)[]>([]);
  const [agent, setAgent] = React.useState(true); // who's speaking -> bar color

  // latest live props AND mode, read by the rAF loop without re-subscribing.
  // Written in an effect (not during render) so the loop sees fresh values without
  // an illegal ref-mutation-during-render; the modeRef lets the loop read the
  // current mode without tearing down and rebuilding on a demo->live switch.
  const liveRef = React.useRef({ level, speaking, active });
  const modeRef = React.useRef(mode);
  React.useEffect(() => {
    liveRef.current = { level, speaking, active };
    modeRef.current = mode;
  });

  React.useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const n = bars;
    const els = barEls.current;
    const heights = new Float32Array(n).fill(0.12);
    const rNorm: number[] = [];
    const gain: number[] = [];
    const specW: number[] = [];
    const c = (n - 1) / 2;
    for (let i = 0; i < n; i++) {
      rNorm[i] = c ? Math.abs(i - c) / c : 0; // 0 center .. 1 edges
      gain[i] = 0.5 + 0.5 * (1 - rNorm[i]); // center bars react harder
      specW[i] = rand(0.55, 1);
    }

    const setBar = (i: number, h: number) => {
      const el = els[i];
      if (el) el.style.transform = `scaleY(${h.toFixed(3)})`;
    };

    if (reduce) {
      for (let i = 0; i < n; i++) setBar(i, 0.9 - 0.5 * rNorm[i]);
      return;
    }

    // ----- demo conversation state -----
    let env = 0.04;
    let envTarget = 0.04;
    let evTimer = 0;
    let dmode: "syl" | "wgap" | "bgap" | "pgap" | "handoff" = "handoff";
    let spk: "A" | "B" = "B";
    let turnPhrasesLeft = 0;
    let phraseWords = 0;
    let phraseWordIdx = 0;
    let wordSyls = 0;
    let wordSylIdx = 0;
    let stressIdx = 0;

    const startSyllable = () => {
      const pos = wordSylIdx;
      dmode = "syl";
      const decl = 1 - 0.42 * ((phraseWordIdx - 1) / Math.max(1, phraseWords - 1));
      const stress = pos === stressIdx ? 1 : rand(0.5, 0.68);
      const base = spk === "A" ? rand(0.82, 1) : rand(0.7, 0.95);
      envTarget = Math.min(1, base * decl * stress);
      evTimer = rand(115, 225) * (pos === stressIdx ? 1.15 : 0.92);
      for (let i = 0; i < n; i++) specW[i] = rand(0.5, 1);
      wordSylIdx++;
    };
    const startWord = () => {
      wordSyls = ri(1, 4);
      wordSylIdx = 0;
      stressIdx = (Math.random() * wordSyls) | 0;
      phraseWordIdx++;
      startSyllable();
    };
    const startPhrase = () => {
      phraseWords = ri(2, 6);
      phraseWordIdx = 0;
      startWord();
    };
    const startTurn = () => {
      spk = spk === "A" ? "B" : "A";
      turnPhrasesLeft = spk === "A" ? ri(1, 3) : ri(1, 2);
      setAgent(spk === "A");
      startPhrase();
    };
    const endSyllable = () => {
      if (wordSylIdx < wordSyls) { dmode = "wgap"; envTarget = 0.24; evTimer = rand(40, 90); return; }
      if (phraseWordIdx < phraseWords) { dmode = "bgap"; envTarget = 0.12; evTimer = rand(85, 175); return; }
      turnPhrasesLeft--;
      if (turnPhrasesLeft > 0) { dmode = "pgap"; envTarget = 0.05; evTimer = rand(330, 660); return; }
      dmode = "handoff"; envTarget = 0.02; evTimer = rand(520, 920);
    };
    const nextEvent = () => {
      switch (dmode) {
        case "syl": endSyllable(); break;
        case "wgap": startSyllable(); break;
        case "bgap": startWord(); break;
        case "pgap": startPhrase(); break;
        case "handoff": startTurn(); break;
      }
    };
    if (mode === "demo") startTurn();

    let raf = 0;
    let last = performance.now();
    let visible = true;

    const frame = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const currentMode = modeRef.current;

      if (currentMode === "demo") {
        evTimer -= dt;
        if (evTimer <= 0) nextEvent();
        env += (envTarget - env) * (envTarget > env ? 0.45 : 0.2);
      } else {
        const l = liveRef.current;
        const tgt = l.active ? Math.min(1, Math.max(0, l.level)) : 0.02;
        env += (tgt - env) * (tgt > env ? 0.5 : 0.16);
      }

      for (let i = 0; i < n; i++) {
        const target = Math.max(0.1, Math.min(1, env * gain[i] * (0.55 + 0.45 * specW[i])));
        heights[i] += (target - heights[i]) * (currentMode === "demo" ? 0.35 : 0.3);
        setBar(i, heights[i]);
      }
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    // Set bars to their initial rest positions before the loop begins.
    for (let i = 0; i < n; i++) setBar(i, heights[i]);

    // Gate start() on IntersectionObserver: the loop only begins once the element
    // is confirmed in-view. This prevents a few stray rAF frames on off-screen mounts.
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        if (visible && !document.hidden) start();
        else stop();
      },
      { threshold: 0.05 },
    );
    if (wrapRef.current) io.observe(wrapRef.current);

    const onVis = () => {
      if (document.hidden) stop();
      else if (visible) start();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars]);
  // `mode` is intentionally excluded: it is read via modeRef inside the rAF loop,
  // so a demo→live switch no longer tears down and rebuilds the animation loop.

  // live mode: flip bar color with the real speaker without restarting the loop
  React.useEffect(() => {
    if (mode === "live") setAgent(speaking);
  }, [mode, speaking]);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className={cn("flex h-full items-center justify-center gap-3.5", className)}
      // agent speaks in amber; the caller inherits the surrounding text color
      style={agent ? { color: "var(--color-primary)" } : undefined}
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          ref={(el) => { barEls.current[i] = el; }}
          className="w-3.5 rounded-full bg-current"
          style={{ height: "74%", transformOrigin: "center" }}
        />
      ))}
    </div>
  );
}
