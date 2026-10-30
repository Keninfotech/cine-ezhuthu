import { useRef, useState } from 'react';
import type { Scene } from '../lib/types';
import { charactersInScene } from '../lib/screenplay';
import { useEditor } from './context';

/** Pointer-based drag reorder — works with finger, pen and mouse (HTML5 DnD doesn't on iPad). */
function useSortable(onMove: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const start = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag({ from: i, over: i });
    const move = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-sort-index]') as HTMLElement | null;
      if (el) setDrag((d) => (d ? { ...d, over: +el.dataset.sortIndex! } : d));
    };
    const up = () => {
      const d = dragRef.current;
      if (d && d.from !== d.over) onMove(d.from, d.over);
      setDrag(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const cls = (i: number) =>
    drag ? (i === drag.from ? ' dragging' : i === drag.over ? (drag.over > drag.from ? ' drop-after' : ' drop-before') : '') : '';
  return { start, cls };
}

export function Navigator({ activeSceneId, pages, onJump }: { activeSceneId: string | null; pages: string[]; onJump: (s: Scene) => void }) {
  const { script, ops } = useEditor();
  const sort = useSortable(ops.moveScene);
  return (
    <nav className="nav" aria-label="Scene navigator">
      <div className="nav-head">
        <span>Scenes</span>
        <button className="link" onClick={() => ops.addScene(null)}>+ New</button>
      </div>
      <ol className="nav-list">
        {script.scenes.map((s, i) => (
          <li key={s.id} data-sort-index={i} className={'nav-item' + (s.id === activeSceneId ? ' on' : '') + sort.cls(i)} style={s.color ? { borderLeftColor: s.color } : undefined}>
            <span className="grip" onPointerDown={sort.start(i)} aria-label="Drag to reorder" role="button">⠿</span>
            <button className="nav-btn" onClick={() => onJump(s)}>
              <span className="n">{i + 1}</span>
              <span className="h">{s.heading || <i className="muted">Untitled</i>}</span>
              <span className="p">{pages[i]}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Board({ pages, onOpen }: { pages: string[]; onOpen: (s: Scene) => void }) {
  const { script, ops } = useEditor();
  const sort = useSortable(ops.moveScene);
  return (
    <div className="board" aria-label="Scene cards">
      <p className="muted board-hint">Drag cards by the ⠿ handle to rearrange scenes — like index cards on the wall. Tap a card to open it.</p>
      <div className="cards">
        {script.scenes.map((s, i) => {
          const firstAction = s.blocks.find((b) => b.type === 'action' && b.text.trim())?.text;
          const cast = charactersInScene(s);
          return (
            <article key={s.id} data-sort-index={i} className={'card' + sort.cls(i)} style={s.color ? { borderTopColor: s.color } : undefined}>
              <header>
                <span className="grip" onPointerDown={sort.start(i)} role="button" aria-label={`Drag scene ${i + 1}`}>⠿</span>
                <span className="card-n">{i + 1}</span>
                <span className="card-p">{pages[i]} pg</span>
              </header>
              <button className="card-body" onClick={() => onOpen(s)}>
                <h3>{s.heading || 'Untitled scene'}</h3>
                <p>{s.synopsis || firstAction || <span className="muted">Empty scene</span>}</p>
              </button>
              <footer>
                {cast.slice(0, 4).map((c) => <span className="chip cast" key={c}>{c}</span>)}
                {cast.length > 4 && <span className="chip">+{cast.length - 4}</span>}
                {s.memoIds.length > 0 && <span className="chip" title="Voice memos">🎙 {s.memoIds.length}</span>}
                {s.photoIds.length > 0 && <span className="chip" title="Photos">📷 {s.photoIds.length}</span>}
                {s.ink.length > 0 && <span className="chip" title="Margin notes">✎</span>}
              </footer>
            </article>
          );
        })}
        <button className="card add" onClick={() => ops.addScene(null)}>+ New scene</button>
      </div>
    </div>
  );
}
