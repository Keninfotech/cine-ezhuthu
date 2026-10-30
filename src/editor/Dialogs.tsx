import { useEffect, useMemo, useState } from 'react';
import type { Script, Settings, Version } from '../lib/types';
import { LANG_LABEL, REVISION_DRAFTS } from '../lib/types';
import { Modal } from '../ui/Modal';
import { useEditor } from './context';
import {
  checkCharacterConsistency, cueName, findAll, renameCharacter, replaceAll, wordCount, DEFAULT_CALIBRATION,
} from '../lib/screenplay';
import { deleteVersion, listVersions, saveVersion, storageEstimate, requestPersistence } from '../lib/db';
import { breakdownCSV, docBlob, download, printPDF, safeName, shareToWhatsApp, toFountain } from '../lib/exporters';
import { exportBackup } from '../lib/backup';

// ---------------- Find & replace ----------------

export function FindBar({ onClose }: { onClose: () => void }) {
  const { script, ops, requestFocus } = useEditor();
  const [q, setQ] = useState('');
  const [r, setR] = useState('');
  const [cs, setCs] = useState(false);
  const [i, setI] = useState(0);
  const [msg, setMsg] = useState('');
  const matches = useMemo(() => findAll(script, q, cs), [script, q, cs]);

  const go = (idx: number) => {
    if (!matches.length) return;
    const n = (idx + matches.length) % matches.length;
    setI(n);
    const m = matches[n];
    const id = m.blockId === 'heading' ? 'h-' + m.sceneId : m.blockId;
    requestFocus(id, m.index, m.index + m.length);
  };

  const replaceOne = () => {
    const m = matches[i];
    if (!m) return;
    const s = ops.get();
    const sc = s.scenes.find((x) => x.id === m.sceneId)!;
    if (m.blockId === 'heading') ops.setHeading(sc.id, sc.heading.slice(0, m.index) + r + sc.heading.slice(m.index + m.length));
    else {
      const b = sc.blocks.find((x) => x.id === m.blockId)!;
      ops.setBlockText(sc.id, b.id, b.text.slice(0, m.index) + r + b.text.slice(m.index + m.length));
    }
    setMsg('Replaced 1');
  };

  return (
    <div className="findbar" role="search">
      <input className="input" autoFocus placeholder="Find" value={q} onChange={(e) => { setQ(e.target.value); setI(0); setMsg(''); }} onKeyDown={(e) => { if (e.key === 'Enter') go(e.shiftKey ? i - 1 : i + 1); if (e.key === 'Escape') onClose(); }} aria-label="Find" />
      <span className="muted small count">{q ? (matches.length ? `${i + 1} of ${matches.length}` : 'No matches') : ''}</span>
      <button onClick={() => go(i - 1)} disabled={!matches.length} aria-label="Previous match">↑</button>
      <button onClick={() => go(i + 1)} disabled={!matches.length} aria-label="Next match">↓</button>
      <input className="input" placeholder="Replace with" value={r} onChange={(e) => setR(e.target.value)} aria-label="Replace with" />
      <button onClick={replaceOne} disabled={!matches.length}>Replace</button>
      <button onClick={() => { const res = replaceAll(ops.get(), q, r, cs); ops.replace(res.script); setMsg(`Replaced ${res.count}`); }} disabled={!matches.length}>All</button>
      <label className="small"><input type="checkbox" checked={cs} onChange={(e) => setCs(e.target.checked)} /> Aa</label>
      {msg && <span className="small ok">{msg}</span>}
      <button className="icon" onClick={onClose} aria-label="Close find">✕</button>
    </div>
  );
}

// ---------------- Characters ----------------

