import { createContext, useContext } from 'react';
import type { Lang, Script, Settings } from '../lib/types';
import type { FocusReq, ScriptOps } from './useScriptState';

export interface ActiveField {
  sceneId: string;
  /** block id, or "h-<sceneId>" for a heading */
  fieldId: string;
  start: number;
  end: number;
}

export interface EditorCtx {
  script: Script;
  settings: Settings;
  updateSettings: (s: Settings) => void;
  ops: ScriptOps;
  focusReq: FocusReq | null;
  requestFocus: (id: string, start: number, end?: number) => void;
  active: React.RefObject<ActiveField | null>;
  setActive: (a: ActiveField) => void;
  /** pad open → suppress on-screen keyboard so the pen can drive the caret */
  penMode: boolean;
  translit: boolean;
  lang: Lang;
  characters: string[];
  locations: string[];
}

export const Ctx = createContext<EditorCtx | null>(null);
export const useEditor = () => useContext(Ctx)!;

/** Insert text at the active field's caret. Returns the inserted range (for candidate replacement). */
export function insertAtActive(ctx: EditorCtx, text: string, opts: { smartSpace?: boolean } = {}) {
  const a = ctx.active.current;
  if (!a) return null;
  const s = ctx.ops.get();
  const scene = s.scenes.find((x) => x.id === a.sceneId);
  if (!scene) return null;
  const isHeading = a.fieldId === 'h-' + a.sceneId;
  const block = isHeading ? null : scene.blocks.find((b) => b.id === a.fieldId);
  if (!isHeading && !block) return null;
  const cur = isHeading ? scene.heading : block!.text;
  const start = Math.min(a.start, cur.length), end = Math.min(a.end, cur.length);
  let ins = text;
  if (opts.smartSpace && start > 0 && !/\s$/.test(cur.slice(0, start)) && !/^[\s.,!?;:)]/.test(ins)) ins = ' ' + ins;
  const next = cur.slice(0, start) + ins + cur.slice(end);
  if (isHeading) ctx.ops.setHeading(a.sceneId, next);
  else ctx.ops.setBlockText(a.sceneId, a.fieldId, next);
  const caret = start + ins.length;
  ctx.active.current = { ...a, start: caret, end: caret };
  ctx.requestFocus(a.fieldId, caret);
  return { sceneId: a.sceneId, fieldId: a.fieldId, start, end: caret, leading: ins.length - text.length };
}

/** Replace a previously inserted range with other text. */
export function replaceRange(ctx: EditorCtx, r: { sceneId: string; fieldId: string; start: number; end: number; leading: number }, text: string) {
  const s = ctx.ops.get();
  const scene = s.scenes.find((x) => x.id === r.sceneId);
  if (!scene) return null;
  const isHeading = r.fieldId === 'h-' + r.sceneId;
  const cur = isHeading ? scene.heading : scene.blocks.find((b) => b.id === r.fieldId)?.text;
  if (cur === undefined) return null;
  const ins = ' '.repeat(r.leading) + text;
  const next = cur.slice(0, r.start) + ins + cur.slice(r.end);
  if (isHeading) ctx.ops.setHeading(r.sceneId, next);
  else ctx.ops.setBlockText(r.sceneId, r.fieldId, next);
  const caret = r.start + ins.length;
  ctx.active.current = { sceneId: r.sceneId, fieldId: r.fieldId, start: caret, end: caret };
  ctx.requestFocus(r.fieldId, caret);
  return { ...r, end: caret };
}
