import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';
import { transliterate } from '../translit';
import {
  checkCharacterConsistency, cycleType, detectScript, eighths, findAll, nextType,
  pageCount, parseHeading, renameCharacter, replaceAll, breakdown, DEFAULT_CALIBRATION, visualWidth,
} from '../screenplay';
import { sampleScript } from '../sample';
import { toFountain, breakdownCSV, toPlainText } from '../exporters';
import { encryptJSON, decryptJSON, exportBackup, importBackup } from '../backup';
import { saveScript, putMedia, listMedia, getScript } from '../db';
import { isScratchOut, applyScratch } from '../ink';
import type { Stroke } from '../types';
import { calculateCER, calculateWER, BENCHMARK_SAMPLES, runBenchmark } from '../benchmark';
import type { Recognizer } from '../recognizer';

describe('transliteration', () => {
  test.each([
    ['njaan vannallO', 'ഞാൻ വന്നല്ലോ'],
    ['amma', 'അമ്മ'],
    ['kEraLam', 'കേരളം'],
    ['und', 'ഉണ്ട്'],
    ['avan', 'അവൻ'],
    ['ninte veettil', 'നിന്റെ വീട്ടിൽ'],
    ['manassilaayi', 'മനസ്സിലായി'],
  ])('Manglish %s → %s', (a, b) => expect(transliterate(a, 'ml')).toBe(b));
  test.each([
    ['nandri', 'நன்றி'],
    ['kaatru', 'காற்று'],
    ['naan', 'நான்'],
    ['thambi', 'தம்பி'],
    ['nalla padam', 'நல்ல படம்'],
  ])('Tanglish %s → %s', (a, b) => expect(transliterate(a, 'ta')).toBe(b));
  test('leaves existing Indic text, digits and punctuation alone', () => {
    expect(transliterate('രാമു: 2 chaaya!', 'ml')).toBe('രാമു: 2 ചായ!');
  });
});

describe('screenplay rules', () => {
  test('enter/tab flow', () => {
    expect(nextType('character')).toBe('dialogue');
    expect(nextType('dialogue')).toBe('character');
    expect(cycleType('action')).toBe('character');
    expect(cycleType('action', true)).toBe('transition');
  });
  test('language tagging', () => {
    expect(detectScript('ഞാൻ')).toBe('ml');
    expect(detectScript('நான்')).toBe('ta');
    expect(detectScript('ഒരു ചായ, please')).toBe('mixed');
    expect(detectScript('123')).toBe('none');
  });
  test('headings in English and Malayalam', () => {
    expect(parseHeading('INT. ചായക്കട - രാവിലെ')).toMatchObject({ intExt: 'INT', location: 'ചായക്കട', timeNormalized: 'MORNING' });
    expect(parseHeading('ext. bus stop — night')).toMatchObject({ intExt: 'EXT', location: 'bus stop', timeNormalized: 'NIGHT' });
    expect(parseHeading('வெளி. கோவில் - இரவு')).toMatchObject({ location: 'கோவில்', timeNormalized: 'NIGHT' });
  });
  test('consistency checker finds രാമു / രാമൂ', () => {
    const issues = checkCharacterConsistency(sampleScript());
    expect(issues).toHaveLength(1);
    expect(issues[0].canonical).toBe('രാമു');
    expect(issues[0].variants.map((v) => v.name)).toContain('രാമൂ');
  });
  test('rename keeps extensions', () => {
    const s = renameCharacter(sampleScript(), 'രാമൂ', 'രാമു');
    expect(s.scenes[1].blocks[1].text).toBe('രാമു (O.S.)');
    expect(checkCharacterConsistency(s)).toHaveLength(0);
  });
  test('Indic text counts wider than Latin for page count', () => {
    expect(visualWidth('abcd', DEFAULT_CALIBRATION)).toBe(4);
    expect(visualWidth('കേരളം', DEFAULT_CALIBRATION)).toBeGreaterThan(3);
    const s = sampleScript();
    s.scenes[0].blocks[0].text = 'പുറത്ത് കനത്ത മഴ പെയ്യുന്നു. '.repeat(20);
    const ml = pageCount(s, DEFAULT_CALIBRATION).pages;
    const flat = pageCount(s, { en: 1, ml: 1, ta: 1 }).pages;
    expect(ml).toBeGreaterThan(flat);
  });
  test('eighths', () => {
    expect(eighths(0.01)).toBe('1/8');
    expect(eighths(1.375)).toBe('1 3/8');
    expect(eighths(2)).toBe('2');
  });
  test('find & replace', () => {
    const s = sampleScript();
    expect(findAll(s, 'ലക്ഷ്മി').length).toBeGreaterThan(2);
    const { script, count } = replaceAll(s, 'ചായ', 'കാപ്പി');
    expect(count).toBeGreaterThan(0);
    expect(findAll(script, 'ചായ')).toHaveLength(0);
  });
  test('breakdown', () => {
    const rows = breakdown(sampleScript(), DEFAULT_CALIBRATION);
    expect(rows[0]).toMatchObject({ scene: 1, intExt: 'INT', location: 'ചായക്കട', time: 'MORNING' });
    expect(rows[0].characters).toEqual(['രാമു', 'ലക്ഷ്മി']);
    expect(rows[1].time).toBe('NIGHT');
  });
});

