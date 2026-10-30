import type { Block, ElementType, Lang, Scene, Script, Settings, ShotItem, TreatmentData } from './types';
import { uid } from './types';

export const ELEMENT_LABEL: Record<ElementType, string> = {
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
};

export const ELEMENT_ORDER: ElementType[] = ['action', 'character', 'parenthetical', 'dialogue', 'transition'];

/** What comes after pressing Enter at the end of an element (Final Draft conventions). */
export function nextType(t: ElementType): ElementType {
  switch (t) {
    case 'character': return 'dialogue';
    case 'parenthetical': return 'dialogue';
    case 'dialogue': return 'character';
    case 'transition': return 'action';
    default: return 'action';
  }
}

/** Tab cycles the element type. */
export function cycleType(t: ElementType, back = false): ElementType {
  const cyc: ElementType[] = ['action', 'character', 'dialogue', 'parenthetical', 'transition'];
  const i = cyc.indexOf(t);
  return cyc[(i + (back ? cyc.length - 1 : 1)) % cyc.length];
}

export const newBlock = (type: ElementType = 'action', text = ''): Block => ({ id: uid(), type, text });

export const newScene = (heading = ''): Scene => ({
  id: uid(),
  heading,
  synopsis: '',
  blocks: [newBlock('action')],
  memoIds: [],
  photoIds: [],
  ink: [],
});

// ---------- language tagging ----------

export type ScriptTag = Lang | 'mixed' | 'none';

const RE_ML = /[ഀ-ൿ]/;
const RE_TA = /[஀-௿]/;
const RE_TE = /[\u0C00-\u0C7F]/;
const RE_KN = /[\u0C80-\u0CFF]/;
const RE_LAT = /[A-Za-z]/;

/** Detect which script(s) a piece of text is written in. */
export function detectScript(text: string): ScriptTag {
  const found = new Set<Lang>();
  if (RE_ML.test(text)) found.add('ml');
  if (RE_TA.test(text)) found.add('ta');
  if (RE_TE.test(text)) found.add('te');
  if (RE_KN.test(text)) found.add('kn');
  if (RE_LAT.test(text)) found.add('en');
  if (found.size === 0) return 'none';
  if (found.size > 1) return 'mixed';
  return [...found][0];
}

// ---------- scene headings ----------

const TIME_WORDS: Record<string, string> = {
  DAY: 'DAY', NIGHT: 'NIGHT', MORNING: 'MORNING', EVENING: 'EVENING', DAWN: 'DAWN', DUSK: 'DUSK',
  CONTINUOUS: 'CONTINUOUS', LATER: 'LATER',
  'പകൽ': 'DAY', 'രാത്രി': 'NIGHT', 'രാവിലെ': 'MORNING', 'വൈകുന്നേരം': 'EVENING', 'സന്ധ്യ': 'DUSK', 'പുലർച്ചെ': 'DAWN',
  'பகல்': 'DAY', 'இரவு': 'NIGHT', 'காலை': 'MORNING', 'மாலை': 'EVENING', 'அதிகாலை': 'DAWN',
  'పగలు': 'DAY', 'రాత్రి': 'NIGHT', 'ఉదయం': 'MORNING', 'సాయంత్రం': 'EVENING',
  'ದಿನ': 'DAY', 'ರಾತ್ರಿ': 'NIGHT', 'ಬೆಳಿಗ್ಗೆ': 'MORNING', 'ಸಂಜೆ': 'EVENING',
};

export interface ParsedHeading {
  intExt: string;
  location: string;
  time: string;
  timeNormalized: string;
}

export function parseHeading(h: string): ParsedHeading {
  const s = h.trim();
  const m = s.match(/^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|I\/E\.?|INT\.?|EXT\.?|ഇന്റ്\.?|എക്സ്റ്റ്\.?|உள்\.?|வெளி\.?|ఇంట్\.?|ఎక్స్ట్\.?|ಒಳ\.?|ಹೊರ\.?)\s*/i);
  const intExt = m ? m[1].toUpperCase().replace(/\.$/, '') : '';
  let rest = m ? s.slice(m[0].length) : s;
  let time = '';
  const dash = rest.match(/\s[-–—]\s*([^-–—]+)$/);
  if (dash) {
    time = dash[1].trim();
    rest = rest.slice(0, dash.index).trim();
  }
  const timeNormalized = TIME_WORDS[time.toUpperCase()] ?? TIME_WORDS[time] ?? time.toUpperCase();
  return { intExt, location: rest.trim(), time, timeNormalized };
}

