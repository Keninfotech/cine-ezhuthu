import { useEffect, useRef, useState } from 'react';
import type { Lang, Stroke } from '../lib/types';
import { LANG_NATIVE } from '../lib/types';
import { applyScratch, isScratchOut } from '../lib/ink';
import { pickRecognizer, RecognitionUnavailable } from '../lib/recognizer';
import { nextType } from '../lib/screenplay';
import { InkCanvas } from './InkCanvas';
import { insertAtActive, replaceRange, useEditor } from './context';

type Range = NonNullable<ReturnType<typeof insertAtActive>>;

interface Cands {
  primary: string[];
  english: string[];
  range: Range;
  chosen: string;
}

type SpeechCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> & { length: number }; resultIndex: number }) => void;
  onend: () => void;
  onerror: (e: { error: string }) => void;
  start(): void;
  stop(): void;
};
const Speech: SpeechCtor | undefined =
  (window as unknown as { SpeechRecognition?: SpeechCtor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: SpeechCtor }).webkitSpeechRecognition;

const SPEECH_LANG: Record<Lang, string> = { ml: 'ml-IN', ta: 'ta-IN', en: 'en-IN' };

export function HandwritingPad({ onClose }: { onClose: () => void }) {
  const ctx = useEditor();
  const { settings } = ctx;
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [lang, setLang] = useState<Lang>(ctx.lang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cands, setCands] = useState<Cands | null>(null);
  const [consent, setConsent] = useState(false);
  const [engine, setEngine] = useState<string>('');
  const [listening, setListening] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const speech = useRef<InstanceType<SpeechCtor> | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  /** make sure there is somewhere to write into */
  const ensureTarget = () => {
    if (ctx.active.current) return;
    const s = ctx.ops.get();
    const sc = s.scenes[s.scenes.length - 1];
    const b = sc.blocks[sc.blocks.length - 1];
    ctx.active.current = { sceneId: sc.id, fieldId: b.id, start: b.text.length, end: b.text.length };
  };

  const recognize = async (allowOverride?: boolean) => {
    const ink = strokesRef.current;
    if (!ink.length) return;
    const pref = settings.onlineRecognition;
    const allowOnline = allowOverride ?? pref === 'on';
    setBusy(true);
    setError(null);
    try {
      const area = { width: areaRef.current?.clientWidth ?? 800, height: areaRef.current?.clientHeight ?? 200 };
      let rec;
      try {
        rec = await pickRecognizer(lang, allowOnline);
      } catch (e) {
        if (e instanceof RecognitionUnavailable && pref === 'ask') {
          setConsent(true);
          return;
        }
        throw e;
      }
      setEngine(rec.onDevice ? 'On-device' : 'Online · ink only');
      const [prim, eng] = await Promise.allSettled([
        rec.recognize(ink, lang, area),
        lang !== 'en' ? rec.recognize(ink, 'en', area) : Promise.resolve({ candidates: [] as string[], engine: '' }),
      ]);
      if (prim.status === 'rejected') throw prim.reason;
      const primary = prim.value.candidates;
      const english = eng.status === 'fulfilled' ? eng.value.candidates.filter((c) => !primary.includes(c)) : [];
      const top = primary[0] ?? english[0];
      if (!top) {
        setError('Could not read that — try writing a little larger.');
        return;
      }
      // ignore strokes that were added while we were waiting
      if (strokesRef.current !== ink && strokesRef.current.length > ink.length) {
        setStrokes(strokesRef.current.slice(ink.length));
      } else setStrokes([]);
      ensureTarget();
      const range = insertAtActive(ctx, top, { smartSpace: true });
      if (range) setCands({ primary, english, range, chosen: top });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const schedule = () => {
    clearTimeout(timer.current);
    if (settings.autoCommitMs > 0) timer.current = window.setTimeout(() => recognize(), settings.autoCommitMs);
  };

  const pick = (c: string) => {
    if (!cands) return;
    const r = replaceRange(ctx, cands.range, c);
    if (r) setCands({ ...cands, range: r, chosen: c });
  };

  const discardLast = () => {
    if (!cands) return;
    replaceRange(ctx, { ...cands.range, leading: 0 }, '');
    setCands(null);
  };

  const key = (k: 'space' | 'enter' | 'backspace') => {
    ensureTarget();
    const a = ctx.active.current!;
    if (k === 'space') insertAtActive(ctx, ' ');
    else if (k === 'backspace') {
      if (a.start === a.end && a.start > 0) ctx.active.current = { ...a, start: a.start - 1 };
      insertAtActive(ctx, '');
    } else {
      const s = ctx.ops.get();
      const sc = s.scenes.find((x) => x.id === a.sceneId)!;
      if (a.fieldId === 'h-' + sc.id) {
        ctx.requestFocus(sc.blocks[0]?.id ?? '', 0);
        if (sc.blocks[0]) ctx.active.current = { sceneId: sc.id, fieldId: sc.blocks[0].id, start: 0, end: 0 };
      } else {
        const b = sc.blocks.find((x) => x.id === a.fieldId)!;
        const id = ctx.ops.splitBlock(sc.id, b.id, a.start, nextType(b.type));
        ctx.active.current = { sceneId: sc.id, fieldId: id, start: 0, end: 0 };
      }
    }
    setCands(null);
  };

  const toggleDictation = () => {
    if (!Speech) return;
    if (listening) {
      speech.current?.stop();
      return;
    }
    const r = new Speech();
    r.lang = SPEECH_LANG[lang];
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          ensureTarget();
          insertAtActive(ctx, e.results[i][0].transcript.trim(), { smartSpace: true });
        }
      }
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => setError('Dictation: ' + e.error);
    speech.current = r;
    r.start();
    setListening(true);
  };

  const langs: Lang[] = ctx.lang === 'en' ? ['en', 'ml', 'ta'] : [ctx.lang, 'en'];

  return (
    <div className="pad" role="region" aria-label="Handwriting pad">
      <div className="pad-bar">
        <div className="seg" role="group" aria-label="Recognition language">
          {langs.map((l) => (
            <button key={l} className={l === lang ? 'on' : ''} onClick={() => setLang(l)} aria-pressed={l === lang}>
              {LANG_NATIVE[l]}
            </button>
          ))}
        </div>
        <div className="cands" aria-live="polite">
          {busy && <span className="muted">Reading…</span>}
          {!busy && error && (
            <span className="err">
              {error} {strokes.length > 0 && <button className="link" onClick={() => recognize()}>Retry</button>}
            </span>
          )}
          {!busy && !error && cands && (
            <>
              {[...cands.primary.slice(0, 5), ...cands.english.slice(0, 3)].map((c, i) => (
                <button key={i + c} className={'cand' + (c === cands.chosen ? ' on' : '') + (i >= Math.min(5, cands.primary.length) ? ' en' : '')} onClick={() => pick(c)}>
                  {c}
                </button>
              ))}
              <button className="cand x" onClick={discardLast} title="Remove what was just inserted" aria-label="Remove last word">✕</button>
            </>
          )}
          {!busy && !error && !cands && <span className="muted">Write a word or phrase on the line. Scribble over ink to erase it.</span>}
        </div>
        <div className="pad-actions">
          {Speech && (
            <button className={'icon' + (listening ? ' rec' : '')} onClick={toggleDictation} title="Dictate dialogue" aria-label="Dictate">
              🎙
            </button>
          )}
          <button className="icon" onClick={() => setStrokes((s) => s.slice(0, -1))} title="Undo stroke" aria-label="Undo stroke">↶</button>
          <button className="icon" onClick={() => { setStrokes([]); setError(null); }} title="Clear ink" aria-label="Clear ink">⌫ ink</button>
          <button className="icon" onClick={onClose} title="Hide pad" aria-label="Hide handwriting pad">▾</button>
        </div>
      </div>
      <div className="pad-body">
        <div className="pad-area" ref={areaRef}>
          <InkCanvas
            className="pad-canvas"
            ariaLabel="Write here"
            strokes={strokes}
            penOnly={settings.penOnly}
            width={3.2}
            color="#1a1a2e"
            guides
            onStrokeStart={() => clearTimeout(timer.current)}
            onStroke={(s) => {
              const cur = strokesRef.current;
              if (isScratchOut(s, cur)) {
                setStrokes(applyScratch(s, cur));
                return;
              }
              const next = [...cur, s];
              strokesRef.current = next;
              setStrokes(next);
              schedule();
            }}
          />
          {consent && (
            <div className="consent" role="dialog" aria-label="Allow online recognition">
              <p>
                <b>This browser has no built-in {LANG_NATIVE[lang]} handwriting engine.</b> Recognise online? Only the pen strokes
                are sent to Google's handwriting service — never your script. You can change this in Settings.
              </p>
              <div className="row">
                <button className="primary" onClick={() => { setConsent(false); ctx.updateSettings({ ...settings, onlineRecognition: 'on' }); recognize(true); }}>
                  Allow
                </button>
                <button onClick={() => { setConsent(false); recognize(true); }}>Just this once</button>
                <button onClick={() => { setConsent(false); ctx.updateSettings({ ...settings, onlineRecognition: 'off' }); setError('Online recognition is off. Turn it on in Settings.'); }}>
                  No
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="pad-keys">
          {settings.autoCommitMs === 0 && (
            <button className="primary" onClick={() => recognize()} disabled={!strokes.length || busy}>Convert</button>
          )}
          <button onClick={() => key('space')} aria-label="Space">␣</button>
          <button onClick={() => key('backspace')} aria-label="Delete character">⌫</button>
          <button onClick={() => key('enter')} aria-label="New line">⏎</button>
        </div>
      </div>
      {engine && <div className="engine">{engine}</div>}
    </div>
  );
}