describe('exports', () => {
  test('fountain', () => {
    const f = toFountain(sampleScript());
    expect(f).toContain('Title: മഴക്കാലം');
    expect(f).toContain('INT. ചായക്കട - രാവിലെ #1#');
    expect(f).toContain('@ലക്ഷ്മി');
    expect(f).toContain('(ചിരിച്ചുകൊണ്ട്)');
    expect(f).toContain('> CUT TO:');
  });
  test('csv & whatsapp text', () => {
    expect(breakdownCSV(sampleScript(), DEFAULT_CALIBRATION).split('\r\n')).toHaveLength(4);
    const s = sampleScript();
    const t = toPlainText(s, [s.scenes[0].id]);
    expect(t).toContain('*1. INT. ചായക്കട - രാവിലെ*');
    expect(t).not.toContain('ബസ്');
  });
});

describe('encrypted backup', () => {
  test('round trip + wrong passphrase', async () => {
    const blob = await encryptJSON({ a: 'മഴ' }, 'secret');
    expect(await decryptJSON(blob, 'secret')).toEqual({ a: 'മഴ' });
    await expect(decryptJSON(blob, 'nope')).rejects.toThrow(/passphrase/);
  });
  test('script + media survive export/import', async () => {
    const s = sampleScript();
    await putMedia({ id: 'm1', scriptId: s.id, kind: 'memo', blob: new Blob(['audio'], { type: 'audio/webm' }), createdAt: 1, name: 'memo' });
    s.scenes[0].memoIds = ['m1'];
    await saveScript(s);
    const file = await exportBackup(s.id, 'pw');
    const restored = await importBackup(file, 'pw');
    expect(restored.id).not.toBe(s.id);
    expect((await getScript(restored.id))?.scenes[0].blocks[0].text).toBe(s.scenes[0].blocks[0].text);
    const media = await listMedia(restored.id);
    expect(media).toHaveLength(1);
    expect(restored.scenes[0].memoIds[0]).toBe(media[0].id);
    expect(await media[0].blob.text()).toBe('audio');
  });
});

describe('ink', () => {
  const line = (x0: number, x1: number, y: number): Stroke => ({ color: '#000', width: 3, points: Array.from({ length: 20 }, (_, i) => [x0 + ((x1 - x0) * i) / 19, y, i]) });
  test('zig-zag over ink is a scratch-out and erases it', () => {
    const word = line(10, 100, 50);
    const other = line(300, 400, 50);
    const zig: Stroke = { color: '#000', width: 3, points: Array.from({ length: 30 }, (_, i) => [i % 2 ? 100 : 10, 48 + (i % 3), i]) };
    expect(isScratchOut(zig, [word, other])).toBe(true);
    expect(applyScratch(zig, [word, other])).toEqual([other]);
    expect(isScratchOut(line(10, 100, 80), [word])).toBe(false);
  });
});

describe('benchmark & handwriting evaluation', () => {
  test('calculateCER computes character error rate accurately', () => {
    expect(calculateCER('മഴ', 'മഴ')).toBe(0);
    expect(calculateCER('മഴു', 'മഴ')).toBeGreaterThan(0);
    expect(calculateCER('', 'മഴ')).toBe(1);
    expect(calculateCER('hello', 'hello')).toBe(0);
    expect(calculateCER('helo', 'hello')).toBeCloseTo(0.2, 1);
  });

  test('calculateWER computes word error rate accurately', () => {
    expect(calculateWER('ഞാൻ വന്നു', 'ഞാൻ വന്നു')).toBe(0);
    expect(calculateWER('ഞാൻ പോയി', 'ഞാൻ വന്നു')).toBe(0.5);
    expect(calculateWER('hello world', 'hello world')).toBe(0);
    expect(calculateWER('hello there world', 'hello world')).toBe(0.5);
  });

  test('BENCHMARK_SAMPLES has Malayalam, Tamil and Mixed samples', () => {
    expect(BENCHMARK_SAMPLES.length).toBeGreaterThanOrEqual(6);
    expect(BENCHMARK_SAMPLES.some((s) => s.language === 'ml' && !s.isMixed)).toBe(true);
    expect(BENCHMARK_SAMPLES.some((s) => s.language === 'ta' && !s.isMixed)).toBe(true);
    expect(BENCHMARK_SAMPLES.some((s) => s.isMixed)).toBe(true);
  });

  test('runBenchmark evaluates samples against recognizer interface', async () => {
    const mockRec: Recognizer = {
      name: 'Mock Test Engine',
      onDevice: true,
      async recognize(_strokes, _lang) {
        return { candidates: ['മഴ', 'മഴു'], engine: 'Mock Test Engine' };
      },
    };

    const results = await runBenchmark([BENCHMARK_SAMPLES[0]], mockRec);
    expect(results).toHaveLength(1);
    expect(results[0].sampleId).toBe('ml_sample_1');
    expect(results[0].recognizedText).toBe('മഴ');
    expect(results[0].cer).toBe(0);
    expect(results[0].wer).toBe(0);
    expect(results[0].latencyMs).toBeGreaterThanOrEqual(0);
    expect(results[0].success).toBe(true);
  });
});

