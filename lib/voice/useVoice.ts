"use client";

import { useCallback, useRef, useState } from "react";

export interface UseVoiceOptions {
  /** Called when server TTS fails and we fall back to browser. */
  onFallback?: () => void;
}

export interface UseVoiceResult {
  supported: boolean;
  speaking: boolean;
  paused: boolean;
  speak: (text: string, rate?: number) => Promise<void>;
  stop: () => void;
  toggle: () => void;
}

/**
 * Phase 2 voice hook:
 *  1. Try server TTS (/api/voice/speak) → play returned audio.
 *  2. On failure (503/502/network) → fall back to browser speechSynthesis.
 *  3. Never lose the chat answer; audio is best-effort.
 */
export function useVoice(_opts: UseVoiceOptions = {}): UseVoiceResult {
  const [supported] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const browserUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    browserUtteranceRef.current = null;
    setSpeaking(false);
    setPaused(false);
  }, []);

  const speakBrowser = useCallback((text: string, rate: number) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ar-EG";
    u.rate = rate;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    browserUtteranceRef.current = u;
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }, []);

  const speak = useCallback(
    async (text: string, rate = 1) => {
      stop();
      setSpeaking(true);
      try {
        const res = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error("server-tts-failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          setSpeaking(false);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          // fallback
          speakBrowser(text, rate);
        };
        await audio.play();
      } catch {
        // fallback to browser
        _opts.onFallback?.();
        speakBrowser(text, rate);
      }
    },
    [stop, speakBrowser, _opts]
  );

  const toggle = useCallback(() => {
    if (audioRef.current) {
      if (paused) {
        audioRef.current.play();
        setPaused(false);
      } else {
        audioRef.current.pause();
        setPaused(true);
      }
      return;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      if (paused) {
        window.speechSynthesis.resume();
        setPaused(false);
      } else {
        window.speechSynthesis.pause();
        setPaused(true);
      }
    }
  }, [paused]);

  return { supported, speaking, paused, speak, stop, toggle };
}
