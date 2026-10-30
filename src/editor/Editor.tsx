import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ElementType, Script, Settings } from '../lib/types';
import { LANG_NATIVE } from '../lib/types';
import { allCharacters, allLocations, checkCharacterConsistency, eighths, ELEMENT_LABEL, pageCount, wordCount } from '../lib/screenplay';
import { saveVersion, persistent } from '../lib/db';
import { canTransliterate } from '../lib/translit';
import { useScriptState } from './useScriptState';
import { Ctx, type ActiveField, type EditorCtx } from './context';
import { SceneView } from './ScriptPage';
import { HandwritingPad } from './HandwritingPad';
import { ScenePanel } from './ScenePanel';
import { Board, Navigator } from './Scenes';
import { CharactersDialog, ConsistencyDialog, ExportDialog, FindBar, SettingsDialog, TitlePageDialog, VersionsDialog } from './Dialogs';
import { BenchmarkDialog } from './BenchmarkDialog';

type DialogName = 'characters' | 'check' | 'versions' | 'export' | 'title' | 'settings' | 'benchmark' | null;

const TOOL_TYPES: ElementType[] = ['action', 'character', 'parenthetical', 'dialogue', 'transition'];
const isTouch = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export function Editor({ initial, settings, onSettings, onBack }: { initial: Script; settings: Settings; onSettings: (s: Settings) => void; onBack: () => void }) {
  const { script, ops, saveState, focusReq, requestFocus, undo, redo, canUndo, canRedo } = useScriptState(initial);
  const active = useRef<ActiveField | null>(null);
  const [activeIds, setActiveIds] = useState<{ sceneId: string; fieldId: string } | null>(null);
  const [view, setView] = useState<'write' | 'board'>('write');
  const [padOpen, setPadOpen] = useState(isTouch);
  const [panelOpen, setPanelOpen] = useState(!isTouch && window.innerWidth > 1180);
  const [navOpen, setNavOpen] = useState(window.innerWidth > 900);
  const [findOpen, setFindOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [translit, setTranslit] = useState(settings.transliterate);
  const [savedFlash, setSavedFlash] = useState('');

  useEffect(() => setTranslit(settings.transliterate), [settings.transliterate]);

  const setActive = useCallback((a: ActiveField) => {
    active.current = a;
    setActiveIds((prev) => (prev?.fieldId === a.fieldId && prev.sceneId === a.sceneId ? prev : { sceneId: a.sceneId, fieldId: a.fieldId }));
  }, []);

  const characters = useMemo(() => allCharacters(script), [script]);
  const locations = useMemo(() => allLocations(script), [script]);
  const pc = useMemo(() => pageCount(script, settings.calibration), [script, settings.calibration]);
  const pagesPerScene = useMemo(() => pc.perScene.map(eighths), [pc]);
  const issues = useMemo(() => checkCharacterConsistency(script).length, [script]);
  const words = useMemo(() => wordCount(script), [script]);

  const ctx: EditorCtx = {
    script, settings, updateSettings: onSettings, ops, focusReq, requestFocus, active, setActive,
    penMode: padOpen, translit, lang: script.language, characters, locations,
  };

  const activeSceneId = activeIds?.sceneId ?? script.scenes[0]?.id ?? null;
  const activeSceneIdx = script.scenes.findIndex((s) => s.id === activeSceneId);
  const activeScene = activeSceneIdx >= 0 ? script.scenes[activeSceneIdx] : null;
  const activeBlock = activeScene?.blocks.find((b) => b.id === activeIds?.fieldId) ?? null;
  const onHeading = !!activeIds && activeIds.fieldId === 'h-' + activeIds.sceneId;

  const jump = (sceneId: string) => {
    setView('write');
    requestAnimationFrame(() => {
      document.getElementById('scene-' + sceneId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const sc = ops.get().scenes.find((s) => s.id === sceneId);
      if (sc) {
        setActive({ sceneId, fieldId: 'h-' + sceneId, start: sc.heading.length, end: sc.heading.length });
        if (!isTouch) requestFocus('h-' + sceneId, sc.heading.length);
      }
    });
  };

  const setType = (t: ElementType | 'heading') => {
    const a = active.current;
    if (!a) return;
    const sc = ops.get().scenes.find((s) => s.id === a.sceneId);
    if (!sc) return;
    if (t === 'heading') {
      // new scene after the current one
      ops.addScene(sc.id, '');
      return;
    }
    if (a.fieldId === 'h-' + sc.id) {
      const id = ops.insertBlock(sc.id, 0, t);
      setActive({ sceneId: sc.id, fieldId: id, start: 0, end: 0 });
      return;
    }
    ops.setBlockType(sc.id, a.fieldId, t);
    requestFocus(a.fieldId, a.start, a.end);
  };

  // global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !(e.target as HTMLElement).closest('.modal, .findbar')) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (k === 'y') {
        e.preventDefault();
        redo();
      } else if (k === 'f') {
        e.preventDefault();
        setFindOpen(true);
      } else if (k === 's') {
        e.preventDefault();
        saveVersion(ops.get(), 'Saved ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })).then(() => {
          setSavedFlash('Version saved');
          setTimeout(() => setSavedFlash(''), 1800);
        });
      } else if (k === 'e' && e.shiftKey) {
        e.preventDefault();
        setPadOpen((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, ops]);

  const keep = (e: React.PointerEvent) => e.preventDefault(); // keep caret in the text while tapping tools

  return (
    <Ctx.Provider value={ctx}>
      <div className={'editor' + (padOpen ? ' pad-open' : '') + (navOpen ? ' nav-open' : '') + (panelOpen && view === 'write' ? ' panel-open' : '')}>
        <header className="topbar">
          <button className="icon" onClick={onBack} aria-label="Back to library" title="Library">‹</button>
          <button className="icon" onClick={() => setNavOpen((v) => !v)} aria-label="Toggle scene list" title="Scenes">☰</button>
          <button className="title-btn" onClick={() => setDialog('title')} title="Edit title page">
            <span className="t">{script.title || 'Untitled'}</span>
            <span className="lang">{LANG_NATIVE[script.language]}</span>
          </button>
          <div className="seg view-toggle" role="tablist">
            <button role="tab" aria-selected={view === 'write'} className={view === 'write' ? 'on' : ''} onClick={() => setView('write')}>Script</button>
            <button role="tab" aria-selected={view === 'board'} className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>Cards</button>
          </div>
          <div className="spacer" />
          <button className="icon" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)">↶</button>
          <button className="icon" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (⇧⌘Z)">↷</button>
          <button className="icon" onClick={() => setFindOpen((v) => !v)} aria-label="Find and replace" title="Find & replace (⌘F)">⌕</button>
          <button className="tb" onClick={() => setDialog('characters')}>Characters</button>
          <button className="tb" onClick={() => setDialog('check')}>Check{issues > 0 && <span className="badge">{issues}</span>}</button>
          <button className="tb" onClick={() => setDialog('versions')}>Versions</button>
          <button className="tb gold" onClick={() => setDialog('benchmark')} title="Handwriting recognition benchmark & calibration">🔬 HWR Lab</button>
          <button className="tb primary" onClick={() => setDialog('export')}>Export</button>
          <button className="icon" onClick={() => setDialog('settings')} aria-label="Settings" title="Settings">⚙</button>
        </header>

        {view === 'write' && (
          <div className="elbar" role="toolbar" aria-label="Screenplay element">
            <button onPointerDown={keep} onClick={() => setType('heading')} title="New scene">+ Scene</button>
            {TOOL_TYPES.map((t, i) => (
              <button key={t} onPointerDown={keep} className={!onHeading && activeBlock?.type === t ? 'on' : ''} onClick={() => setType(t)} title={`${ELEMENT_LABEL[t]} (⌘${i + 1})`}>
                {ELEMENT_LABEL[t]}
              </button>
            ))}
            {onHeading && <span className="muted small">Scene heading</span>}
            <div className="spacer" />
            {canTransliterate(script.language) && (
              <button onPointerDown={keep} className={'translit' + (translit ? ' on' : '')} onClick={() => setTranslit((v) => !v)} title="Manglish/Tanglish typing" aria-pressed={translit}>
                {script.language === 'ml' ? 'അ' : 'அ'} ← a
              </button>
            )}
            <button onPointerDown={keep} className={'pen-toggle' + (padOpen ? ' on' : '')} onClick={() => setPadOpen((v) => !v)} aria-pressed={padOpen} title="Handwriting pad (⇧⌘E)">
              ✍ Write by hand
            </button>
            <button onPointerDown={keep} className={panelOpen ? 'on' : ''} onClick={() => setPanelOpen((v) => !v)} aria-pressed={panelOpen}>Scene notes</button>
          </div>
        )}

        {findOpen && <FindBar onClose={() => setFindOpen(false)} />}

        <div className="workspace">
          {navOpen && <Navigator activeSceneId={activeSceneId} pages={pagesPerScene} onJump={(s) => jump(s.id)} />}
          <main className="main">
            {view === 'write' ? (
              <div className="page" lang={script.language}>
                {script.scenes.map((s, i) => (
                  <SceneView key={s.id} scene={s} number={i + 1} pages={pagesPerScene[i]} />
                ))}
              </div>
            ) : (
              <Board pages={pagesPerScene} onOpen={(s) => jump(s.id)} />
            )}
          </main>
          {panelOpen && view === 'write' && activeScene && (
            <ScenePanel scene={activeScene} number={activeSceneIdx + 1} pages={pagesPerScene[activeSceneIdx]} onClose={() => setPanelOpen(false)} />
          )}
        </div>

        {padOpen && view === 'write' && <HandwritingPad onClose={() => setPadOpen(false)} />}

        <footer className="status">
          <span>{script.scenes.length} scenes</span>
          <span title="Estimated with script-aware calibration">≈ {pc.pages.toFixed(1)} pages · ~{Math.max(1, pc.minutes)} min</span>
          <span>{words.toLocaleString('en-IN')} words</span>
          <span className="spacer" />
          {persistent ? (
            <span className={'save ' + saveState}>{savedFlash || (saveState === 'saved' ? '✓ Saved on this device' : saveState === 'saving' ? 'Saving…' : '⚠ Not saved')}</span>
          ) : (
            <span className="save error" title="This browser blocked storage here. Export or back up before closing.">⚠ Preview mode — not stored after closing</span>
          )}
        </footer>

        {dialog === 'characters' && <CharactersDialog onClose={() => setDialog(null)} />}
        {dialog === 'check' && <ConsistencyDialog onClose={() => setDialog(null)} />}
        {dialog === 'versions' && <VersionsDialog onClose={() => setDialog(null)} />}
        {dialog === 'export' && <ExportDialog onClose={() => setDialog(null)} sceneId={activeSceneId} />}
        {dialog === 'title' && <TitlePageDialog onClose={() => setDialog(null)} />}
        {dialog === 'settings' && (
          <SettingsDialog
            settings={settings}
            onChange={onSettings}
            onClose={() => setDialog(null)}
            onOpenBenchmark={() => setDialog('benchmark')}
          />
        )}
        {dialog === 'benchmark' && <BenchmarkDialog onClose={() => setDialog(null)} />}
      </div>
    </Ctx.Provider>
  );
}
