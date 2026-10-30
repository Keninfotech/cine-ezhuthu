import { useEffect, useRef, useState } from 'react';
import type { MediaItem, Scene, Stroke } from '../lib/types';
import { uid } from '../lib/types';
import { deleteMedia, getMedia, putMedia } from '../lib/db';
import { charactersInScene, parseHeading } from '../lib/screenplay';
import { InkCanvas } from './InkCanvas';
import { useEditor } from './context';
import { Modal } from '../ui/Modal';

function useMedia(id: string) {
  const [item, setItem] = useState<{ m: MediaItem; url: string } | null>(null);
  useEffect(() => {
    let url = '';
    let alive = true;
    getMedia(id).then((m) => {
      if (!m || !alive) return;
      url = URL.createObjectURL(m.blob);
      setItem({ m, url });
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return item;
}

const fmtDur = (s = 0) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function Memo({ id, onDelete }: { id: string; onDelete: () => void }) {
  const it = useMedia(id);
  if (!it) return null;
  return (
    <li className="memo">
      <audio controls src={it.url} preload="metadata" />
      <div className="row" style={{ marginTop: 2 }}>
        <span className="muted small">
          {new Date(it.m.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })} · {fmtDur(it.m.duration)}
        </span>
        <span className="spacer" />
        <button className="link danger" onClick={onDelete} aria-label="Delete voice memo">Delete</button>
      </div>
    </li>
  );
}

function Photo({ id, onOpen }: { id: string; onOpen: (url: string, id: string) => void }) {
  const it = useMedia(id);
  if (!it) return <div className="thumb" />;
  return (
    <button className="thumb" onClick={() => onOpen(it.url, id)} aria-label={'Open photo ' + it.m.name}>
      <img src={it.url} alt={it.m.name} />
    </button>
  );
}

async function downscale(file: File, max = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (s === 1 && file.size < 1_500_000) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob((b) => r(b ?? file), 'image/jpeg', 0.85));
  } catch {
    return file;
  }
}

const INK_COLORS = ['#1a1a2e', '#294B9B', '#E20A91', '#C5A253'];
const SCENE_COLORS = ['', '#e8a33d', '#d9534f', '#4a90d9', '#5cb85c', '#9b59b6'];

export function ScenePanel({ scene, number, pages, onClose }: { scene: Scene; number: number; pages: string; onClose: () => void }) {
  const ctx = useEditor();
  const { ops, script } = ctx;
  const [recording, setRecording] = useState<{ rec: MediaRecorder; started: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState('');
  const [viewer, setViewer] = useState<{ url: string; id: string } | null>(null);
  const [confirmDelMemo, setConfirmDelMemo] = useState<string | null>(null);
  const [confirmDelPhoto, setConfirmDelPhoto] = useState<string | null>(null);
  const [inkColor, setInkColor] = useState(INK_COLORS[1]);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed((Date.now() - recording.started) / 1000), 250);
    return () => clearInterval(t);
  }, [recording]);

  // stop recording if the scene changes or panel closes
  useEffect(
    () => () => {
      if (recording && recording.rec.state !== 'inactive') recording.rec.stop();
    },
    [recording, scene.id],
  );

  const startRecording = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const started = Date.now();
      const sceneId = scene.id;
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const id = uid();
        await putMedia({ id, scriptId: script.id, kind: 'memo', blob, createdAt: Date.now(), name: `Scene ${number} memo`, duration: (Date.now() - started) / 1000 });
        const sc = ops.get().scenes.find((s) => s.id === sceneId);
        if (sc) ops.updateScene(sceneId, { memoIds: [...sc.memoIds, id] }, true);
        setRecording(null);
      };
      rec.start();
      setElapsed(0);
      setRecording({ rec, started });
    } catch (e) {
      setErr('Microphone not available: ' + (e as Error).message);
    }
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const ids: string[] = [];
    for (const f of Array.from(files)) {
      const id = uid();
      await putMedia({ id, scriptId: script.id, kind: 'photo', blob: await downscale(f), createdAt: Date.now(), name: f.name });
      ids.push(id);
    }
    const sc = ops.get().scenes.find((s) => s.id === scene.id)!;
    ops.updateScene(scene.id, { photoIds: [...sc.photoIds, ...ids] }, true);
  };

  const removeMedia = async (kind: 'memoIds' | 'photoIds', id: string) => {
    const sc = ops.get().scenes.find((s) => s.id === scene.id)!;
    ops.updateScene(scene.id, { [kind]: sc[kind].filter((x) => x !== id) }, true);
    await deleteMedia(id);
  };

  const h = parseHeading(scene.heading);
  const cast = charactersInScene(scene);

  return (
    <aside className="panel" aria-label={`Scene ${number} details`}>
      <header className="panel-head">
        <div>
          <div className="eyebrow">Scene {number} · {pages} pg</div>
          <div className="panel-title">{scene.heading || 'Untitled scene'}</div>
        </div>
        <button className="icon" onClick={onClose} aria-label="Close scene details">✕</button>
      </header>

      <div className="panel-body">
        <div className="facts">
          {h.intExt && <span className="chip">{h.intExt}</span>}
          {h.timeNormalized && <span className="chip">{h.timeNormalized}</span>}
          {cast.map((c) => <span className="chip cast" key={c}>{c}</span>)}
        </div>

        <label className="lbl" htmlFor="synopsis">Synopsis (shows on the scene card)</label>
        <textarea id="synopsis" className="input" rows={2} value={scene.synopsis} onChange={(e) => ops.updateScene(scene.id, { synopsis: e.target.value })} placeholder="One line on what happens" />

        <div className="lbl">Card colour</div>
        <div className="swatches">
          {SCENE_COLORS.map((c) => (
            <button key={c || 'none'} className={'swatch' + ((scene.color ?? '') === c ? ' on' : '')} style={{ background: c || 'transparent' }} onClick={() => ops.updateScene(scene.id, { color: c || undefined }, true)} aria-label={c ? 'Colour ' + c : 'No colour'} />
          ))}
        </div>

        <h4>Voice memos</h4>
        <ul className="memos">
          {scene.memoIds.map((id) => (
            <Memo key={id} id={id} onDelete={() => setConfirmDelMemo(id)} />
          ))}
        </ul>
        {recording ? (
          <button className="rec-btn on" onClick={() => recording.rec.stop()}>■ Stop recording · {fmtDur(elapsed)}</button>
        ) : (
          <button className="rec-btn primary" onClick={startRecording} disabled={typeof MediaRecorder === 'undefined'}>🎙 Record voice memo</button>
        )}
        {err && <p className="err small">{err}</p>}

        <h4>Scene photographs</h4>
        <div className="photos">
          {scene.photoIds.map((id) => <Photo key={id} id={id} onOpen={(url, pid) => setViewer({ url, id: pid })} />)}
          <button className="thumb add" onClick={() => fileInput.current?.click()} aria-label="Upload photo" title="Add from gallery">+</button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={() => fileInput.current?.click()}>📁 Photos</button>
          <button onClick={() => cameraInput.current?.click()}>📷 Camera</button>
        </div>
        <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />

        <h4>Margin notes & sketches</h4>
        <p className="muted small">Kept as original ink — never converted. Perfect for camera angles, lighting notes, and blocking diagrams.</p>
        <div className="ink-tools">
          {INK_COLORS.map((c) => (
            <button key={c} className={'swatch' + (c === inkColor ? ' on' : '')} style={{ background: c }} onClick={() => setInkColor(c)} aria-label={'Ink ' + c} />
          ))}
          <button className="link" onClick={() => ops.updateScene(scene.id, { ink: scene.ink.slice(0, -1) }, true)} disabled={!scene.ink.length}>Undo stroke</button>
          <button className="link danger" onClick={() => ops.updateScene(scene.id, { ink: [] }, true)} disabled={!scene.ink.length}>Clear</button>
        </div>
        <InkCanvas
          key={scene.id}
          className="notes-canvas"
          ariaLabel="Margin notes"
          strokes={scene.ink}
          logicalWidth={400}
          color={inkColor}
          width={2.4}
          penOnly={ctx.settings.penOnly}
          onStroke={(s: Stroke) => {
            const sc = ops.get().scenes.find((x) => x.id === scene.id)!;
            ops.updateScene(scene.id, { ink: [...sc.ink, s] }, true);
          }}
        />
      </div>

      {viewer && (
        <div className="lightbox" onClick={() => setViewer(null)}>
          <img src={viewer.url} alt="Scene attachment" />
          <div className="row" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setViewer(null)}>Close</button>
            <button className="danger-btn" onClick={() => { setConfirmDelPhoto(viewer.id); setViewer(null); }}>Delete photo</button>
          </div>
        </div>
      )}

      {confirmDelMemo && (
        <Modal title="Delete voice memo?" onClose={() => setConfirmDelMemo(null)}>
          <p>This voice recording for Scene {number} will be permanently removed. This cannot be undone.</p>
          <div className="row">
            <button className="danger-btn" onClick={() => { removeMedia('memoIds', confirmDelMemo); setConfirmDelMemo(null); }}>
              Delete memo
            </button>
            <button onClick={() => setConfirmDelMemo(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      {confirmDelPhoto && (
        <Modal title="Delete scene photograph?" onClose={() => setConfirmDelPhoto(null)}>
          <p>This photograph will be permanently removed from Scene {number}. This cannot be undone.</p>
          <div className="row">
            <button className="danger-btn" onClick={() => { removeMedia('photoIds', confirmDelPhoto); setConfirmDelPhoto(null); }}>
              Delete photo
            </button>
            <button onClick={() => setConfirmDelPhoto(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </aside>
  );
}
