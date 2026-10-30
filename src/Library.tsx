import { useEffect, useRef, useState } from 'react';
import type { Lang, Script } from './lib/types';
import { LANG_NATIVE } from './lib/types';
import { deleteScript, listScripts, saveScript, persistent } from './lib/db';
import { emptyScript, sampleScript } from './lib/sample';
import { importBackup } from './lib/backup';
import { Modal } from './ui/Modal';
import { pageCount, DEFAULT_CALIBRATION } from './lib/screenplay';

export function Library({ onOpen, onSettings }: { onOpen: (id: string) => void; onSettings: () => void }) {
  const [scripts, setScripts] = useState<Script[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [lang, setLang] = useState<Lang>('ml');
  const [restore, setRestore] = useState<File | null>(null);
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState<Script | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => listScripts().then(setScripts);
  useEffect(() => {
    refresh();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const s = emptyScript(title.trim() || 'Untitled', lang);
    await saveScript(s);
    onOpen(s.id);
  };

  const openSample = async () => {
    const s = sampleScript();
    await saveScript(s);
    onOpen(s.id);
  };

  return (
    <div className="library">
      <header className="lib-head">
        <div className="brand">
          <span className="logo" aria-hidden>✒</span>
          <div>
            <h1>Cine Ezhuthu <span className="brand-ml">സിനി എഴുത്ത് · సినీ எழுத்து</span></h1>
            <p className="muted">For screenplay writers and directors. Same language in, same language out.</p>
          </div>
        </div>
        <button className="icon" onClick={onSettings} aria-label="Settings">⚙</button>
      </header>

      <div className="lib-actions">
        <button className="primary big" onClick={() => setCreating(true)}>+ New script</button>
        <button onClick={openSample}>Open sample script</button>
        <button onClick={() => fileRef.current?.click()}>Restore backup…</button>
        <input ref={fileRef} type="file" accept=".cine,application/octet-stream" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setRestore(f); setErr(''); setPass(''); } e.target.value = ''; }} />
      </div>

      {scripts === null ? null : scripts.length === 0 ? (
        <div className="empty">
          <p>No scripts yet.</p>
          <p className="muted">Start a new one, or open the sample to see how it works.</p>
        </div>
      ) : (
        <ul className="script-list">
          {scripts.map((s) => {
            const pages = pageCount(s, DEFAULT_CALIBRATION).pages;
            return (
              <li key={s.id} className="script-card">
                <button className="open" onClick={() => onOpen(s.id)}>
                  <span className="st">{s.title || 'Untitled'}</span>
                  <span className="muted small">
                    {LANG_NATIVE[s.language]} · {s.scenes.length} scenes · ≈{pages.toFixed(1)} pages · edited {new Date(s.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </button>
                <button className="link danger" onClick={() => setConfirmDel(s)} aria-label={'Delete ' + s.title}>Delete</button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="privacy">🔒 Your scripts never leave this device unless you export them.</p>
      {!persistent && <p className="privacy err">This browser is blocking storage here, so scripts live only until you close the page. Install or open the app normally to keep your work.</p>}

      {creating && (
        <Modal title="New script" onClose={() => setCreating(false)}>
          <form className="form" onSubmit={create}>
            <label>Title<input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. മഴക്കാലം" /></label>
            <div className="lbl">Writing language</div>
            <div className="seg big">
              {(['ml', 'ta', 'te', 'kn', 'en'] as Lang[]).map((l) => (
                <button type="button" key={l} className={l === lang ? 'on' : ''} onClick={() => setLang(l)} aria-pressed={l === lang}>{LANG_NATIVE[l]}</button>
              ))}
            </div>
            <p className="muted small">Same language in, same language out — nothing is translated. English words inside dialogue are fine.</p>
            <button className="primary" type="submit">Create</button>
          </form>
        </Modal>
      )}

      {restore && (
        <Modal title="Restore encrypted backup" onClose={() => setRestore(null)}>
          <form className="form" onSubmit={async (e) => {
            e.preventDefault();
            try {
              const s = await importBackup(restore, pass);
              setRestore(null);
              onOpen(s.id);
            } catch (x) { setErr((x as Error).message); }
          }}>
            <p className="small">{restore.name}</p>
            <label>Passphrase<input className="input" type="password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} /></label>
            {err && <p className="err small">{err}</p>}
            <p className="muted small">The script is restored as a new copy; nothing on this device is overwritten.</p>
            <button className="primary" type="submit">Restore</button>
          </form>
        </Modal>
      )}

      {confirmDel && (
        <Modal title="Delete script?" onClose={() => setConfirmDel(null)}>
          <p>“{confirmDel.title}”, its versions, voice memos and photos will be removed from this device. This can't be undone.</p>
          <div className="row">
            <button className="danger-btn" onClick={async () => { await deleteScript(confirmDel.id); setConfirmDel(null); refresh(); }}>Delete</button>
            <button onClick={() => setConfirmDel(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Welcome({ onDone, onSample }: { onDone: () => void; onSample: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    {
      t: 'Keep your pen.',
      b: (
        <>
          <p>Cine Ezhuthu turns handwriting in <b>Malayalam</b> or <b>Tamil</b> into typed text in the same language, then lays it out as a proper screenplay.</p>
          <p className="muted">No translation. Write in Malayalam, get a Malayalam script.</p>
        </>
      ),
    },
    {
      t: 'Write, then fix in one tap',
      b: (
        <ul className="tips">
          <li>✍ Open the <b>handwriting pad</b> and write a phrase on the line. Pause — it becomes text.</li>
          <li>👆 Wrong word? Tap one of the <b>alternatives</b> above the pad. English suggestions are there too for mixed lines.</li>
          <li>〰 <b>Scribble over</b> ink to erase it.</li>
          <li>⌨ Or type Manglish/Tanglish: <code>njaan vannu</code> → ഞാൻ വന്നു.</li>
        </ul>
      ),
    },
    {
      t: 'Screenplay does itself',
      b: (
        <ul className="tips">
          <li><b>Enter</b> moves Character → Dialogue → Character, like Final Draft.</li>
          <li><b>Tab</b> or the toolbar changes the element. Type <code>INT.</code> on a new line to start a scene.</li>
          <li>Use <b>Cards</b> to rearrange scenes, <b>Scene notes</b> for voice memos, photos and sketches.</li>
          <li>Export to <b>PDF</b>, Word, Fountain, or share a scene on <b>WhatsApp</b>.</li>
        </ul>
      ),
    },
    {
      t: 'Your script stays yours',
      b: (
        <>
          <p>Everything is saved <b>on this device only</b>, automatically, with version history. Nothing is uploaded.</p>
          <p className="muted">Want a copy in the cloud? Export an <b>encrypted backup</b> — only your passphrase opens it.</p>
        </>
      ),
    },
  ];
  const s = steps[step];
  return (
    <Modal title="Welcome" onClose={onDone}>
      <div className="welcome">
        <div className="dots" aria-hidden>{steps.map((_, i) => <span key={i} className={i === step ? 'on' : ''} />)}</div>
        <h3>{s.t}</h3>
        {s.b}
        <div className="row">
          {step > 0 && <button onClick={() => setStep(step - 1)}>Back</button>}
          <span className="spacer" />
          {step < steps.length - 1 ? (
            <button className="primary" onClick={() => setStep(step + 1)}>Next</button>
          ) : (
            <>
              <button onClick={onDone}>Start writing</button>
              <button className="primary" onClick={onSample}>Open the sample</button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
