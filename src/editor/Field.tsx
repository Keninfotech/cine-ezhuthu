import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditor } from './context';
import { transliterateWord, canTransliterate } from '../lib/translit';
import { detectScript } from '../lib/screenplay';

const BOUNDARY = /[\s.,!?;:)\]"'\-—]/;

interface Props {
  id: string;
  sceneId: string;
  value: string;
  className: string;
  placeholder?: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>, el: HTMLTextAreaElement, accept: (viaEnter?: boolean) => boolean) => void;
  suggestions?: (prefix: string) => string[];
  /** replace whole value with suggestion (true) or only the current word */
  suggestWhole?: boolean;
  showLangTag?: boolean;
  ariaLabel: string;
  /** return true to leave the word being finished in English */
  translitSkip?: (before: string) => boolean;
  /** shrink-wrap the field to its text (parentheticals) */
  autoWidth?: boolean;
}

/** Screenplay words that stay in English even with Manglish/Tanglish typing on. */
const shouldSkip = (word: string, before: string, extra?: (b: string) => boolean) =>
  /^[A-Z]{2,}$/.test(word) || // INT, EXT, CUT, DAY… (ALL CAPS)
  /^(int|ext|i\/e)$/i.test(word) ||
  /\([^)]*$/.test(before) && /^[A-Za-z]{1,2}$/.test(word) || // (V.O.) (O.S.)
  !!extra?.(before);

/** Last automatic conversion, so Backspace right after it restores the Latin word. */
let lastConversion: { id: string; at: number; original: string; converted: string } | null = null;
/** A word the writer chose to keep in English — Enter must not convert it again. */
let keptEnglish: { id: string; at: number } | null = null;