// ---------- characters ----------

/** Strip extensions like (V.O.), (O.S.), (CONT'D) from a character cue. */
export function cueName(cue: string): string {
  return cue.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
}

export function charactersInScene(scene: Scene): string[] {
  const set = new Set<string>();
  for (const b of scene.blocks) if (b.type === 'character' && cueName(b.text)) set.add(cueName(b.text));
  return [...set];
}

/** All character names: database first, then any used in cues. Sorted by frequency. */
export function allCharacters(script: Script): string[] {
  const freq = new Map<string, number>();
  for (const c of script.characters) freq.set(c.name, (freq.get(c.name) ?? 0) + 1000);
  for (const s of script.scenes)
    for (const b of s.blocks)
      if (b.type === 'character') {
        const n = cueName(b.text);
        if (n) freq.set(n, (freq.get(n) ?? 0) + 1);
      }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

export function allLocations(script: Script): string[] {
  const set = new Set<string>();
  for (const s of script.scenes) {
    const loc = parseHeading(s.heading).location;
    if (loc) set.add(loc);
  }
  return [...set];
}

// ---------- consistency checker ----------

const graphemes = (s: string): string[] => {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) return [...new Seg(undefined, { granularity: 'grapheme' }).segment(s)].map((x) => x.segment);
  return [...s];
};

/** Levenshtein distance on code points (so a wrong vowel sign counts as 1 edit). */
export function editDistance(a: string, b: string): number {
  const A = [...a], B = [...b];
  const dp = Array.from({ length: A.length + 1 }, (_, i) => [i, ...Array(B.length).fill(0)]);
  for (let j = 1; j <= B.length; j++) dp[0][j] = j;
  for (let i = 1; i <= A.length; i++)
    for (let j = 1; j <= B.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
  return dp[A.length][B.length];
}

export interface NameIssue {
  canonical: string;
  variants: { name: string; count: number; scenes: number[] }[];
}

/** Flags character names that are probably the same person spelled differently (common with HWR variance). */
export function checkCharacterConsistency(script: Script): NameIssue[] {
  const uses = new Map<string, { count: number; scenes: Set<number> }>();
  script.scenes.forEach((s, si) => {
    for (const b of s.blocks) {
      if (b.type !== 'character') continue;
      const n = cueName(b.text);
      if (!n) continue;
      const u = uses.get(n) ?? { count: 0, scenes: new Set() };
      u.count++;
      u.scenes.add(si + 1);
      uses.set(n, u);
    }
  });
  const known = new Set(script.characters.map((c) => c.name));
  const names = [...uses.keys()];
  const norm = (n: string) => n.toLowerCase().replace(/[\s.]/g, '');
  const parent = new Map(names.map((n) => [n, n]));
  const find = (n: string): string => (parent.get(n) === n ? n : find(parent.get(n)!));
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const a = norm(names[i]), b = norm(names[j]);
      const len = Math.max(graphemes(a).length, graphemes(b).length);
      const d = editDistance(a, b);
      const threshold = len <= 3 ? 1 : 2;
      if (a === b || (d <= threshold && d / [...a].length < 0.5)) parent.set(find(names[i]), find(names[j]));
    }
  const groups = new Map<string, string[]>();
  for (const n of names) {
    const r = find(n);
    groups.set(r, [...(groups.get(r) ?? []), n]);
  }
  const issues: NameIssue[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const variants = g
      .map((name) => ({ name, count: uses.get(name)!.count, scenes: [...uses.get(name)!.scenes].sort((a, b) => a - b) }))
      .sort((a, b) => (known.has(b.name) ? 1 : 0) - (known.has(a.name) ? 1 : 0) || b.count - a.count);
    issues.push({ canonical: variants[0].name, variants });
  }
  return issues;
}

