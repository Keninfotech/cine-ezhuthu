import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Block, ElementType, Scene, Script } from '../lib/types';
import { uid } from '../lib/types';
import { newBlock, newScene } from '../lib/screenplay';
import { saveScript, saveVersion } from '../lib/db';

export type SaveState = 'saved' | 'saving' | 'error';

export interface FocusReq {
  id: string;
  start: number;
  end?: number;
  n: number;
}

const AUTO_VERSION_EVERY = 10 * 60 * 1000;
const HISTORY_LIMIT = 200;

/** Script state + every structural edit + undo/redo + autosave + automatic version snapshots. */
export function useScriptState(initial: Script) {
  const [script, setScript] = useState(initial);
  const ref = useRef(initial);
  const undoStack = useRef<Script[]>([]);
  const redoStack = useRef<Script[]>([]);
  const lastPush = useRef(0);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [focusReq, setFocusReq] = useState<FocusReq | null>(null);
  const [, bump] = useState(0);

  const requestFocus = useCallback((id: string, start: number, end?: number) => {
    setFocusReq((f) => ({ id, start, end, n: (f?.n ?? 0) + 1 }));
  }, []);

  /** coalesce: typing bursts become one undo step; structural edits always a new step */
  const commit = useCallback((next: Script, structural = false) => {
    const now = Date.now();
    if (structural || now - lastPush.current > 1200) {
      undoStack.current.push(ref.current);
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
      redoStack.current = [];
    }
    lastPush.current = structural ? 0 : now;
    ref.current = next;
    setScript(next);
  }, []);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(ref.current);
    ref.current = prev;
    lastPush.current = 0;
    setScript(prev);
    bump((x) => x + 1);
  }, []);
  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(ref.current);
    ref.current = next;
    lastPush.current = 0;
    setScript(next);
    bump((x) => x + 1);
  }, []);

  // ---------- autosave ----------
  useEffect(() => {
    if (script === initial) return;
    setSaveState('saving');
    const t = setTimeout(() => {
      saveScript({ ...script, updatedAt: Date.now() })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, 400);
    return () => clearTimeout(t);
  }, [script, initial]);

  // flush on tab close / app switch (iPad kills background tabs)
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') saveScript({ ...ref.current, updatedAt: Date.now() });
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  // ---------- automatic version snapshots ----------
  const lastAutoVersion = useRef<Script>(initial);
  useEffect(() => {
    const t = setInterval(() => {
      if (ref.current !== lastAutoVersion.current) {
        lastAutoVersion.current = ref.current;
        saveVersion(ref.current, 'Auto-save', true);
      }
    }, AUTO_VERSION_EVERY);
    return () => clearInterval(t);
  }, []);

  const ops = useMemo(() => {
    const cur = () => ref.current;
    const mapScene = (s: Script, sceneId: string, fn: (sc: Scene) => Scene): Script => ({
      ...s,
      scenes: s.scenes.map((sc) => (sc.id === sceneId ? fn(sc) : sc)),
    });
    const findScene = (sceneId: string) => cur().scenes.find((s) => s.id === sceneId)!;

    return {
      get: cur,
      replace(next: Script) {
        commit(next, true);
      },
      update(fn: (s: Script) => Script, structural = true) {
        commit(fn(cur()), structural);
      },
      setBlockText(sceneId: string, blockId: string, text: string) {
        commit(mapScene(cur(), sceneId, (sc) => ({ ...sc, blocks: sc.blocks.map((b) => (b.id === blockId ? { ...b, text } : b)) })));
      },
      setBlockType(sceneId: string, blockId: string, type: ElementType) {
        commit(mapScene(cur(), sceneId, (sc) => ({ ...sc, blocks: sc.blocks.map((b) => (b.id === blockId ? { ...b, type } : b)) })), true);
      },
      setHeading(sceneId: string, heading: string) {
        commit(mapScene(cur(), sceneId, (sc) => ({ ...sc, heading })));
      },
      updateScene(sceneId: string, patch: Partial<Scene>, structural = false) {
        commit(mapScene(cur(), sceneId, (sc) => ({ ...sc, ...patch })), structural);
      },
      /** Split a block at caret (Enter). Returns the new block's id. */
      splitBlock(sceneId: string, blockId: string, caret: number, type: ElementType): string {
        const id = uid();
        commit(
          mapScene(cur(), sceneId, (sc) => {
            const i = sc.blocks.findIndex((b) => b.id === blockId);
            const b = sc.blocks[i];
            const before: Block = { ...b, text: b.text.slice(0, caret).trimEnd() };
            const after: Block = { id, type, text: b.text.slice(caret).trimStart() };
            return { ...sc, blocks: [...sc.blocks.slice(0, i), before, after, ...sc.blocks.slice(i + 1)] };
          }),
          true,
        );
        requestFocus(id, 0);
        return id;
      },
      insertBlock(sceneId: string, index: number, type: ElementType = 'action', text = ''): string {
        const b = newBlock(type, text);
        commit(mapScene(cur(), sceneId, (sc) => ({ ...sc, blocks: [...sc.blocks.slice(0, index), b, ...sc.blocks.slice(index)] })), true);
        requestFocus(b.id, text.length);
        return b.id;
      },
      /** Backspace at start of a block: merge into the previous block (or focus heading). */
      mergeWithPrevious(sceneId: string, blockId: string) {
        const sc = findScene(sceneId);
        const i = sc.blocks.findIndex((b) => b.id === blockId);
        const b = sc.blocks[i];
        if (i === 0) {
          if (!b.text && sc.blocks.length > 1) {
            commit(mapScene(cur(), sceneId, (s) => ({ ...s, blocks: s.blocks.filter((x) => x.id !== blockId) })), true);
          }
          requestFocus('h-' + sceneId, sc.heading.length);
          return;
        }
        const prev = sc.blocks[i - 1];
        const joinAt = prev.text.length;
        const joined = prev.text && b.text ? prev.text + ' ' + b.text : prev.text + b.text;
        commit(
          mapScene(cur(), sceneId, (s) => ({
            ...s,
            blocks: s.blocks.filter((x) => x.id !== blockId).map((x) => (x.id === prev.id ? { ...x, text: joined } : x)),
          })),
          true,
        );
        requestFocus(prev.id, joinAt + (prev.text && b.text ? 1 : 0));
      },
      addScene(afterSceneId: string | null, heading = ''): string {
        const s = cur();
        const sc = newScene(heading);
        const i = afterSceneId ? s.scenes.findIndex((x) => x.id === afterSceneId) + 1 : s.scenes.length;
        commit({ ...s, scenes: [...s.scenes.slice(0, i), sc, ...s.scenes.slice(i)] }, true);
        requestFocus('h-' + sc.id, heading.length);
        return sc.id;
      },
      /** Typing "INT. …" in an action line + Enter turns it into a new scene. */
      splitSceneAt(sceneId: string, blockId: string) {
        const s = cur();
        const si = s.scenes.findIndex((x) => x.id === sceneId);
        const sc = s.scenes[si];
        const bi = sc.blocks.findIndex((b) => b.id === blockId);
        const heading = sc.blocks[bi].text.trim();
        const rest = sc.blocks.slice(bi + 1);
        const created: Scene = { ...newScene(heading), blocks: rest.length ? rest : [newBlock('action')] };
        const kept = sc.blocks.slice(0, bi);
        const scenes = [...s.scenes];
        scenes.splice(si, 1, { ...sc, blocks: kept.length ? kept : [newBlock('action')] }, created);
        commit({ ...s, scenes }, true);
        requestFocus(created.blocks[0].id, 0);
      },
      deleteScene(sceneId: string) {
        const s = cur();
        if (s.scenes.length === 1) {
          commit({ ...s, scenes: [newScene('')] }, true);
          return;
        }
        commit({ ...s, scenes: s.scenes.filter((x) => x.id !== sceneId) }, true);
      },
      moveScene(from: number, to: number) {
        const s = cur();
        if (from === to) return;
        const scenes = [...s.scenes];
        const [m] = scenes.splice(from, 1);
        scenes.splice(to, 0, m);
        commit({ ...s, scenes }, true);
      },
    };
  }, [commit, requestFocus]);

  return {
    script,
    ops,
    saveState,
    focusReq,
    requestFocus,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  };
}

export type ScriptOps = ReturnType<typeof useScriptState>['ops'];
