/**
 * Offline phonetic transliteration: Manglish → Malayalam, Tanglish → Tamil.
 * Same language in, same language out — this only changes the script, never translates.
 *
 * Scheme is close to what people already type on WhatsApp (Mozhi-style):
 *   Malayalam: "njaan vannu" → ഞാൻ വന്നു,  "kEraLam" → കേരളം,  "undu" → ഉണ്ടു, "und" → ഉണ്ട്
 *   Tamil:     "nandri" → நன்றி, "saapadu" → சாபடு, "kaatru" → காற்று
 */
import type { Lang } from './types';

interface Table {
  vowels: Record<string, [independent: string, sign: string]>;
  consonants: Record<string, string>;
  /** consonant token → replacement when it ends a word */
  finals: Record<string, string>;
  /** consonant tokens with a different output at word start */
  initials?: Record<string, string>;
  virama: string;
}

const ML: Table = {
  virama: '്',
  vowels: {
    a: ['അ', ''],
    aa: ['ആ', 'ാ'], A: ['ആ', 'ാ'],
    i: ['ഇ', 'ി'],
    ii: ['ഈ', 'ീ'], ee: ['ഈ', 'ീ'], I: ['ഈ', 'ീ'],
    u: ['ഉ', 'ു'],
    uu: ['ഊ', 'ൂ'], oo: ['ഊ', 'ൂ'], U: ['ഊ', 'ൂ'],
    e: ['എ', 'െ'],
    E: ['ഏ', 'േ'], ae: ['ഏ', 'േ'],
    ai: ['ഐ', 'ൈ'],
    o: ['ഒ', 'ൊ'],
    O: ['ഓ', 'ോ'], oa: ['ഓ', 'ോ'],
    au: ['ഔ', 'ൗ'], ou: ['ഔ', 'ൗ'],
    'R^': ['ഋ', 'ൃ'],
  },
  consonants: {
    k: 'ക', kh: 'ഖ', g: 'ഗ', gh: 'ഘ', ng: 'ങ', nk: 'ങ്ക',
    ch: 'ച', chh: 'ഛ', c: 'ക', j: 'ജ', jh: 'ഝ', nj: 'ഞ',
    T: 'ട', Th: 'ഠ', D: 'ഡ', Dh: 'ഢ', N: 'ണ',
    t: 'ട', tt: 'ട്ട', th: 'ത', d: 'ദ', dh: 'ധ', n: 'ന',
    nt: 'ന്റ', nd: 'ണ്ട', nth: 'ന്ത', ndh: 'ന്ധ',
    p: 'പ', ph: 'ഫ', f: 'ഫ', b: 'ബ', bh: 'ഭ', m: 'മ',
    y: 'യ', r: 'ര', R: 'റ', l: 'ല', L: 'ള', v: 'വ', w: 'വ',
    sh: 'ശ', S: 'ശ', Sh: 'ഷ', s: 'സ', h: 'ഹ', zh: 'ഴ',
    x: 'ക്സ', q: 'ക്യ', z: 'സ', ksh: 'ക്ഷ',
  },
  finals: { n: 'ൻ', l: 'ൽ', r: 'ർ', L: 'ൾ', N: 'ൺ', m: 'ം', R: 'ർ' },
};