export function renameCharacter(script: Script, from: string, to: string): Script {
  return {
    ...script,
    scenes: script.scenes.map((s) => ({
      ...s,
      blocks: s.blocks.map((b) =>
        b.type === 'character' && cueName(b.text) === from ? { ...b, text: b.text.replace(from, to) } : b,
      ),
    })),
  };
}

// ---------- page count (script-aware calibration) ----------

/** Column widths in Courier-12 characters for a US-letter screenplay page. */
const WIDTH: Record<ElementType | 'heading', number> = {
  heading: 61, action: 61, character: 38, parenthetical: 25, dialogue: 35, transition: 20,
};
const LINES_PER_PAGE = 55;

export const DEFAULT_CALIBRATION: Settings['calibration'] = { en: 1, ml: 1.45, ta: 1.55, te: 1.48, kn: 1.48 };

/** Visual width of text in "Courier character" units. Indic clusters are wider than Latin letters. */
export function visualWidth(text: string, cal: Settings['calibration']): number {
  let w = 0;
  for (const g of graphemes(text)) {
    if (RE_ML.test(g)) w += cal.ml ?? 1.45;
    else if (RE_TA.test(g)) w += cal.ta ?? 1.55;
    else if (RE_TE.test(g)) w += cal.te ?? 1.48;
    else if (RE_KN.test(g)) w += cal.kn ?? 1.48;
    else w += 1;
  }
  return w;
}

function linesFor(text: string, width: number, cal: Settings['calibration']): number {
  if (!text.trim()) return 1;
  let lines = 0;
  for (const para of text.split('\n')) {
    let cur = 0;
    let n = 1;
    for (const word of para.split(/\s+/)) {
      const ww = visualWidth(word, cal);
      if (cur > 0 && cur + 1 + ww > width) {
        n++;
        cur = ww;
      } else cur += (cur > 0 ? 1 : 0) + ww;
    }
    lines += n;
  }
  return lines;
}

export function sceneLines(scene: Scene, cal: Settings['calibration']): number {
  let lines = linesFor(scene.heading || ' ', WIDTH.heading, cal) + 1;
  let prev: ElementType | null = null;
  for (const b of scene.blocks) {
    const gap = prev && (b.type === 'dialogue' || b.type === 'parenthetical') && (prev === 'character' || prev === 'parenthetical' || prev === 'dialogue') ? 0 : 1;
    lines += gap + linesFor(b.text, WIDTH[b.type], cal);
    prev = b.type;
  }
  return lines + 1;
}

export function pageCount(script: Script, cal: Settings['calibration']) {
  const perScene = script.scenes.map((s) => sceneLines(s, cal) / LINES_PER_PAGE);
  const pages = perScene.reduce((a, b) => a + b, 0);
  return { pages, perScene, minutes: Math.round(pages) };
}

/** Format eighths of a page like production does: "1 3/8". */
export function eighths(pages: number): string {
  const e = Math.max(1, Math.round(pages * 8));
  const whole = Math.floor(e / 8), rest = e % 8;
  return [whole ? String(whole) : '', rest ? `${rest}/8` : ''].filter(Boolean).join(' ') || '1/8';
}

// ---------- production breakdown ----------

export interface BreakdownRow {
  scene: number;
  intExt: string;
  location: string;
  time: string;
  characters: string[];
  pages: string;
  synopsis: string;
  memos: number;
  photos: number;
}

export function breakdown(script: Script, cal: Settings['calibration']): BreakdownRow[] {
  const { perScene } = pageCount(script, cal);
  return script.scenes.map((s, i) => {
    const h = parseHeading(s.heading);
    return {
      scene: i + 1,
      intExt: h.intExt,
      location: h.location,
      time: h.timeNormalized,
      characters: charactersInScene(s),
      pages: eighths(perScene[i]),
      synopsis: s.synopsis,
      memos: s.memoIds.length,
      photos: s.photoIds.length,
    };
  });
}

// ---------- find & replace ----------

export interface Match {
  sceneId: string;
  blockId: string | 'heading';
  index: number;
  length: number;
}

