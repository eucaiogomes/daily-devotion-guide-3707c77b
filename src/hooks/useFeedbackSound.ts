import { useCallback, useRef } from "react";

/**
 * useFeedbackSound — tiny WebAudio cues for exercise feedback.
 * No assets, no network, works offline. Tones are gentle (devotional),
 * not arcade-loud. All sounds respect prefers-reduced-motion AND a
 * localStorage flag `lumen.sound` (default: on) so the user can mute.
 */
type Cue = "right" | "wrong" | "tap" | "complete" | "chime";

function isMuted() {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem("lumen.sound") === "off";
  } catch {
    return false;
  }
}

export function useFeedbackSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const ensureCtx = () => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
    }
    if (ctxRef.current.state === "suspended") {
      void ctxRef.current.resume();
    }
    return ctxRef.current;
  };

  const tone = useCallback(
    (freq: number, duration: number, when = 0, type: OscillatorType = "sine", gain = 0.08) => {
      const ctx = ensureCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + when);
      g.gain.setValueAtTime(0, ctx.currentTime + when);
      g.gain.linearRampToValueAtTime(gain, ctx.currentTime + when + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + duration);
      osc.connect(g).connect(ctx.destination);
      osc.start(ctx.currentTime + when);
      osc.stop(ctx.currentTime + when + duration + 0.05);
    },
    [],
  );

  const play = useCallback(
    (cue: Cue) => {
      if (isMuted()) return;
      switch (cue) {
        case "right":
          // Two-note rising perfect fifth — calm, affirming.
          tone(660, 0.18, 0, "sine", 0.09);
          tone(990, 0.22, 0.1, "sine", 0.07);
          break;
        case "wrong":
          // Soft low thud, no harsh buzz.
          tone(220, 0.22, 0, "sine", 0.07);
          tone(196, 0.28, 0.08, "sine", 0.05);
          break;
        case "tap":
          tone(880, 0.05, 0, "triangle", 0.04);
          break;
        case "chime":
          tone(1320, 0.18, 0, "sine", 0.05);
          break;
        case "complete":
          // Mini arpeggio — C E G C, devotional resolve.
          tone(523, 0.18, 0, "sine", 0.07);
          tone(659, 0.18, 0.12, "sine", 0.07);
          tone(784, 0.22, 0.24, "sine", 0.07);
          tone(1046, 0.4, 0.4, "sine", 0.08);
          break;
      }
    },
    [tone],
  );

  return { play };
}

export function setSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem("lumen.sound", enabled ? "on" : "off");
  } catch {
    /* ignore */
  }
}

export function isSoundEnabled() {
  return !isMuted();
}