const TA: Table = {
  virama: '்',
  vowels: {
    a: ['அ', ''],
    aa: ['ஆ', 'ா'], A: ['ஆ', 'ா'],
    i: ['இ', 'ி'],
    ii: ['ஈ', 'ீ'], ee: ['ஈ', 'ீ'], I: ['ஈ', 'ீ'],
    u: ['உ', 'ு'],
    uu: ['ஊ', 'ூ'], oo: ['ஊ', 'ூ'], U: ['ஊ', 'ூ'],
    e: ['எ', 'ெ'],
    E: ['ஏ', 'ே'], ae: ['ஏ', 'ே'],
    ai: ['ஐ', 'ை'],
    o: ['ஒ', 'ொ'],
    O: ['ஓ', 'ோ'], oa: ['ஓ', 'ோ'],
    au: ['ஔ', 'ௌ'], ou: ['ஔ', 'ௌ'],
  },
  consonants: {
    k: 'க', g: 'க', kh: 'க', gh: 'க', c: 'க', q: 'க',
    ng: 'ங', nk: 'ங்க',
    ch: 'ச', s: 'ச', j: 'ஜ', nj: 'ஞ',
    t: 'ட', T: 'ட', d: 'ட', D: 'ட', tt: 'ட்ட', N: 'ண',
    th: 'த', dh: 'த', n: 'ன', nn: 'ன்ன', nth: 'ந்த', nd: 'ந்த', ndr: 'ன்ற', nr: 'ன்ற',
    p: 'ப', b: 'ப', f: 'ஃப', ph: 'ஃப', bh: 'ப', m: 'ம',
    y: 'ய', r: 'ர', R: 'ற', rr: 'ற்ற', tr: 'ற்ற', l: 'ல', L: 'ள', zh: 'ழ',
    v: 'வ', w: 'வ', sh: 'ஷ', Sh: 'ஷ', S: 'ஸ', h: 'ஹ', x: 'க்ஸ', z: 'ஸ', ksh: 'க்ஷ',
  },
  finals: {},
  initials: { n: 'ந', nn: 'ந' },
};

const TE: Table = {
  virama: '్',
  vowels: {
    a: ['అ', ''],
    aa: ['ఆ', 'ా'], A: ['ఆ', 'ా'],
    i: ['ఇ', 'ి'],
    ii: ['ఈ', 'ీ'], ee: ['ఈ', 'ీ'], I: ['ఈ', 'ీ'],
    u: ['ఉ', 'ు'],
    uu: ['ఊ', 'ూ'], oo: ['ఊ', 'ూ'], U: ['ఊ', 'ూ'],
    e: ['ఎ', 'ె'],
    E: ['ఏ', 'ే'], ae: ['ఏ', 'ే'],
    ai: ['ఐ', 'ై'],
    o: ['ఒ', 'ొ'],
    O: ['ఓ', 'ో'], oa: ['ఓ', 'ో'],
    au: ['ఔ', 'ౌ'], ou: ['ఔ', 'ౌ'],
  },
  consonants: {
    k: 'క', kh: 'ఖ', g: 'గ', gh: 'ఘ', ng: 'ఙ', nk: 'ంక',
    ch: 'చ', chh: 'ఛ', c: 'క', j: 'జ', jh: 'ఝ', nj: 'ఞ',
    T: 'ట', Th: 'ఠ', D: 'డ', Dh: 'ఢ', N: 'ణ',
    t: 'ట', tt: 'ట్ట', th: 'త', d: 'ద', dh: 'ధ', n: 'న',
    p: 'ప', ph: 'ఫ', f: 'ఫ', b: 'బ', bh: 'భ', m: 'మ',
    y: 'య', r: 'ర', R: 'ఱ', l: 'ల', L: 'ళ', v: 'వ', w: 'వ',
    sh: 'శ', S: 'శ', Sh: 'ష', s: 'స', h: 'హ',
  },
  finals: { m: 'ం', M: 'ం' },
};

