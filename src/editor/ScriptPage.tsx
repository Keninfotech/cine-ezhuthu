import { memo, useState } from 'react';
import type { Block, ElementType, Scene, Stroke } from '../lib/types';
import { cycleType, nextType, parseHeading, ELEMENT_LABEL } from '../lib/screenplay';
import { transliterate, canTransliterate } from '../lib/translit';
import { pickRecognizer } from '../lib/recognizer';
import { isScratchOut, applyScratch } from '../lib/ink';
import { useEditor } from './context';
import { Field } from './Field';
import { InkCanvas } from './InkCanvas';
import { Modal } from '../ui/Modal';

const TIME_OPTIONS: Record<string, string[]> = {
  ml: ['പകൽ', 'രാത്രി', 'രാവിലെ', 'വൈകുന്നേരം', 'DAY', 'NIGHT', 'CONTINUOUS'],
  ta: ['பகல்', 'இரவு', 'காலை', 'மாலை', 'DAY', 'NIGHT', 'CONTINUOUS'],
  en: ['DAY', 'NIGHT', 'MORNING', 'EVENING', 'CONTINUOUS', 'LATER'],
};

const SCENE_START = /^(INT|EXT|I\/E|INT\.?\/EXT)[.\s]/i;
const SHORTCUT_TYPES: ElementType[] = ['action', 'character', 'parenthetical', 'dialogue', 'transition'];
const INK_COLORS = ['#1a1a2e', '#294B9B', '#E20A91', '#C5A253'];

export function fieldOrder(scenes: Scene[]): string[] {
  const ids: string[] = [];
  for (const s of scenes) {
    ids.push('h-' + s.id);
    for (const b of s.blocks) ids.push(b.id);
  }
  return ids;
}

function useNeighbours() {
  const { ops, requestFocus } = useEditor();
  return (id: string, dir: -1 | 1) => {
    const s = ops.get();
    const order = fieldOrder(s.scenes);
    const i = order.indexOf(id) + dir;
    if (i < 0 || i >= order.length) return false;
    const target = order[i];
    const len = target.startsWith('h-')
      ? s.scenes.find((x) => 'h-' + x.id === target)!.heading.length
      : s.scenes.flatMap((x) => x.blocks).find((b) => b.id === target)!.text.length;
    requestFocus(target, dir < 0 ? len : 0);
    return true;
  };
}

/** latin-typed prefixes still match Malayalam/Tamil names ("laksh" → ലക്ഷ്മി) */
function matcher(lang: string) {
  return (value: string, candidate: string) => {
    const v = value.trim().toLowerCase();
    if (!v) return true;
    if (candidate.toLowerCase().startsWith(v)) return candidate !== value;
    if ((lang === 'ml' || lang === 'ta') && canTransliterate(lang) && /[a-z]/i.test(v)) {
      const t = transliterate(value.trim(), lang).replace(/[്്ംൻൽർൾൺ]$/, '');
      return t.length > 0 && candidate.startsWith(t);
    }
    return false;
  };
}

const BlockView = memo(function BlockView({ scene, block, index }: { scene: Scene; block: Block; index: number }) {
  const ctx = useEditor();
  const { ops } = ctx;
  const move = useNeighbours();
  const match = matcher(ctx.lang);

  const suggestions =
    block.type === 'character'
      ? (v: string) => ctx.characters.filter((c) => match(v, c))
      : block.type === 'transition'
        ? (v: string) => ['CUT TO:', 'DISSOLVE TO:', 'FADE OUT.', 'SMASH CUT TO:', 'MATCH CUT TO:', 'FADE IN:'].filter((c) => match(v, c))
        : undefined;

  return (
    <div className={'block-row t-' + block.type}>
      {block.type === 'parenthetical' && <span className="paren">(</span>}
      <Field
        id={block.id}
        sceneId={scene.id}
        value={block.text}
        className={'el el-' + block.type}
        ariaLabel={ELEMENT_LABEL[block.type]}
        placeholder={index === 0 && !block.text && scene.blocks.length === 1 ? 'Write the action… (Tab changes element)' : ELEMENT_LABEL[block.type]}
        showLangTag={block.type === 'dialogue'}
        suggestions={suggestions}
        translitSkip={block.type === 'transition' ? () => true : undefined}
        autoWidth={block.type === 'parenthetical'}
        onChange={(v) => ops.setBlockText(scene.id, block.id, v)}
        onKeyDown={(e, t, accept) => {
          const mod = e.metaKey || e.ctrlKey;
          if (mod && /^[1-5]$/.test(e.key)) {
            e.preventDefault();
            ops.setBlockType(scene.id, block.id, SHORTCUT_TYPES[+e.key - 1]);
            return;
          }
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (accept()) return;
            const text = t.value;
            if (block.type === 'action' && SCENE_START.test(text.trim()) && !text.includes('\n')) {
              ops.splitSceneAt(scene.id, block.id);
              return;
            }
            if (!text.trim() && block.type !== 'action') {
              ops.setBlockType(scene.id, block.id, 'action');
              return;
            }
            ops.splitBlock(scene.id, block.id, t.selectionStart, nextType(block.type));
            return;
          }
          if (e.key === 'Tab') {
            e.preventDefault();
            ops.setBlockType(scene.id, block.id, cycleType(block.type, e.shiftKey));
            return;
          }
          if (e.key === 'Backspace' && t.selectionStart === 0 && t.selectionEnd === 0) {
            e.preventDefault();
            if (!t.value && block.type !== 'action') ops.setBlockType(scene.id, block.id, 'action');
            else ops.mergeWithPrevious(scene.id, block.id);
            return;
          }
          if (e.key === 'ArrowUp' && t.selectionStart === 0 && t.selectionEnd === 0) {
            if (move(block.id, -1)) e.preventDefault();
          }
          if (e.key === 'ArrowDown' && t.selectionStart === t.value.length) {
            if (move(block.id, 1)) e.preventDefault();
          }
        }}
      />
      {block.type === 'parenthetical' && <span className="paren">)</span>}
    </div>
  );
});