export function findAll(script: Script, query: string, caseSensitive = false): Match[] {
  if (!query) return [];
  const out: Match[] = [];
  const q = caseSensitive ? query : query.toLowerCase();
  const scan = (sceneId: string, blockId: string, text: string) => {
    const t = caseSensitive ? text : text.toLowerCase();
    let i = t.indexOf(q);
    while (i >= 0) {
      out.push({ sceneId, blockId, index: i, length: query.length });
      i = t.indexOf(q, i + Math.max(1, q.length));
    }
  };
  for (const s of script.scenes) {
    scan(s.id, 'heading', s.heading);
    for (const b of s.blocks) scan(s.id, b.id, b.text);
  }
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function replaceAll(script: Script, query: string, replacement: string, caseSensitive = false): { script: Script; count: number } {
  if (!query) return { script, count: 0 };
  const re = new RegExp(escapeRe(query), caseSensitive ? 'g' : 'gi');
  let count = 0;
  const rep = (t: string) => t.replace(re, () => (count++, replacement));
  const next = {
    ...script,
    scenes: script.scenes.map((s) => ({ ...s, heading: rep(s.heading), blocks: s.blocks.map((b) => ({ ...b, text: rep(b.text) })) })),
  };
  return { script: next, count };
}

// ---------- stats ----------

export function wordCount(script: Script): number {
  let n = 0;
  for (const s of script.scenes) {
    n += s.heading.split(/\s+/).filter(Boolean).length;
    for (const b of s.blocks) n += b.text.split(/\s+/).filter(Boolean).length;
  }
  return n;
}

// ---------- Shot List Generator (Brainstorm Report) ----------

export function generateShotList(scene: Scene): ShotItem[] {
  const shots: ShotItem[] = [];
  const h = parseHeading(scene.heading);
  const chars = charactersInScene(scene);
  const isExt = /^EXT/i.test(h.intExt);

  // 1. Establishing / Wide
  shots.push({
    id: uid(),
    type: isExt ? 'EWS' : 'WS',
    angle: 'Eye-level',
    subject: h.location || 'Location',
    description: `Establishing shot of ${h.location || 'scene'} during ${h.timeNormalized || 'day'}.`,
  });

  // 2. Scene Master
  if (chars.length > 0) {
    shots.push({
      id: uid(),
      type: 'MS',
      angle: 'Eye-level',
      subject: chars.join(', '),
      description: `Master shot capturing spatial positions and initial movement of ${chars.join(' and ')}.`,
    });
  }

  // 3. Dialogue or Action shots
  if (chars.length >= 2) {
    shots.push({
      id: uid(),
      type: 'OTS',
      angle: 'Eye-level',
      subject: `${chars[0]} & ${chars[1]}`,
      description: `Over-the-shoulder coverage framing dialogue exchanges.`,
    });
  }

  for (const c of chars.slice(0, 3)) {
    shots.push({
      id: uid(),
      type: 'MCU',
      angle: 'Eye-level',
      subject: c,
      description: `Medium close-up on ${c} capturing speech delivery and character expression.`,
    });
  }

  // 4. Detail / Insert shot for key props or atmosphere
  shots.push({
    id: uid(),
    type: 'CU',
    angle: 'Eye-level',
    subject: 'Action Detail / Props',
    description: `Close-up on pivotal actions, hands, or focal environmental details in the scene.`,
  });

  return shots;
}

// ---------- Treatment Converter (Proposal Stage 4 -> Stage 5) ----------

export function convertTreatmentToScenes(treatment: TreatmentData): Scene[] {
  if (!treatment.scenes.length) return [newScene('')];
  return treatment.scenes.map((ts) => {
    let heading = ts.slug.trim();
    if (!heading) {
      const loc = ts.location.trim() || 'LOCATION';
      const time = ts.time.trim() || 'DAY';
      heading = `INT. ${loc} - ${time}`;
    }
    const blocks: Block[] = [];
    if (ts.description.trim()) {
      blocks.push(newBlock('action', ts.description.trim()));
    }
    if (ts.characters.length > 0) {
      for (const ch of ts.characters) {
        if (ch.trim()) {
          blocks.push(newBlock('character', ch.trim()));
          blocks.push(newBlock('dialogue', ''));
        }
      }
    }
    if (blocks.length === 0) {
      blocks.push(newBlock('action', ''));
    }
    return {
      ...newScene(heading),
      synopsis: ts.description.slice(0, 120),
      blocks,
    };
  });
}
