import { useState } from 'react';
import type { IdeaData, KeyMoment, LoglineTemplate, Script, StoryData, SynopsisData, TreatmentData, TreatmentScene, WritingStage } from '../lib/types';
import { uid } from '../lib/types';
import { canTransliterate, transliterateWord } from '../lib/translit';

const GENRES = [
  'Realistic Drama',
  'Crime / Thriller',
  'Feel-Good Family',
  'Action / Commercial',
  'Comedy / Satire',
  'Romance',
  'Psychological',
  'Horror / Mystery',
  'Period / Epic',
  'Indie / Art',
];

interface WritingLadderProps {
  stage: WritingStage;
  script: Script;
  translit: boolean;
  onUpdate: (updater: (s: Script) => Script) => void;
  onSelectStage: (stage: WritingStage) => void;
  onConvertToScreenplay: () => void;
}

export function WritingLadder({
  stage,
  script,
  translit,
  onUpdate,
  onSelectStage,
  onConvertToScreenplay,
}: WritingLadderProps) {
  // Transliterate on space helper for prose fields
  const handleTranslitKey = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>, setter: (val: string) => void, curVal: string) => {
    if (!translit || !canTransliterate(script.language)) return;
    if (e.key === ' ' || e.key === 'Enter') {
      const el = e.currentTarget;
      const pos = el.selectionStart ?? curVal.length;
      const textBefore = curVal.slice(0, pos);
      const match = textBefore.match(/([a-zA-Z^]+)$/);
      if (match) {
        const latin = match[1];
        const indic = transliterateWord(latin, script.language);
        if (indic !== latin) {
          e.preventDefault();
          const next = textBefore.slice(0, match.index) + indic + (e.key === 'Enter' ? '\n' : ' ') + curVal.slice(pos);
          setter(next);
        }
      }
    }
  };

  if (stage === 'idea') {
    return <IdeaStage script={script} onUpdate={onUpdate} onNext={() => onSelectStage('story')} onKey={handleTranslitKey} />;
  }

  if (stage === 'story') {
    return <StoryStage script={script} onUpdate={onUpdate} onNext={() => onSelectStage('synopsis')} onKey={handleTranslitKey} />;
  }

  if (stage === 'synopsis') {
    return <SynopsisStage script={script} onUpdate={onUpdate} onNext={() => onSelectStage('treatment')} onKey={handleTranslitKey} />;
  }

  if (stage === 'treatment') {
    return (
      <TreatmentStage
        script={script}
        onUpdate={onUpdate}
        onConvertToScreenplay={onConvertToScreenplay}
        onKey={handleTranslitKey}
      />
    );
  }

  return null;
}

// ---------------- Stage 1: Idea (The Seed) ----------------

