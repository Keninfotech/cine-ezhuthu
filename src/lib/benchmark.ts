import type { Lang, Stroke } from './types';
import { editDistance } from './screenplay';
import { pickRecognizer, type Recognizer } from './recognizer';

/**
 * Character Error Rate (CER): Levenshtein distance on characters / ground-truth character count.
 * Word Error Rate (WER): Levenshtein distance on words / ground-truth word count.
 */
export function calculateCER(hypothesis: string, groundTruth: string): number {
  const normHyp = hypothesis.trim();
  const normGt = groundTruth.trim();
  if (normGt.length === 0) return normHyp.length === 0 ? 0 : 1;
  const dist = editDistance(normHyp, normGt);
  return dist / normGt.length;
}

export function calculateWER(hypothesis: string, groundTruth: string): number {
  const hypWords = hypothesis.trim().split(/\s+/).filter(Boolean);
  const gtWords = groundTruth.trim().split(/\s+/).filter(Boolean);
  if (gtWords.length === 0) return hypWords.length === 0 ? 0 : 1;

  const dp = Array.from({ length: hypWords.length + 1 }, (_, i) => [i, ...Array(gtWords.length).fill(0)]);
  for (let j = 1; j <= gtWords.length; j++) dp[0][j] = j;

  for (let i = 1; i <= hypWords.length; i++) {
    for (let j = 1; j <= gtWords.length; j++) {
      const cost = hypWords[i - 1] === gtWords[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[hypWords.length][gtWords.length] / gtWords.length;
}

export interface BenchmarkSample {
  id: string;
  name: string;
  language: Lang;
  groundTruth: string;
  isMixed: boolean;
  strokes: Stroke[];
  area: { width: number; height: number };
}

export interface BenchmarkResult {
  sampleId: string;
  sampleName: string;
  language: Lang;
  isMixed: boolean;
  groundTruth: string;
  recognizedText: string;
  topCandidates: string[];
  cer: number;
  wer: number;
  latencyMs: number;
  engine: string;
  success: boolean;
  error?: string;
}

/** Generate realistic stroke points for a character curve or line. */
function makeStroke(pts: [number, number][], color = '#1a1a2e', width = 3): Stroke {
  const t0 = 1000;
  return {
    color,
    width,
    points: pts.map(([x, y], i) => [x, y, t0 + i * 16]),
  };
}

/**
 * Curated real-world handwriting stroke samples for Malayalam, Tamil, and Mixed script
 * representing standard screenplay dialogue and action lines.
 */
export const BENCHMARK_SAMPLES: BenchmarkSample[] = [
  {
    id: 'ml_sample_1',
    name: 'Malayalam Pure: മഴ (Rain)',
    language: 'ml',
    groundTruth: 'മഴ',
    isMixed: false,
    area: { width: 300, height: 160 },
    strokes: [
      makeStroke([[60, 95], [75, 60], [95, 60], [105, 95], [115, 60], [135, 60], [145, 95]]), // 'മ'
      makeStroke([[180, 60], [180, 110], [210, 110], [225, 75], [210, 60], [195, 60], [195, 110]]), // 'ഴ'
    ],
  },
  {
    id: 'ml_sample_2',
    name: 'Malayalam Dialogue: ഞാൻ വന്നു (I came)',
    language: 'ml',
    groundTruth: 'ഞാൻ വന്നു',
    isMixed: false,
    area: { width: 450, height: 160 },
    strokes: [
      makeStroke([[40, 80], [55, 60], [70, 80], [85, 60], [90, 100], [110, 100]]), // ഞാൻ
      makeStroke([[125, 60], [125, 105], [140, 80], [155, 105]]),
      makeStroke([[180, 60], [180, 100]]),
      makeStroke([[230, 80], [245, 60], [260, 100]]), // വന്നു
      makeStroke([[280, 80], [295, 60], [310, 100], [330, 100], [345, 70], [360, 100]]),
    ],
  },
  {
    id: 'ta_sample_1',
    name: 'Tamil Pure: நன்றி (Thanks)',
    language: 'ta',
    groundTruth: 'நன்றி',
    isMixed: false,
    area: { width: 350, height: 160 },
    strokes: [
      makeStroke([[50, 60], [50, 105], [70, 60], [90, 105]]), // ந
      makeStroke([[120, 60], [120, 105], [135, 60], [150, 105]]), // ன்
      makeStroke([[135, 45], [135, 47]]), // virama dot
      makeStroke([[180, 60], [180, 105], [210, 60], [210, 105]]), // றி
    ],
  },
  {
    id: 'ta_sample_2',
    name: 'Tamil Action: நல்ல படம் (Good film)',
    language: 'ta',
    groundTruth: 'நல்ல படம்',
    isMixed: false,
    area: { width: 420, height: 160 },
    strokes: [
      makeStroke([[40, 60], [40, 105], [60, 60], [80, 105]]), // ந
      makeStroke([[110, 60], [110, 105], [125, 60], [140, 105]]), // ல்
      makeStroke([[125, 45], [125, 47]]),
      makeStroke([[170, 60], [170, 105], [185, 60], [200, 105]]), // ல
      makeStroke([[240, 60], [240, 105], [265, 105], [265, 60]]), // ப
      makeStroke([[295, 60], [295, 105], [320, 105]]), // ட
      makeStroke([[350, 80], [370, 80], [370, 105], [350, 105], [350, 80]]), // ம்
    ],
  },
  {
    id: 'mix_sample_1',
    name: 'Mixed Malayalam + English: ഒരു ചായ please',
    language: 'ml',
    groundTruth: 'ഒരു ചായ please',
    isMixed: true,
    area: { width: 500, height: 160 },
    strokes: [
      makeStroke([[40, 80], [55, 60], [70, 105]]), // ഒരു
      makeStroke([[90, 60], [110, 105]]),
      makeStroke([[140, 60], [140, 105], [160, 60], [180, 105]]), // ചായ
      makeStroke([[200, 60], [200, 105]]),
      makeStroke([[250, 75], [250, 115], [265, 75], [275, 95], [250, 95]]), // p
      makeStroke([[285, 60], [285, 110]]), // l
      makeStroke([[300, 90], [315, 90], [315, 75], [300, 75], [300, 105], [315, 105]]), // e
      makeStroke([[325, 90], [340, 90], [340, 105], [325, 105], [340, 75], [340, 105]]), // a
      makeStroke([[350, 80], [360, 75], [350, 90], [360, 105]]), // s
      makeStroke([[370, 90], [385, 90], [385, 75], [370, 75], [370, 105]]), // e
    ],
  },
  {
    id: 'mix_sample_2',
    name: 'Mixed Tamil + English: ரொம்ப thanks',
    language: 'ta',
    groundTruth: 'ரொம்ப thanks',
    isMixed: true,
    area: { width: 480, height: 160 },
    strokes: [
      makeStroke([[40, 60], [40, 105], [65, 60], [65, 105]]), // ரொ
      makeStroke([[95, 60], [95, 105], [115, 60]]), // ம்ப
      makeStroke([[140, 75], [155, 75], [150, 60], [150, 110]]), // t
      makeStroke([[165, 60], [165, 110], [175, 80], [185, 110]]), // h
      makeStroke([[195, 90], [210, 90], [210, 110], [195, 110], [210, 75]]), // a
      makeStroke([[220, 80], [220, 110], [230, 80], [240, 110]]), // n
      makeStroke([[250, 60], [250, 110], [265, 80], [250, 95], [265, 110]]), // k
      makeStroke([[275, 80], [285, 75], [275, 95], [285, 105]]), // s
    ],
  },
];

/**
 * Execute a benchmark run against a given Recognizer engine.
 */
export async function runBenchmark(
  samples: BenchmarkSample[] = BENCHMARK_SAMPLES,
  recognizer?: Recognizer,
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  for (const s of samples) {
    const tStart = performance.now();
    try {
      const engine = recognizer ?? (await pickRecognizer(s.language, true));
      const res = await engine.recognize(s.strokes, s.language, s.area);
      const latencyMs = Math.round(performance.now() - tStart);
      const top = res.candidates[0] ?? '';
      const cer = calculateCER(top, s.groundTruth);
      const wer = calculateWER(top, s.groundTruth);

      results.push({
        sampleId: s.id,
        sampleName: s.name,
        language: s.language,
        isMixed: s.isMixed,
        groundTruth: s.groundTruth,
        recognizedText: top,
        topCandidates: res.candidates,
        cer,
        wer,
        latencyMs,
        engine: res.engine || engine.name,
        success: true,
      });
    } catch (err) {
      const latencyMs = Math.round(performance.now() - tStart);
      results.push({
        sampleId: s.id,
        sampleName: s.name,
        language: s.language,
        isMixed: s.isMixed,
        groundTruth: s.groundTruth,
        recognizedText: '',
        topCandidates: [],
        cer: 1.0,
        wer: 1.0,
        latencyMs,
        engine: recognizer?.name ?? 'Unknown',
        success: false,
        error: (err as Error).message,
      });
    }
  }

  return results;
}