export const SceneView = memo(function SceneView({ scene, number, pages }: { scene: Scene; number: number; pages: string }) {
  const ctx = useEditor();
  const { ops } = ctx;
  const move = useNeighbours();
  const match = matcher(ctx.lang);

  const [inkOpen, setInkOpen] = useState(false);
  const [inkColor, setInkColor] = useState(INK_COLORS[0]);
  const [penWidth, setPenWidth] = useState(3.0);
  const [converting, setConverting] = useState(false);
  const [reviewModal, setReviewModal] = useState<{
    text: string;
    cands: string[];
    blockType: ElementType;
  } | null>(null);
  const [convError, setConvError] = useState<string | null>(null);

  const headingSuggestions = (v: string) => {
    const up = v.toUpperCase();
    if (!/^(INT|EXT|I\/E)\.?(\/EXT\.?)?\s/i.test(v)) return ['INT. ', 'EXT. ', 'INT./EXT. '].filter((x) => x.startsWith(up) && x !== up);
    const h = parseHeading(v);
    const prefix = v.match(/^\S+\s+/)![0];
    if (/\s[-–—]\s*\S*$/.test(v)) {
      const partial = v.replace(/^.*[-–—]\s*/, '');
      const base = v.slice(0, v.length - partial.length);
      return TIME_OPTIONS[ctx.lang].filter((t) => match(partial, t)).map((t) => base + t);
    }
    return ctx.locations.filter((l) => l !== h.location && match(h.location, l)).map((l) => prefix + l + ' - ');
  };

  const handleStroke = (s: Stroke) => {
    const cur = scene.ink || [];
    if (isScratchOut(s, cur)) {
      ops.updateScene(scene.id, { ink: applyScratch(s, cur) }, true);
      return;
    }
    ops.updateScene(scene.id, { ink: [...cur, s] }, true);
  };

  const convertSceneInk = async () => {
    if (!scene.ink?.length) return;
    setConverting(true);
    setConvError(null);
    try {
      const rec = await pickRecognizer(ctx.lang, true);
      const res = await rec.recognize(scene.ink, ctx.lang, { width: 800, height: 300 });
      const top = res.candidates[0] ?? '';
      if (!top) {
        setConvError('Could not recognize handwriting — try writing with slightly larger strokes.');
        return;
      }
      setReviewModal({
        text: top,
        cands: res.candidates,
        blockType: 'action',
      });
    } catch (err) {
      setConvError((err as Error).message);
    } finally {
      setConverting(false);
    }
  };

  const commitConvertedText = () => {
    if (!reviewModal) return;
    const { text, blockType } = reviewModal;
    if (text.trim()) {
      ops.insertBlock(scene.id, scene.blocks.length, blockType, text.trim());
    }
    setReviewModal(null);
  };

  return (
    <section className="scene" data-scene-id={scene.id} id={'scene-' + scene.id}>
      <div className="scene-head">
        <span className="scene-num" aria-hidden>{number}</span>
        <Field
          id={'h-' + scene.id}
          sceneId={scene.id}
          value={scene.heading}
          className="el el-heading"
          ariaLabel={`Scene ${number} heading`}
          placeholder="INT. LOCATION - DAY"
          suggestions={headingSuggestions}
          onChange={(v) => ops.setHeading(scene.id, v)}
          onKeyDown={(e, t, accept) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (accept()) return;
              if (scene.blocks.length) ctx.requestFocus(scene.blocks[0].id, 0);
              else ops.insertBlock(scene.id, 0);
              return;
            }
            if (e.key === 'Tab') {
              e.preventDefault();
              accept(false);
              return;
            }
            if (e.key === 'Backspace' && !t.value && scene.blocks.every((b) => !b.text)) {
              const s = ops.get();
              const i = s.scenes.findIndex((x) => x.id === scene.id);
              if (i > 0) {
                e.preventDefault();
                const prev = s.scenes[i - 1];
                const last = prev.blocks[prev.blocks.length - 1];
                ops.deleteScene(scene.id);
                if (last) ctx.requestFocus(last.id, last.text.length);
              }
              return;
            }
            if (e.key === 'ArrowUp' && t.selectionStart === 0) {
              if (move('h-' + scene.id, -1)) e.preventDefault();
            }
            if (e.key === 'ArrowDown' && t.selectionStart === t.value.length) {
              if (move('h-' + scene.id, 1)) e.preventDefault();
            }
          }}
        />
        <div className="scene-actions">
          <button
            className={'scene-ink-btn' + (inkOpen ? ' on' : '')}
            onClick={() => setInkOpen((v) => !v)}
            title="Draft this scene using Apple Pencil or stylus"
          >
            ✍ Ink Draft {scene.ink?.length ? `(${scene.ink.length})` : ''}
          </button>
          <span className="scene-len" title="Length in eighths of a page">{pages}</span>
        </div>
      </div>

      {inkOpen && (
        <div className="scene-ink-draft" role="region" aria-label={`Scene ${number} handwriting draft`}>
          <div className="scene-ink-draft-head">
            <div className="swatches">
              {INK_COLORS.map((c) => (
                <button
                  key={c}
                  className={'swatch' + (c === inkColor ? ' on' : '')}
                  style={{ background: c }}
                  onClick={() => setInkColor(c)}
                  aria-label={'Pen color ' + c}
                />
              ))}
              <div className="seg">
                <button
                  type="button"
                  className={penWidth === 2.2 ? 'on' : ''}
                  onClick={() => setPenWidth(2.2)}
                >
                  Fine
                </button>
                <button
                  type="button"
                  className={penWidth === 3.2 ? 'on' : ''}
                  onClick={() => setPenWidth(3.2)}
                >
                  Med
                </button>
                <button
                  type="button"
                  className={penWidth === 4.5 ? 'on' : ''}
                  onClick={() => setPenWidth(4.5)}
                >
                  Bold
                </button>
              </div>
            </div>
            <div className="row" style={{ marginTop: 0 }}>
              <button
                className="link"
                onClick={() => ops.updateScene(scene.id, { ink: (scene.ink || []).slice(0, -1) }, true)}
                disabled={!scene.ink?.length}
              >
                ↶ Undo stroke
              </button>
              <button
                className="link danger"
                onClick={() => ops.updateScene(scene.id, { ink: [] }, true)}
                disabled={!scene.ink?.length}
              >
                Clear ink
              </button>
              <button
                className="primary"
                onClick={convertSceneInk}
                disabled={!scene.ink?.length || converting}
              >
                {converting ? 'Reading ink…' : '⚡ Convert Ink to Text'}
              </button>
            </div>
          </div>
          {convError && <p className="err small" style={{ margin: '4px 0' }}>{convError}</p>}
          <InkCanvas
            key={scene.id}
            className="scene-ink-canvas"
            ariaLabel={`Scene ${number} handwriting canvas`}
            strokes={scene.ink || []}
            guides
            logicalWidth={800}
            color={inkColor}
            width={penWidth}
            penOnly={ctx.settings.penOnly}
            onStroke={handleStroke}
          />
          <p className="muted small" style={{ margin: '6px 0 0' }}>
            Write dialogue or action freely with your stylus. Strokes are saved locally with this scene and can be converted to editable text at any time.
          </p>
        </div>
      )}

      {scene.blocks.map((b, i) => (
        <BlockView key={b.id} scene={scene} block={b} index={i} />
      ))}
      <button className="add-scene" onClick={() => ops.addScene(scene.id)} aria-label="Add scene after this one">
        + scene
      </button>

      {reviewModal && (
        <Modal title="Review & Insert Recognized Screenplay Text" onClose={() => setReviewModal(null)}>
          <div className="form">
            <p className="muted small">
              Verify and correct the recognized text before adding it into Scene {number}. Your original handwriting ink will remain safely preserved.
            </p>
            <label>
              Screenplay Element Type:
              <select
                className="input"
                value={reviewModal.blockType}
                onChange={(e) => setReviewModal({ ...reviewModal, blockType: e.target.value as ElementType })}
              >
                {SHORTCUT_TYPES.map((t) => (
                  <option key={t} value={t}>{ELEMENT_LABEL[t]}</option>
                ))}
              </select>
            </label>
            <label>
              Recognized Content (editable):
              <textarea
                className="input"
                rows={3}
                value={reviewModal.text}
                onChange={(e) => setReviewModal({ ...reviewModal, text: e.target.value })}
              />
            </label>
            {reviewModal.cands.length > 1 && (
              <div>
                <span className="lbl">Alternative candidates:</span>
                <div className="row wrap">
                  {reviewModal.cands.slice(0, 6).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={'chip-btn' + (c === reviewModal.text ? ' primary' : '')}
                      onClick={() => setReviewModal({ ...reviewModal, text: c })}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="row">
              <button className="primary" onClick={commitConvertedText}>
                ✓ Insert into Scene
              </button>
              <button onClick={() => setReviewModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
});