function IdeaStage({
  script,
  onUpdate,
  onNext,
  onKey,
}: {
  script: Script;
  onUpdate: (u: (s: Script) => Script) => void;
  onNext: () => void;
  onKey: (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>, set: (v: string) => void, cur: string) => void;
}) {
  const idea: IdeaData = script.idea ?? {
    seed: '',
    genre: 'Drama',
    logline: { protagonist: '', incitingIncident: '', goal: '', conflict: '' },
    pinned: true,
  };

  const setIdea = (patch: Partial<IdeaData>) => {
    onUpdate((s) => ({
      ...s,
      idea: { ...idea, ...patch },
    }));
  };

  const setLogline = (field: keyof LoglineTemplate, val: string) => {
    onUpdate((s) => ({
      ...s,
      idea: {
        ...idea,
        logline: { ...idea.logline, [field]: val },
      },
    }));
  };

  const loglinePreview = idea.logline.protagonist
    ? `When ${idea.logline.incitingIncident || '[inciting incident]'}, ${idea.logline.protagonist} must ${idea.logline.goal || '[goal]'}, or face ${idea.logline.conflict || '[central conflict]'}.`
    : 'Fill in the building blocks below to construct your logline.';

  return (
    <div className="ladder-page">
      <header className="ladder-header">
        <div>
          <span className="ladder-badge">Stage 1 of 5</span>
          <h2>Idea · The Seed (വിത്ത് / விதை)</h2>
          <p className="muted">The foundational spark. One or two lines pinned across every subsequent stage.</p>
        </div>
        <div className="ladder-actions">
          <label className="ladder-pin-toggle" title="Keep this idea pinned as a banner across Story, Synopsis, and Screenplay">
            <input
              type="checkbox"
              checked={idea.pinned}
              onChange={(e) => setIdea({ pinned: e.target.checked })}
            />
            <span>Pin across all stages</span>
          </label>
          <button className="primary" onClick={onNext}>
            Next: Story (Kathai) →
          </button>
        </div>
      </header>

      <div className="ladder-card">
        <h3>The One-Line Seed</h3>
        <p className="muted small">Write the core premise in your language. What is this film about in simple words?</p>
        <textarea
          className="input ladder-seed-input"
          rows={3}
          value={idea.seed}
          placeholder="e.g. കനത്ത മഴയിൽ ഒറ്റപ്പെട്ടുപോകുന്ന ഒരു സ്കൂൾ ടീച്ചറും ചായക്കടക്കാരനും തമ്മിലുള്ള സൗഹൃദം."
          onChange={(e) => setIdea({ seed: e.target.value })}
          onKeyDown={(e) => onKey(e, (v) => setIdea({ seed: v }), idea.seed)}
        />

        <div className="ladder-genre-section">
          <label className="lbl">Genre Tag</label>
          <div className="genre-pills">
            {GENRES.map((g) => (
              <button
                key={g}
                type="button"
                className={'genre-pill' + (idea.genre === g ? ' on' : '')}
                onClick={() => setIdea({ genre: g })}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ladder-card">
        <h3>Logline Template</h3>
        <p className="muted small">Break down the four pillars of a cinematic premise:</p>

        <div className="form-grid-2">
          <label>
            <span className="lbl">1. Protagonist (Who is your lead?)</span>
            <input
              className="input"
              placeholder="e.g. Lakshmi, an introverted village school teacher"
              value={idea.logline.protagonist}
              onChange={(e) => setLogline('protagonist', e.target.value)}
              onKeyDown={(e) => onKey(e, (v) => setLogline('protagonist', v), idea.logline.protagonist)}
            />
          </label>
          <label>
            <span className="lbl">2. Inciting Incident (What disrupts their world?)</span>
            <input
              className="input"
              placeholder="e.g. misses the last bus home during a flash storm"
              value={idea.logline.incitingIncident}
              onChange={(e) => setLogline('incitingIncident', e.target.value)}
              onKeyDown={(e) => onKey(e, (v) => setLogline('incitingIncident', v), idea.logline.incitingIncident)}
            />
          </label>
          <label>
            <span className="lbl">3. Goal (What do they urgently want?)</span>
            <input
              className="input"
              placeholder="e.g. reach home safely across flooded roads"
              value={idea.logline.goal}
              onChange={(e) => setLogline('goal', e.target.value)}
              onKeyDown={(e) => onKey(e, (v) => setLogline('goal', v), idea.logline.goal)}
            />
          </label>
          <label>
            <span className="lbl">4. Central Conflict / Stakes (What stands in their way?)</span>
            <input
              className="input"
              placeholder="e.g. rising floodwaters and an estranged companion"
              value={idea.logline.conflict}
              onChange={(e) => setLogline('conflict', e.target.value)}
              onKeyDown={(e) => onKey(e, (v) => setLogline('conflict', v), idea.logline.conflict)}
            />
          </label>
        </div>

        <div className="logline-preview-box">
          <div className="eyebrow">Constructed Logline</div>
          <div className="logline-preview-text">{loglinePreview}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------- Stage 2: Story (Kathai) (Free Prose) ----------------

function StoryStage({
  script,
  onUpdate,
  onNext,
  onKey,
}: {
  script: Script;
  onUpdate: (u: (s: Script) => Script) => void;
  onNext: () => void;
  onKey: (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>, set: (v: string) => void, cur: string) => void;
}) {
  const story: StoryData = script.story ?? { prose: '', keyMoments: [] };
  const [newMomentTitle, setNewMomentTitle] = useState('');
  const [newMomentNote, setNewMomentNote] = useState('');
  const [addingMoment, setAddingMoment] = useState(false);

  const setStory = (patch: Partial<StoryData>) => {
    onUpdate((s) => ({ ...s, story: { ...story, ...patch } }));
  };

  const words = story.prose.split(/\s+/).filter(Boolean).length;
  const readMinutes = Math.max(1, Math.round(words / 200));

  const addKeyMoment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMomentTitle.trim()) return;
    const moment: KeyMoment = {
      id: uid(),
      title: newMomentTitle.trim(),
      note: newMomentNote.trim(),
      timeHint: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    };
    setStory({ keyMoments: [...story.keyMoments, moment] });
    setNewMomentTitle('');
    setNewMomentNote('');
    setAddingMoment(false);
  };

  const removeMoment = (id: string) => {
    setStory({ keyMoments: story.keyMoments.filter((m) => m.id !== id) });
  };

  return (
    <div className="ladder-page">
      <header className="ladder-header">
        <div>
          <span className="ladder-badge">Stage 2 of 5</span>
          <h2>Story · Kathai (കഥ / கதை)</h2>
          <p className="muted">The full tale in flowing prose, start to finish. A soft space with zero screenplay formatting.</p>
        </div>
        <div className="ladder-stats">
          <span><b>{words}</b> words</span>
          <span><b>~{readMinutes}</b> min reading time</span>
          <button className="primary" onClick={onNext}>
            Next: Synopsis →
          </button>
        </div>
      </header>

      <div className="ladder-split-layout">
        <div className="ladder-prose-container">
          <textarea
            className="input ladder-prose-editor"
            rows={22}
            value={story.prose}
            placeholder="Write the full story freely here in prose. Describe the characters, the world, the emotional arc, and the ending without worrying about sluglines or margins..."
            onChange={(e) => setStory({ prose: e.target.value })}
            onKeyDown={(e) => onKey(e, (v) => setStory({ prose: v }), story.prose)}
          />
        </div>

        <aside className="ladder-sidebar">
          <div className="sidebar-section">
            <div className="row">
              <h4>Key Moments & Beats</h4>
              <button className="link" onClick={() => setAddingMoment((v) => !v)}>
                {addingMoment ? 'Cancel' : '+ Mark Moment'}
              </button>
            </div>
            <p className="muted small">Tag pivotal plot points as scene hints for later stages.</p>

            {addingMoment && (
              <form className="form add-moment-form" onSubmit={addKeyMoment}>
                <input
                  className="input"
                  placeholder="Moment title (e.g. First meeting)"
                  value={newMomentTitle}
                  onChange={(e) => setNewMomentTitle(e.target.value)}
                  autoFocus
                />
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Note on why this is crucial..."
                  value={newMomentNote}
                  onChange={(e) => setNewMomentNote(e.target.value)}
                />
                <button className="primary small" type="submit">Save Moment</button>
              </form>
            )}

            <ul className="moment-list">
              {story.keyMoments.length === 0 && (
                <li className="muted small">No key moments marked yet. Tap &ldquo;+ Mark Moment&rdquo; as you write.</li>
              )}
              {story.keyMoments.map((m) => (
                <li key={m.id} className="moment-item">
                  <div className="moment-head">
                    <b>{m.title}</b>
                    <button className="link danger small" onClick={() => removeMoment(m.id)}>✕</button>
                  </div>
                  {m.note && <div className="moment-note">{m.note}</div>}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---------------- Stage 3: Synopsis (Free Prose with Side-by-Side Assist) ----------------

function SynopsisStage({
  script,
  onUpdate,
  onNext,
  onKey,
}: {
  script: Script;
  onUpdate: (u: (s: Script) => Script) => void;
  onNext: () => void;
  onKey: (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>, set: (v: string) => void, cur: string) => void;
}) {
  const synopsis: SynopsisData = script.synopsis ?? {
    prose: '',
    targetWords: 400,
    beats: [
      { id: uid(), name: 'Act I: Setup & Catalyst', summary: '' },
      { id: uid(), name: 'Act II: Complication & Midpoint', summary: '' },
      { id: uid(), name: 'Act III: Climax & Resolution', summary: '' },
    ],
  };

  const [splitView, setSplitView] = useState(true);

  const setSynopsis = (patch: Partial<SynopsisData>) => {
    onUpdate((s) => ({ ...s, synopsis: { ...synopsis, ...patch } }));
  };

  const words = synopsis.prose.split(/\s+/).filter(Boolean).length;
  const target = synopsis.targetWords || 400;
  const progressPct = Math.min(100, Math.round((words / target) * 100));

  const condenseFromStory = () => {
    if (!script.story?.prose) return;
    const paras = script.story.prose.split(/\n+/).filter(Boolean);
    const summary = paras.slice(0, 3).join('\n\n');
    setSynopsis({ prose: summary });
  };

  const setBeatSummary = (id: string, summary: string) => {
    setSynopsis({
      beats: synopsis.beats.map((b) => (b.id === id ? { ...b, summary } : b)),
    });
  };

  return (
    <div className="ladder-page">
      <header className="ladder-header">
        <div>
          <span className="ladder-badge">Stage 3 of 5</span>
          <h2>Synopsis · Major Beats (~1 Page)</h2>
          <p className="muted">The condensed narrative highlighting major turning points only. Target: 1 page.</p>
        </div>
        <div className="ladder-actions">
          <button
            type="button"
            className={'seg-btn' + (splitView ? ' on' : '')}
            onClick={() => setSplitView((v) => !v)}
            title="Toggle side-by-side Story reference"
          >
            📖 {splitView ? 'Hide Story Reference' : 'Split View: Compare with Story'}
          </button>
          <button className="primary" onClick={onNext}>
            Next: Treatment →
          </button>
        </div>
      </header>

      {/* Target Word Count Progress */}
      <div className="synopsis-progress-bar-container">
        <div className="row">
          <span className="small"><b>{words}</b> of {target} target words ({progressPct}%)</span>
          <span className="spacer" />
          <button className="link small" onClick={condenseFromStory} title="Auto-populate initial paragraphs from Story stage">
            🪄 Condense from Story
          </button>
        </div>
        <div className="meter-track">
          <div className="meter-fill" style={{ width: `${progressPct}%`, background: progressPct > 115 ? '#eab308' : '#22c55e' }} />
        </div>
      </div>

      <div className={'synopsis-layout' + (splitView ? ' split-on' : '')}>
        {splitView && (
          <div className="story-reference-panel">
            <div className="ref-head">
              <h4>Stage 2: Story (Kathai) Reference</h4>
              <span className="muted small">Read-only reference</span>
            </div>
            <div className="ref-body">
              {script.story?.prose ? (
                <p className="ref-text">{script.story.prose}</p>
              ) : (
                <p className="muted small">Story stage is empty. Draft your story in Stage 2 to compare here.</p>
              )}
            </div>
          </div>
        )}

        <div className="synopsis-editor-panel">
          <textarea
            className="input ladder-prose-editor"
            rows={14}
            value={synopsis.prose}
            placeholder="Write the focused one-page synopsis here. Keep the narrative punchy and spotlight the protagonist's core dilemma, turning points, and final climax..."
            onChange={(e) => setSynopsis({ prose: e.target.value })}
            onKeyDown={(e) => onKey(e, (v) => setSynopsis({ prose: v }), synopsis.prose)}
          />

          <div className="beat-markers-section">
            <h4>Major Beat Structure</h4>
            {synopsis.beats.map((b) => (
              <div key={b.id} className="beat-item">
                <span className="beat-title">{b.name}</span>
                <input
                  className="input"
                  placeholder="1-2 sentences on this beat..."
                  value={b.summary}
                  onChange={(e) => setBeatSummary(b.id, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- Stage 4: Treatment (Scene Structure & Convert to Screenplay) ----------------

function TreatmentStage({
  script,
  onUpdate,
  onConvertToScreenplay,
  onKey,
}: {
  script: Script;
  onUpdate: (u: (s: Script) => Script) => void;
  onConvertToScreenplay: () => void;
  onKey: (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>, set: (v: string) => void, cur: string) => void;
}) {
  const treatment: TreatmentData = script.treatment ?? { scenes: [] };

  const setTreatment = (patch: Partial<TreatmentData>) => {
    onUpdate((s) => ({ ...s, treatment: { ...treatment, ...patch } }));
  };

  const addSceneCard = () => {
    const card: TreatmentScene = {
      id: uid(),
      slug: `INT. SCENE ${treatment.scenes.length + 1} - DAY`,
      description: '',
      location: 'LOCATION',
      time: 'DAY',
      characters: [],
    };
    setTreatment({ scenes: [...treatment.scenes, card] });
  };

  const updateCard = (id: string, patch: Partial<TreatmentScene>) => {
    setTreatment({
      scenes: treatment.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  };

  const deleteCard = (id: string) => {
    setTreatment({
      scenes: treatment.scenes.filter((s) => s.id !== id),
    });
  };

  const moveCard = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= treatment.scenes.length) return;
    const copy = [...treatment.scenes];
    const [item] = copy.splice(index, 1);
    copy.splice(target, 0, item);
    setTreatment({ scenes: copy });
  };

  const suggestSceneBreaks = () => {
    if (!script.story?.prose) return;
    const paras = script.story.prose.split(/\n\s*\n/).filter((p) => p.trim().length > 20);
    const generated: TreatmentScene[] = paras.map((p, i) => ({
      id: uid(),
      slug: `INT. SCENE ${i + 1} - DAY`,
      description: p.trim(),
      location: 'LOCATION',
      time: 'DAY',
      characters: [],
    }));
    setTreatment({ scenes: generated });
  };

  return (
    <div className="ladder-page">
      <header className="ladder-header">
        <div>
          <span className="ladder-badge">Stage 4 of 5</span>
          <h2>Treatment · Scene Structure (காட்சி வரிசை)</h2>
          <p className="muted">The story broken scene by scene in prose. Order now matters. Tag characters and locations.</p>
        </div>
        <div className="ladder-actions">
          <button className="link" onClick={suggestSceneBreaks} title="Split Story paragraphs into Treatment scene cards">
            ⚡ Suggest Scene Breaks
          </button>
          <button className="primary" onClick={onConvertToScreenplay} title="Generate Stage 5 Screenplay scenes from this treatment">
            🚀 Convert to Screenplay →
          </button>
        </div>
      </header>

      <div className="treatment-toolbar">
        <button className="primary" onClick={addSceneCard}>
          + Add Treatment Scene
        </button>
        <span className="muted small">{treatment.scenes.length} scene cards</span>
      </div>

      <div className="treatment-card-list">
        {treatment.scenes.length === 0 && (
          <div className="empty-treatment-card">
            <p>No treatment scenes yet.</p>
            <p className="muted small">
              Tap &ldquo;+ Add Treatment Scene&rdquo; or &ldquo;Suggest Scene Breaks&rdquo; to auto-generate cards from your Story stage.
            </p>
          </div>
        )}

        {treatment.scenes.map((sc, index) => (
          <div key={sc.id} className="treatment-card">
            <div className="treatment-card-head">
              <span className="treatment-number">#{index + 1}</span>
              <input
                className="input treatment-slug-input"
                value={sc.slug}
                placeholder="INT. LOCATION - DAY"
                onChange={(e) => updateCard(sc.id, { slug: e.target.value })}
                onKeyDown={(e) => onKey(e, (v) => updateCard(sc.id, { slug: v }), sc.slug)}
              />
              <div className="treatment-order-btns">
                <button
                  type="button"
                  className="icon small"
                  disabled={index === 0}
                  onClick={() => moveCard(index, -1)}
                  title="Move Up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon small"
                  disabled={index === treatment.scenes.length - 1}
                  onClick={() => moveCard(index, 1)}
                  title="Move Down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="link danger small"
                  onClick={() => deleteCard(sc.id)}
                  title="Delete Card"
                >
                  ✕
                </button>
              </div>
            </div>

            <textarea
              className="input treatment-desc-input"
              rows={3}
              placeholder="Prose description of the scene's emotional beat, physical action, and character exchange..."
              value={sc.description}
              onChange={(e) => updateCard(sc.id, { description: e.target.value })}
              onKeyDown={(e) => onKey(e, (v) => updateCard(sc.id, { description: v }), sc.description)}
            />

            <div className="treatment-meta-row">
              <label className="meta-label">
                <span>Location:</span>
                <input
                  className="input small"
                  placeholder="e.g. Chai Shop"
                  value={sc.location}
                  onChange={(e) => updateCard(sc.id, { location: e.target.value })}
                />
              </label>

              <label className="meta-label">
                <span>Time:</span>
                <input
                  className="input small"
                  placeholder="e.g. Morning"
                  value={sc.time}
                  onChange={(e) => updateCard(sc.id, { time: e.target.value })}
                />
              </label>

              <label className="meta-label chars">
                <span>Characters:</span>
                <input
                  className="input small"
                  placeholder="Comma-separated (e.g. Ramu, Lakshmi)"
                  value={sc.characters.join(', ')}
                  onChange={(e) =>
                    updateCard(sc.id, {
                      characters: e.target.value.split(',').map((c) => c.trim()).filter(Boolean),
                    })
                  }
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