export function Field(p: Props) {
  const ctx = useEditor();
  const el = useRef<HTMLTextAreaElement>(null);
  const [sugs, setSugs] = useState<string[]>([]);
  const [sel, setSel] = useState(0);
  const [focused, setFocused] = useState(false);
  /** caret to restore right after React writes a changed value (before the next keystroke) */
  const pendingCaret = useRef<number | null>(null);

  // auto-grow + caret restore
  useLayoutEffect(() => {
    const t = el.current!;
    t.style.height = '0px';
    t.style.height = t.scrollHeight + 'px';
    if (pendingCaret.current !== null && document.activeElement === t) {
      t.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [p.value]);
  useEffect(() => {
    const t = el.current!;
    const ro = new ResizeObserver(() => {
      t.style.height = '0px';
      t.style.height = t.scrollHeight + 'px';
    });
    ro.observe(t.parentElement!);
    return () => ro.disconnect();
  }, []);

  // element type changed (e.g. Character → Action): drop stale suggestions
  useEffect(() => {
    if (document.activeElement === el.current) refreshSuggestions(p.value);
    else setSugs([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.className]);

  // programmatic focus requests
  useEffect(() => {
    const f = ctx.focusReq;
    if (!f || f.id !== p.id) return;
    const t = el.current!;
    if (document.activeElement !== t) t.focus({ preventScroll: true });
    t.setSelectionRange(f.start, f.end ?? f.start);
    const r = t.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight - (ctx.penMode ? 300 : 60)) t.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.focusReq]);

  const track = () => {
    const t = el.current;
    if (!t) return; // field was removed (merged/split) before this ran
    ctx.setActive({ sceneId: p.sceneId, fieldId: p.id, start: t.selectionStart, end: t.selectionEnd });
  };

  const refreshSuggestions = (v: string) => {
    if (!p.suggestions) {
      setSugs([]);
      return;
    }
    const list = p.suggestions(v);
    setSugs(list.slice(0, 6));
    setSel(0);
    navigated.current = false;
  };

  /** true once the writer arrows through the list — then Enter picks even on an empty line */
  const navigated = useRef(false);

  const accept = (viaEnter = true): boolean => {
    if (!sugs.length) return false;
    // Enter on an empty cue should do the screenplay thing (→ Action), not grab the first name
    if (viaEnter && !p.value.trim() && !navigated.current) return false;
    const choice = sugs[sel];
    pendingCaret.current = choice.length;
    p.onChange(choice);
    setSugs([]);
    requestAnimationFrame(track);
    return true;
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    let v = e.target.value;
    let caret = e.target.selectionStart;
    const lang = ctx.lang;
    // transliterate the word just finished when a boundary character is typed
    if (ctx.translit && canTransliterate(lang) && caret > 1 && v.length > p.value.length) {
      const typed = v[caret - 1];
      if (BOUNDARY.test(typed)) {
        const before = v.slice(0, caret - 1);
        const m = before.match(/[A-Za-z^]+$/);
        if (m && !shouldSkip(m[0], before, p.translitSkip)) {
          const conv = transliterateWord(m[0], lang);
          if (conv !== m[0]) {
            const s = before.length - m[0].length;
            v = v.slice(0, s) + conv + v.slice(caret - 1);
            caret = s + conv.length + 1;
            lastConversion = { id: p.id, at: caret, original: m[0], converted: conv + typed };
            pendingCaret.current = caret;
          }
        }
      }
    }
    p.onChange(v);
    refreshSuggestions(v);
    requestAnimationFrame(track);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const t = el.current!;
    if (sugs.length && focused) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigated.current = true;
        setSel((s) => (s + 1) % sugs.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigated.current = true;
        setSel((s) => (s - 1 + sugs.length) % sugs.length);
        return;
      }
      if (e.key === 'Escape') {
        setSugs([]);
        return;
      }
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        accept(false);
        return;
      }
    }
    // Backspace straight after an auto-conversion restores what was typed (e.g. "please")
    if (e.key === 'Backspace' && lastConversion && lastConversion.id === p.id && t.selectionStart === t.selectionEnd && t.selectionStart === lastConversion.at) {
      const lc = lastConversion;
      const s = lc.at - lc.converted.length;
      if (p.value.slice(s, lc.at) === lc.converted) {
        e.preventDefault();
        const v = p.value.slice(0, s) + lc.original + p.value.slice(lc.at);
        pendingCaret.current = s + lc.original.length;
        keptEnglish = { id: p.id, at: s + lc.original.length };
        p.onChange(v);
        lastConversion = null;
        return;
      }
    }
    if (e.key !== 'Backspace') lastConversion = null;
    // flush pending transliteration on Enter
    const kept = keptEnglish && keptEnglish.id === p.id && keptEnglish.at === t.selectionStart;
    if (e.key !== 'Enter' && e.key !== 'Backspace') keptEnglish = null;
    if (e.key === 'Enter' && ctx.translit && canTransliterate(ctx.lang) && !kept) {
      const caret = t.selectionStart;
      const before = p.value.slice(0, caret);
      const m = before.match(/[A-Za-z^]+$/);
      if (m && !shouldSkip(m[0], before, p.translitSkip)) {
        const conv = transliterateWord(m[0], ctx.lang);
        if (conv !== m[0]) {
          const s = caret - m[0].length;
          const v = p.value.slice(0, s) + conv + p.value.slice(caret);
          t.value = v;
          t.setSelectionRange(s + conv.length, s + conv.length);
          p.onChange(v);
        }
      }
    }
    p.onKeyDown?.(e, t, accept);
  };

  const tag = p.showLangTag && p.value.trim() ? detectScript(p.value) : 'none';

  return (
    <div className={'field ' + p.className + (focused ? ' focused' : '') + (p.autoWidth ? ' autow' : '')} data-value={p.autoWidth ? (p.value || p.placeholder || '') + ' ' : undefined}>
      <textarea
        ref={el}
        data-field-id={p.id}
        aria-label={p.ariaLabel}
        rows={1}
        cols={p.autoWidth ? 1 : undefined}
        value={p.value}
        placeholder={p.placeholder}
        spellCheck
        lang={ctx.lang}
        inputMode={ctx.penMode ? 'none' : 'text'}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onFocus={() => {
          setFocused(true);
          track();
          refreshSuggestions(p.value);
        }}
        onBlur={() => {
          setFocused(false);
          setTimeout(() => setSugs([]), 150);
        }}
        onSelect={track}
        onClick={track}
      />
      {tag !== 'none' && tag !== ctx.lang && (
        <span className={'lang-tag lang-' + tag} title="Detected script of this line">
          {tag === 'mixed' ? 'MIX' : tag.toUpperCase()}
        </span>
      )}
      {focused && sugs.length > 0 && (
        <ul className="suggest" role="listbox">
          {sugs.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === sel}
              className={i === sel ? 'sel' : ''}
              onPointerDown={(e) => {
                e.preventDefault();
                setSel(i);
                pendingCaret.current = s.length;
                p.onChange(s);
                setSugs([]);
                requestAnimationFrame(track);
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
