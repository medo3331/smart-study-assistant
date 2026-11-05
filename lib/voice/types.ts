// lib/voice/types.ts
//
// Provider abstraction for Text-to-Speech.
// Phase 2: ElevenLabs primary, Browser (Web Speech) fallback.

export interface VoiceProvider {
  /** Human-readable name for logging. */
  name: string;
  /** Whether this provider can be used right now (key present, browser support, etc.). */
  isAvailable(): boolean;
  /** Synthesize speech. Returns an audio Blob (mp3/wav) or throws on failure. */
  speak(text: string): Promise<Blob>;
}

export interface VoiceSpeakResult {
  /** Where the audio came from. */
  source: "server" | "browser";
  /** Audio blob if server; null if browser (browser speaks directly). */
  blob: Blob | null;
}
