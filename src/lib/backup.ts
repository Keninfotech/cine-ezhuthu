/**
 * End-to-end encrypted backup (.cine file).
 * Everything — script, versions, voice memos, photos — is encrypted on the device with
 * AES-GCM using a key derived from the writer's passphrase (PBKDF2, 250k iterations).
 * The file can be stored in any cloud drive; nobody without the passphrase can read it.
 */
import type { MediaItem, Script, Version } from './types';
import { getScript, listMedia, listVersions, putMedia, saveScript, db } from './db';
import { uid } from './types';

interface Payload {
  format: 'cine-ezhuthu-backup';
  v: 1;
  script: Script;
  versions: Version[];
  media: (Omit<MediaItem, 'blob'> & { type: string; data: string })[];
}

const enc = new TextEncoder();
const dec = new TextDecoder();

async function blobToB64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

async function deriveKey(pass: string, salt: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const MAGIC = enc.encode('CINE1');

export async function encryptJSON(obj: unknown, pass: string): Promise<Blob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))));
  return new Blob([MAGIC, salt, iv, ct], { type: 'application/octet-stream' });
}

export async function decryptJSON<T>(file: Blob, pass: string): Promise<T> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (dec.decode(buf.slice(0, 5)) !== 'CINE1') throw new Error('Not a Cine Ezhuthu backup file');
  const salt = buf.slice(5, 21), iv = buf.slice(21, 33), ct = buf.slice(33);
  const key = await deriveKey(pass, salt);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return JSON.parse(dec.decode(pt)) as T;
  } catch {
    throw new Error('Wrong passphrase, or the file is damaged');
  }
}

export async function exportBackup(scriptId: string, pass: string): Promise<Blob> {
  const script = await getScript(scriptId);
  if (!script) throw new Error('Script not found');
  const versions = await listVersions(scriptId);
  const media = await Promise.all(
    (await listMedia(scriptId)).map(async ({ blob, ...m }) => ({ ...m, type: blob.type, data: await blobToB64(blob) })),
  );
  const payload: Payload = { format: 'cine-ezhuthu-backup', v: 1, script, versions, media };
  return encryptJSON(payload, pass);
}

/** Restores a backup as a new copy (never overwrites the script on this device). */
export async function importBackup(file: Blob, pass: string): Promise<Script> {
  const p = await decryptJSON<Payload>(file, pass);
  if (p.format !== 'cine-ezhuthu-backup') throw new Error('Unrecognised backup');
  const newId = uid();
  const idMap = new Map<string, string>();
  for (const m of p.media) {
    const id = uid();
    idMap.set(m.id, id);
    await putMedia({ id, scriptId: newId, kind: m.kind, name: m.name, createdAt: m.createdAt, duration: m.duration, blob: b64ToBlob(m.data, m.type) });
  }
  const remap = (s: Script): Script => ({
    ...s,
    id: newId,
    scenes: s.scenes.map((sc) => ({
      ...sc,
      memoIds: sc.memoIds.map((i) => idMap.get(i) ?? i),
      photoIds: sc.photoIds.map((i) => idMap.get(i) ?? i),
    })),
  });
  const script = { ...remap(p.script), title: p.script.title, updatedAt: Date.now() };
  await saveScript(script);
  const d = await db();
  for (const v of p.versions) await d.put('versions', { ...v, id: uid(), scriptId: newId, snapshot: remap(v.snapshot) });
  return script;
}
