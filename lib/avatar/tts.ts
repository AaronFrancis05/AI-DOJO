// lib/tts.ts
import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const AUDIO_DIR = path.join(process.cwd(), "public", "audio");

let CommunicateClass: typeof import("edge-tts-universal").Communicate | undefined;

async function loadCommunicateClass() {
  if (!CommunicateClass) {
    if (typeof process !== "undefined" && process.env) {
      process.env.WS_NO_BUFFER_UTIL = "1";
    }
    const module = await import("edge-tts-universal");
    CommunicateClass = module.Communicate;
  }
  return CommunicateClass;
}

export const EN_VOICE = "en-US-JennyNeural";
export const JA_VOICE = "ja-JP-NanamiNeural";

const VOICE_MAP: Record<string, string> = {
  en: EN_VOICE, "en-US": EN_VOICE, "en-US-Jenny": EN_VOICE,
  ja: JA_VOICE, "ja-JP": JA_VOICE, "ja-JP-Nanami": JA_VOICE,
};

export function resolveVoice(name?: string | null, useJapanese = false): string {
  if (name && VOICE_MAP[name]) return VOICE_MAP[name];
  if (name && name.endsWith("Neural")) return name;
  return useJapanese ? JA_VOICE : EN_VOICE;
}

// ── Viseme constants (ported verbatim from backend.py) ──────────────────
const VOWEL_VISEMES: Record<string, string> = { a: "aa", e: "ee", i: "ih", o: "oh", u: "ou" };
const CONSONANT_VISEMES: Record<string, string> = {
  m: "ou", p: "ou", b: "ou", w: "ou",
  f: "ih", v: "ih", s: "ih", z: "ih", c: "ih",
  h: "aa", k: "aa", g: "aa",
  r: "oh", l: "oh",
  t: "ee", d: "ee", n: "ee",
};
const VISEME_LEAD_MS = 70;
const DEFAULT_WORD_DURATION_MS = 220;
const MAX_VISEMES_PER_WORD = 3;

function normalizeWord(word: string): string {
  return word.toLowerCase().trim().replace(/^[.,!?;:"'()[\]{}]+|[.,!?;:"'()[\]{}]+$/g, "");
}

function wordToVisemeSequence(word: string): string[] {
  if (!word) return ["sil"];
  const w = normalizeWord(word);
  const sequence: string[] = [];
  for (const ch of w) {
    const vis = VOWEL_VISEMES[ch];
    if (vis && sequence[sequence.length - 1] !== vis) sequence.push(vis);
  }
  if (sequence.length === 0 && w) {
    const first = CONSONANT_VISEMES[w[0]];
    if (first) sequence.push(first);
  }
  if (sequence.length === 0) sequence.push("aa");
  return sequence.slice(0, MAX_VISEMES_PER_WORD);
}

type VisemeEvent = { t: number; v: string };

async function generateTtsWithVisemes(text: string, voice: string, outputPath: string): Promise<VisemeEvent[]> {
  const Communicate = await loadCommunicateClass();
  const communicate = new Communicate(text, { voice });
  const events: { t: number; text: string }[] = [];
  const chunks: Buffer[] = [];

  for await (const chunk of communicate.stream()) {
    if (chunk.type === "audio") {
      chunks.push(Buffer.from(chunk.data));
    } else if (chunk.type === "WordBoundary") {
      // NOTE: verify this package reports offset in the same 100-ns ticks
      // as Python's edge-tts — if visemes drift, log a raw offset value
      // and re-check the divisor here (Python divides by 10_000 for ms).
      const tMs = Math.floor(chunk.offset / 10_000);
      events.push({ t: tMs, text: chunk.text ?? "" });
    }
  }

  const timeline: VisemeEvent[] = [];
  events.forEach((event, index) => {
    const start = Math.max(0, event.t - VISEME_LEAD_MS);
    const end = index + 1 < events.length ? events[index + 1].t : event.t + DEFAULT_WORD_DURATION_MS;
    const duration = Math.max(80, end - event.t);
    const visemes = wordToVisemeSequence(event.text);

    if (visemes.length === 1) {
      timeline.push({ t: start, v: visemes[0] });
    } else {
      const step = Math.floor(duration / visemes.length);
      visemes.forEach((vis, idx) => timeline.push({ t: start + idx * step, v: vis }));
    }
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.concat(chunks));

  if (timeline.length) {
    timeline.push({ t: timeline[timeline.length - 1].t + 300, v: "sil" });
  }
  return timeline;
}

export function nextAudioName(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}.mp3`;
}

// Mirrors safe_tts(): returns generated=false rather than trusting file
// existence, since filenames aren't unique across process restarts.
export async function safeTts(text: string, voice: string, outputPath: string): Promise<{ visemes: VisemeEvent[]; generated: boolean }> {
  const clean = (text ?? "").trim();
  if (!clean || ["...", "…", "."].includes(clean)) {
    return { visemes: [], generated: false };
  }
  try {
    const visemes = await generateTtsWithVisemes(clean, voice, outputPath);
    const { stat } = await import("fs/promises");
    const info = await stat(outputPath).catch(() => null);
    if (!info || info.size === 0) {
      console.warn(`TTS produced no audio file at ${outputPath}`);
      return { visemes: [], generated: false };
    }
    return { visemes, generated: true };
  } catch (e) {
    console.warn(`TTS failed (${voice}):`, e);
    return { visemes: [], generated: false };
  }
}

export function audioOutputPath(filename: string): string {
  return path.join(AUDIO_DIR, filename);
}