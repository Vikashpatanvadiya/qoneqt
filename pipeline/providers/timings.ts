import type { WordTiming } from "../../shared/types";

export type TimingsInput = { text: string; audioFile: string; durationSec: number; boundaries: WordTiming[] };

// Returns null when this provider cannot produce timings, so the next one in the chain is tried.
export interface TimingsProvider {
  name: string;
  align(input: TimingsInput): Promise<WordTiming[] | null>;
}

// Word boundaries reported by the TTS engine itself.
const ttsBoundaries: TimingsProvider = {
  name: "edge-tts",
  async align({ boundaries }) {
    return boundaries.length > 0 ? boundaries : null;
  },
};

// Last resort that needs no API: spread the words over the audio, weighted by word length.
const evenSplit: TimingsProvider = {
  name: "even-split",
  async align({ text, durationSec }) {
    const tokens = text.split(/\s+/).filter(Boolean);
    const total = tokens.reduce((n, w) => n + w.length + 1, 0);
    let t = 0;
    return tokens.map((word) => {
      const d = ((word.length + 1) / total) * durationSec;
      const timing = { word, startSec: t, endSec: t + d };
      t += d;
      return timing;
    });
  },
};

// A faster-whisper provider slots in between these two when a voice returns no boundaries.
const chain: TimingsProvider[] = [ttsBoundaries, evenSplit];

export async function resolveTimings(input: TimingsInput): Promise<{ words: WordTiming[]; source: string }> {
  for (const provider of chain) {
    const words = await provider.align(input).catch(() => null);
    if (words && words.length > 0) return { words, source: provider.name };
  }
  return { words: [], source: "none" };
}
