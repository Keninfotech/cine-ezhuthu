/**
 * Handwriting recognition engines, tried in order:
 *
 *  1. On-device: the W3C Handwriting Recognition API (navigator.createHandwritingRecognizer),
 *     shipped in Chromium on ChromeOS/Android. Nothing leaves the device.
 *  2. Online: Google's handwriting service (the same engine family as ML Kit Digital Ink,
 *     which the native iPad/Android build uses fully offline). Only the ink coordinates are sent —
 *     never the script — and only when the writer has switched it on.
 *
 * All engines speak the same interface, so the native ML Kit bridge can be dropped in later.
 */
import type { Lang, Stroke } from './types';

export interface Recognition {
  candidates: string[];
  engine: string;
}

export interface Recognizer {
  name: string;
  onDevice: boolean;
  recognize(strokes: Stroke[], lang: Lang, area: { width: number; height: number }): Promise<Recognition>;
}

const BCP47: Record<Lang, string> = { ml: 'ml', ta: 'ta', en: 'en' };

// ---------- 1. W3C Handwriting Recognition API ----------

interface HWRecognizer {
  startDrawing(hints?: object): {
    addStroke(s: unknown): void;
    getPrediction(): Promise<{ text: string }[]>;
    clear(): void;
  };
  finish(): void;
}
type HWNavigator = Navigator & {
  createHandwritingRecognizer?: (c: { languages: string[] }) => Promise<HWRecognizer>;
  queryHandwritingRecognizer?: (c: { languages: string[] }) => Promise<unknown>;
};
declare const HandwritingStroke: { new (): { addPoint(p: { x: number; y: number; t: number }): void } };

export async function nativeSupport(lang: Lang): Promise<boolean> {
  const nav = navigator as HWNavigator;
  if (!nav.queryHandwritingRecognizer) return false;
  try {
    return !!(await nav.queryHandwritingRecognizer({ languages: [BCP47[lang]] }));
  } catch {
    return false;
  }
}

export const nativeRecognizer: Recognizer = {
  name: 'On-device (browser)',
  onDevice: true,
  async recognize(strokes, lang) {
    const nav = navigator as HWNavigator;
    const rec = await nav.createHandwritingRecognizer!({ languages: [BCP47[lang]] });
    const drawing = rec.startDrawing({ recognitionType: 'text', inputType: 'stylus', alternatives: 5 });
    for (const s of strokes) {
      const hs = new HandwritingStroke();
      const t0 = s.points[0]?.[2] ?? 0;
      for (const [x, y, t] of s.points) hs.addPoint({ x, y, t: t - t0 });
      drawing.addStroke(hs);
    }
    const preds = await drawing.getPrediction();
    rec.finish();
    return { candidates: preds.map((p) => p.text), engine: this.name };
  },
};

// ---------- 2. Google handwriting service ----------

const ENDPOINT = 'https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8';

export const onlineRecognizer: Recognizer = {
  name: 'Google handwriting (online)',
  onDevice: false,
  async recognize(strokes, lang, area) {
    const t0 = strokes[0]?.points[0]?.[2] ?? 0;
    const ink = strokes.map((s) => [
      s.points.map((p) => Math.round(p[0])),
      s.points.map((p) => Math.round(p[1])),
      s.points.map((p) => Math.round(p[2] - t0)),
    ]);
    const body = {
      options: 'enable_pre_space',
      requests: [{ writing_guide: { writing_area_width: Math.round(area.width), writing_area_height: Math.round(area.height) }, ink, language: BCP47[lang], max_num_results: 8, max_completions: 0 }],
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
      if (!res.ok) throw new Error(`Recognition service returned ${res.status}`);
      const json = await res.json();
      if (json[0] !== 'SUCCESS') throw new Error('Recognition failed');
      return { candidates: (json[1]?.[0]?.[1] ?? []) as string[], engine: this.name };
    } finally {
      clearTimeout(timer);
    }
  },
};

export class RecognitionUnavailable extends Error {}

/** Pick the best available engine for a language. */
export async function pickRecognizer(lang: Lang, allowOnline: boolean): Promise<Recognizer> {
  if (await nativeSupport(lang)) return nativeRecognizer;
  if (allowOnline) return onlineRecognizer;
  throw new RecognitionUnavailable(
    'This browser has no on-device recognizer for this language. Turn on online recognition in Settings, or install the native app (ML Kit, fully offline).',
  );
}