export function CharactersDialog({ onClose }: { onClose: () => void }) {
  const { script, ops } = useEditor();
  const [newName, setNewName] = useState('');
  const stats = useMemo(() => {
    const m = new Map<string, { lines: number; scenes: Set<number> }>();
    script.scenes.forEach((s, si) =>
      s.blocks.forEach((b) => {
        if (b.type !== 'character') return;
        const n = cueName(b.text);
        if (!n) return;
        const e = m.get(n) ?? { lines: 0, scenes: new Set() };
        e.lines++;
        e.scenes.add(si + 1);
        m.set(n, e);
      }),
    );
    return m;
  }, [script]);
  const known = new Set(script.characters.map((c) => c.name));
  const detected = [...stats.keys()].filter((n) => !known.has(n));

  const setChars = (characters: Script['characters']) => ops.update((s) => ({ ...s, characters }));

  return (
    <Modal title="Character database" onClose={onClose} wide>
      <p className="muted">Names here power auto-complete in character cues and the consistency checker.</p>
      <table className="tbl">
        <thead><tr><th>Name</th><th>Description</th><th>Speaks</th><th>Scenes</th><th /></tr></thead>
        <tbody>
          {script.characters.map((c, i) => (
            <tr key={i}>
              <td><input className="input" value={c.name} aria-label="Character name" onChange={(e) => setChars(script.characters.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td>
              <td><input className="input" value={c.description} aria-label="Description" placeholder="Age, role, look…" onChange={(e) => setChars(script.characters.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} /></td>
              <td className="num">{stats.get(c.name)?.lines ?? 0}</td>
              <td className="small">{[...(stats.get(c.name)?.scenes ?? [])].join(', ') || '—'}</td>
              <td><button className="link danger" onClick={() => setChars(script.characters.filter((_, j) => j !== i))}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) { setChars([...script.characters, { name: newName.trim(), description: '' }]); setNewName(''); } }}>
        <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add a character" aria-label="New character name" />
        <button className="primary" type="submit">Add</button>
      </form>
      {detected.length > 0 && (
        <>
          <h4>Found in the script, not in the database</h4>
          <div className="row wrap">
            {detected.map((n) => (
              <button key={n} className="chip-btn" onClick={() => setChars([...script.characters, { name: n, description: '' }])}>+ {n} <span className="muted">({stats.get(n)!.lines})</span></button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

// ---------------- Consistency ----------------

export function ConsistencyDialog({ onClose }: { onClose: () => void }) {
  const { script, ops } = useEditor();
  const issues = useMemo(() => checkCharacterConsistency(script), [script]);
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const visible = issues.filter((is) => !ignored.has(is.variants.map((v) => v.name).join('|')));

  const fix = (idx: number) => {
    const is = issues[idx];
    const target = choice[idx] ?? is.canonical;
    let s = ops.get();
    for (const v of is.variants) if (v.name !== target) s = renameCharacter(s, v.name, target);
    ops.replace(s);
  };

  return (
    <Modal title="Character name check" onClose={onClose}>
      <p className="muted">Handwriting recognition can spell a name slightly differently from scene to scene. These look like the same person.</p>
      {visible.length === 0 && <p className="ok">✓ All character names are consistent.</p>}
      {visible.map((is) => {
        const idx = issues.indexOf(is);
        const key = is.variants.map((v) => v.name).join('|');
        return (
          <div className="issue" key={key}>
            {is.variants.map((v) => (
              <label key={v.name} className="variant">
                <input type="radio" name={'c' + idx} checked={(choice[idx] ?? is.canonical) === v.name} onChange={() => setChoice({ ...choice, [idx]: v.name })} />
                <b>{v.name}</b> <span className="muted small">{v.count}× · scene {v.scenes.join(', ')}</span>
              </label>
            ))}
            <div className="row">
              <button className="primary" onClick={() => fix(idx)}>Use “{choice[idx] ?? is.canonical}” everywhere</button>
              <button onClick={() => setIgnored(new Set([...ignored, key]))}>They're different people</button>
            </div>
          </div>
        );
      })}
    </Modal>
  );
}

// ---------------- Versions ----------------

export function VersionsDialog({ onClose }: { onClose: () => void }) {
  const { script, ops } = useEditor();
  const [versions, setVersions] = useState<Version[]>([]);
  const [label, setLabel] = useState('');
  const refresh = () => listVersions(script.id).then(setVersions);
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restore = async (v: Version) => {
    await saveVersion(ops.get(), 'Before restoring “' + v.label + '”', true);
    ops.replace({ ...v.snapshot, id: script.id, updatedAt: Date.now() });
    onClose();
  };

  const summary = (s: Script) => `${s.scenes.length} scenes · ${wordCount(s)} words`;
  const diff = (s: Script) => {
    const before = new Map(s.scenes.map((x) => [x.id, JSON.stringify([x.heading, x.blocks])]));
    let changed = 0, added = 0;
    for (const x of script.scenes) {
      const b = before.get(x.id);
      if (b === undefined) added++;
      else if (b !== JSON.stringify([x.heading, x.blocks])) changed++;
    }
    const removed = s.scenes.filter((x) => !script.scenes.some((y) => y.id === x.id)).length;
    const parts = [changed && `${changed} changed`, added && `${added} added`, removed && `${removed} removed`].filter(Boolean);
    return parts.length ? 'Since then: ' + parts.join(', ') : 'Same as now';
  };

  return (
    <Modal title="Version history & Revision Tracking" onClose={onClose}>
      <div className="revision-select-section" style={{ marginBottom: 16 }}>
        <div className="lbl">Active Production Revision Draft (WGA Standard)</div>
        <p className="muted small">Sets the active revision colour badge across headings and exports.</p>
        <div className="revision-pills">
          {REVISION_DRAFTS.map((d) => (
            <button
              key={d.id}
              type="button"
              className={'revision-pill' + ((script.revisionColor ?? 'white') === d.id ? ' on' : '')}
              onClick={() => ops.update((s) => ({ ...s, revisionColor: d.id }), false)}
            >
              <span className="dot" style={{ backgroundColor: d.hex, border: d.id === 'white' ? '1px solid #ccc' : 'none' }} />
              <span>{d.name}</span>
            </button>
          ))}
        </div>
      </div>

      <form className="row" onSubmit={async (e) => { e.preventDefault(); await saveVersion(ops.get(), label.trim() || 'Draft ' + new Date().toLocaleDateString('en-IN')); setLabel(''); refresh(); }}>
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name this draft, e.g. “Blue draft”" aria-label="Version name" />
        <button className="primary" type="submit">Save version</button>
      </form>
      <p className="muted small">A snapshot is also saved automatically every 10 minutes while you write (last 30 kept).</p>
      <ul className="versions">
        {versions.length === 0 && <li className="muted">No versions yet.</li>}
        {versions.map((v) => (
          <li key={v.id}>
            <div>
              <b>{v.label}</b> {v.auto && <span className="chip">auto</span>}
              <div className="muted small">{new Date(v.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · {summary(v.snapshot)}</div>
              <div className="small">{diff(v.snapshot)}</div>
            </div>
            <div className="row">
              <button onClick={() => restore(v)}>Restore</button>
              <button className="link danger" onClick={async () => { await deleteVersion(v.id); refresh(); }}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

// ---------------- Title page ----------------

export function TitlePageDialog({ onClose }: { onClose: () => void }) {
  const { script, ops } = useEditor();
  const tp = script.titlePage;
  const set = (k: keyof Script['titlePage'], v: string) =>
    ops.update((s) => ({ ...s, title: k === 'title' ? v : s.title, titlePage: { ...s.titlePage, [k]: v } }), false);
  return (
    <Modal title="Title page" onClose={onClose}>
      <div className="form">
        <label>Title<input className="input" value={tp.title} onChange={(e) => set('title', e.target.value)} /></label>
        <label>Written by<input className="input" value={tp.writtenBy} onChange={(e) => set('writtenBy', e.target.value)} /></label>
        <label>Based on<input className="input" value={tp.basedOn} onChange={(e) => set('basedOn', e.target.value)} placeholder="Optional" /></label>
        <label>Draft / date<input className="input" value={tp.draftDate} onChange={(e) => set('draftDate', e.target.value)} /></label>
        <label>Contact<textarea className="input" rows={3} value={tp.contact} onChange={(e) => set('contact', e.target.value)} placeholder="Phone, email, agent" /></label>
      </div>
    </Modal>
  );
}

// ---------------- Export ----------------

export function ExportDialog({ onClose, sceneId }: { onClose: () => void; sceneId: string | null }) {
  const { script, settings } = useEditor();
  const [titlePage, setTitlePage] = useState(true);
  const [numbered, setNumbered] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const name = safeName(script.title);
  const sceneNo = sceneId ? script.scenes.findIndex((s) => s.id === sceneId) + 1 : 0;

  return (
    <Modal title="Export & Share Screenplay" onClose={onClose} wide>
      <div className="export-grid">
        <section>
          <h4>Screenplay Formats</h4>
          <div className="row" style={{ marginTop: 4, marginBottom: 8 }}>
            <label className="small"><input type="checkbox" checked={titlePage} onChange={(e) => setTitlePage(e.target.checked)} /> Title page</label>{' '}
            <label className="small"><input type="checkbox" checked={numbered} onChange={(e) => setNumbered(e.target.checked)} /> Scene numbers</label>
          </div>
          <div className="stack">
            <button className="primary" onClick={() => printPDF(script, { titlePage, numbered })}>
              PDF <span className="muted small">— opens print, choose “Save as PDF”</span>
            </button>
            <button onClick={() => setShowPreview((p) => !p)}>
              {showPreview ? '▲ Hide PDF Preview' : '👁 Preview Formatted PDF Screenplay'}
            </button>
            <button onClick={() => download(docBlob(script), name + '.doc')}>
              Word document (.doc)
            </button>
            <button onClick={() => download(new Blob([toFountain(script)], { type: 'text/plain;charset=utf-8' }), name + '.fountain')}>
              Fountain (.fountain) <span className="muted small">— Scrite, Final Draft, Highland</span>
            </button>
          </div>
        </section>
        <section>
          <h4>Share on WhatsApp</h4>
          <div className="stack">
            {sceneNo > 0 && <button onClick={() => shareToWhatsApp(script, [sceneId!])}>Share Scene {sceneNo}</button>}
            <button onClick={() => shareToWhatsApp(script)}>Share Whole Screenplay</button>
          </div>
          <h4>Production Breakdown</h4>
          <div className="stack">
            <button onClick={() => download(new Blob([breakdownCSV(script, settings.calibration)], { type: 'text/csv;charset=utf-8' }), name + '_breakdown.csv')}>
              Breakdown sheet (.csv) <span className="muted small">— cast, locations, pages</span>
            </button>
          </div>
        </section>

        {showPreview && (
          <section className="span2">
            <h4>PDF Screenplay Preview</h4>
            <div className="pdf-preview-wrap">
              <div className="pdf-preview-sheet" lang={script.language}>
                {titlePage && (
                  <div style={{ textAlign: 'center', marginBottom: 36, borderBottom: '1px solid #ccc', paddingBottom: 24 }}>
                    <h2 style={{ textDecoration: 'underline', textTransform: 'uppercase', marginBottom: 12 }}>
                      {script.titlePage.title || script.title}
                    </h2>
                    {script.titlePage.writtenBy && <p>Written by<br /><b>{script.titlePage.writtenBy}</b></p>}
                    {script.titlePage.basedOn && <p style={{ fontSize: 11, fontStyle: 'italic' }}>Based on: {script.titlePage.basedOn}</p>}
                    {script.titlePage.draftDate && <p style={{ fontSize: 11, color: '#555' }}>{script.titlePage.draftDate}</p>}
                    {script.titlePage.contact && <p style={{ fontSize: 10, color: '#666', whiteSpace: 'pre-wrap', marginTop: 16 }}>{script.titlePage.contact}</p>}
                  </div>
                )}
                {script.scenes.map((s, i) => (
                  <div key={s.id} style={{ marginBottom: 16 }}>
                    <p className="heading">{numbered ? `${i + 1}. ` : ''}{s.heading || 'UNTITLED SCENE'}</p>
                    {s.blocks.filter((b) => b.text.trim()).map((b) => (
                      <p key={b.id} className={b.type}>
                        {b.type === 'parenthetical' && !b.text.startsWith('(') ? `(${b.text})` : b.text}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="primary" onClick={() => printPDF(script, { titlePage, numbered })}>
                Print / Save PDF Now
              </button>
              <button onClick={() => setShowPreview(false)}>Close Preview</button>
            </div>
          </section>
        )}

        <section className="span2">
          <h4>🔒 Encrypted Backup</h4>
          <p className="muted small">
            Screenplay confidential backup: Script, versions, voice memos and photos in one file, encrypted on this device (AES-256-GCM).
            Safely store in iCloud, Google Drive, or email to yourself. Nobody can open it without your passphrase.
          </p>
          <form className="row wrap" onSubmit={async (e) => {
            e.preventDefault();
            if (pass.length < 6) return setMsg('Use at least 6 characters.');
            if (pass !== pass2) return setMsg('Passphrases don’t match.');
            setBusy(true);
            try {
              download(await exportBackup(script.id, pass), name + '.cine');
              setMsg('Backup saved safely. Keep the passphrase secure — it cannot be recovered.');
              setPass(''); setPass2('');
            } catch (err) { setMsg((err as Error).message); } finally { setBusy(false); }
          }}>
            <input className="input" type="password" autoComplete="new-password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Passphrase" />
            <input className="input" type="password" autoComplete="new-password" placeholder="Repeat passphrase" value={pass2} onChange={(e) => setPass2(e.target.value)} aria-label="Repeat passphrase" />
            <button className="primary" type="submit" disabled={busy}>{busy ? 'Encrypting…' : 'Download Backup'}</button>
          </form>
          {msg && <p className="small ok">{msg}</p>}
        </section>
      </div>
    </Modal>
  );
}

// ---------------- Settings ----------------

export function SettingsDialog({
  settings,
  onChange,
  onClose,
  onReplayWelcome,
  onOpenBenchmark,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  onReplayWelcome?: () => void;
  onOpenBenchmark?: () => void;
}) {
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    storageEstimate().then(setEst);
    navigator.storage?.persisted?.().then(setPersisted);
  }, []);
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + ' MB';
  const cal = settings.calibration;

  return (
    <Modal title="Settings & Calibration" onClose={onClose}>
      <div className="form">
        <h4>Handwriting & Recognition</h4>
        <label className="check">
          <input type="checkbox" checked={settings.onlineRecognition === 'on'} onChange={(e) => onChange({ ...settings, onlineRecognition: e.target.checked ? 'on' : 'off' })} />
          <span><b>Online recognition fallback</b><br /><span className="muted small">Used when the browser has no on-device engine for the language. Sends pen strokes (never script text) to Google's handwriting service. Native build uses ML Kit fully offline.</span></span>
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.penOnly} onChange={(e) => onChange({ ...settings, penOnly: e.target.checked })} />
          <span><b>Pen only (Apple Pencil palm rejection)</b><br /><span className="muted small">Ignore finger touches on drawing surfaces once a stylus is used.</span></span>
        </label>
        <label>Convert handwriting after pausing for
          <select className="input" value={settings.autoCommitMs} onChange={(e) => onChange({ ...settings, autoCommitMs: +e.target.value })}>
            <option value={600}>0.6 s (fast writers)</option>
            <option value={900}>0.9 s (recommended)</option>
            <option value={1400}>1.4 s</option>
            <option value={2000}>2.0 s</option>
            <option value={0}>Never — manual convert only</option>
          </select>
        </label>

        {onOpenBenchmark && (
          <div style={{ marginTop: 4 }}>
            <button type="button" className="gold" onClick={onOpenBenchmark}>
              🔬 Open Recognition Benchmark & Calibration Lab
            </button>
          </div>
        )}

        <h4>Typing & Transliteration</h4>
        <label className="check">
          <input type="checkbox" checked={settings.transliterate} onChange={(e) => onChange({ ...settings, transliterate: e.target.checked })} />
          <span><b>Manglish / Tanglish typing</b><br /><span className="muted small">Type “njaan vannu” → ഞാൻ വന്നു, “nandri” → நன்றி. Press Backspace straight after a word to keep in English.</span></span>
        </label>

        <h4>Page Count Calibration (Script-Aware)</h4>
        <p className="muted small">1 page ≈ 1 minute is calibrated for Latin scripts. Malayalam, Tamil, Telugu, and Kannada glyphs are wider, so each is weighted higher than a standard Courier character. Calibrate if your printed screenplay differs.</p>
        {(['ml', 'ta', 'te', 'kn'] as const).map((l) => (
          <label key={l} className="slider">
            {LANG_LABEL[l]} width factor: ×{(cal[l] ?? DEFAULT_CALIBRATION[l]).toFixed(2)}
            <input type="range" min={1} max={2.2} step={0.05} value={cal[l] ?? DEFAULT_CALIBRATION[l]} onChange={(e) => onChange({ ...settings, calibration: { ...cal, [l]: +e.target.value } })} />
          </label>
        ))}
        <button className="link" onClick={() => onChange({ ...settings, calibration: DEFAULT_CALIBRATION })}>Reset calibration to defaults</button>

        <h4>Community & Recognition Model</h4>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.donateHandwriting ?? false}
            onChange={(e) => onChange({ ...settings, donateHandwriting: e.target.checked })}
          />
          <span>
            <b>Contribute anonymous pen strokes to Regional Script Corpus</b>
            <br />
            <span className="muted small">
              Opt-in to improve open-source handwriting recognition models for regional cinema. Only coordinates and timing are donated; screenplay text is never shared.
            </span>
          </span>
        </label>

        <h4>Storage & Privacy</h4>
        <p className="small">All scripts, versions, voice memos and photos are stored strictly on this device (IndexedDB). Zero external telemetry.</p>
        {est && <p className="muted small">Storage usage: {mb(est.usage)} of {mb(est.quota)} available.</p>}
        {persisted === false && (
          <button onClick={async () => setPersisted(await requestPersistence())}>Protect storage from automatic browser clean-up</button>
        )}
        {persisted && <p className="ok small">✓ Storage is protected from automatic clean-up.</p>}
        {onReplayWelcome && <button className="link" onClick={onReplayWelcome}>Show the welcome tour again</button>}
      </div>
    </Modal>
  );
}