const KN: Table = {
  virama: '್',
  vowels: {
    a: ['ಅ', ''],
    aa: ['ಆ', 'ಾ'], A: ['ಆ', 'ಾ'],
    i: ['ಇ', 'ಿ'],
    ii: ['ಈ', 'ೀ'], ee: ['ಈ', 'ೀ'], I: ['ಈ', 'ೀ'],
    u: ['ಉ', 'ು'],
    uu: ['ಊ', 'ೂ'], oo: ['ಊ', 'ೂ'], U: ['ಊ', 'ೂ'],
    e: ['ಎ', 'ೆ'],
    E: ['ಏ', 'ೇ'], ae: ['ಏ', 'ೇ'],
    ai: ['ಐ', 'ೈ'],
    o: ['ಒ', 'ೊ'],
    O: ['ಓ', 'ೋ'], oa: ['ಓ', 'ೋ'],
    au: ['ಔ', 'ೌ'], ou: ['ಔ', 'ೌ'],
  },
  consonants: {
    k: 'ಕ', kh: 'ಖ', g: 'ಗ', gh: 'ಘ', ng: 'ಙ', nk: 'ಂಕ',
    ch: 'ಚ', chh: 'ಛ', c: 'ಕ', j: 'ಜ', jh: 'ಝ', nj: 'ಞ',
    T: 'ಟ', Th: 'ಠ', D: 'ಡ', Dh: 'ಢ', N: 'ಣ',
    t: 'ಟ', tt: 'ಟ್ಟ', th: 'ತ', d: 'ದ', dh: 'ಧ', n: 'ನ',
    p: 'ಪ', ph: 'ಫ', f: 'ಫ', b: 'ಬ', bh: 'ಭ', m: 'ಮ',
    y: 'ಯ', r: 'ರ', R: 'ಱ', l: 'ಲ', L: 'ಳ', v: 'ವ', w: 'ವ',
    sh: 'ಶ', S: 'ಶ', Sh: 'ಷ', s: 'ಸ', h: 'ಹ',
  },
  finals: { m: 'ಂ', M: 'ಂ' },
};

const TABLES: Partial<Record<Lang, Table>> = { ml: ML, ta: TA, te: TE, kn: KN };

function tokens(t: Table) {
  const all = [...Object.keys(t.vowels), ...Object.keys(t.consonants)];
  const max = Math.max(...all.map((k) => k.length));
  return { max };
}

/** Transliterate a single latin word. Non-letters pass through unchanged. */
export function transliterateWord(word: string, lang: Lang): string {
  const t = TABLES[lang];
  if (!t || !/[a-zA-Z]/.test(word)) return word;
  // Sentence-case ("Amma", "Ramu") is ordinary capitalisation, not a phonetic capital.
  if (/^[A-Z][a-z]+$/.test(word)) word = word[0].toLowerCase() + word.slice(1);
  const { max } = tokens(t);
  let out = '';
  let i = 0;
  let prevCons: string | null = null; // latin token of pending consonant
  let atWordStart = true;

  const flushFinal = () => {
    if (prevCons === null) return;
    const fin = t.finals[prevCons];
    if (fin) {
      // replace the consonant just emitted by its final (chillu / anusvara) form
      const emitted = consonantOut(prevCons, false);
      out = out.slice(0, out.length - emitted.length) + fin;
    } else {
      out += t.virama;
    }
    prevCons = null;
  };

  const consonantOut = (tok: string, initial: boolean) =>
    (initial && t.initials?.[tok]) || t.consonants[tok];

  while (i < word.length) {
    const ch = word[i];
    if (!/[a-zA-Z^]/.test(ch)) {
      flushFinal();
      out += ch;
      i++;
      atWordStart = true;
      continue;
    }
    let matched = false;
    for (let len = Math.min(max, word.length - i); len > 0; len--) {
      const raw = word.substr(i, len);
      // exact (case-sensitive) token first; fall back to lower-case for unknown capitals
      const cands = t.vowels[raw] || t.consonants[raw] ? [raw] : [raw.toLowerCase()];
      for (const tok of cands) {
        if (t.vowels[tok]) {
          const [ind, sign] = t.vowels[tok];
          out += prevCons !== null ? sign : ind;
          prevCons = null;
          matched = true;
        } else if (t.consonants[tok]) {
          if (prevCons !== null) out += t.virama;
          out += consonantOut(tok, atWordStart);
          prevCons = tok;
          matched = true;
        }
        if (matched) {
          i += len;
          atWordStart = false;
          break;
        }
      }
      if (matched) break;
    }
    if (!matched) {
      flushFinal();
      out += ch;
      i++;
    }
  }
  flushFinal();
  return out;
}

/** Transliterate a whole string, word by word, leaving existing Indic text untouched. */
export function transliterate(text: string, lang: Lang): string {
  return text.replace(/[A-Za-z^]+/g, (w) => transliterateWord(w, lang));
}

export const canTransliterate = (lang: Lang) => !!TABLES[lang];
