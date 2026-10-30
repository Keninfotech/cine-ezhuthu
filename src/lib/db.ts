import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { MediaItem, Script, Settings, Version } from './types';
import { uid } from './types';
import { DEFAULT_CALIBRATION } from './screenplay';

interface CineDB extends DBSchema {
  scripts: { key: string; value: Script };
  versions: { key: string; value: Version; indexes: { byScript: string } };
  media: { key: string; value: MediaItem; indexes: { byScript: string } };
  kv: { key: string; value: unknown };
}

type StoreName = 'scripts' | 'versions' | 'media' | 'kv';

/** The subset of IndexedDB the app uses — lets us fall back to memory where storage is blocked. */
interface Store {
  get(store: StoreName, key: string): Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  getAll(store: StoreName): Promise<any[]>; // eslint-disable-line @typescript-eslint/no-explicit-any
  put(store: StoreName, value: unknown, key?: string): Promise<unknown>;
  delete(store: StoreName, key: string): Promise<void>;
  getAllFromIndex(store: 'versions' | 'media', index: 'byScript', value: string): Promise<any[]>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function memoryStore(): Store {
  const m: Record<StoreName, Map<string, unknown>> = { scripts: new Map(), versions: new Map(), media: new Map(), kv: new Map() };
  return {
    async get(s, k) { return m[s].get(k); },
    async getAll(s) { return [...m[s].values()]; },
    async put(s, v, k) { m[s].set(k ?? (v as { id: string }).id, v); return k; },
    async delete(s, k) { m[s].delete(k); },
    async getAllFromIndex(s, _i, val) { return [...m[s].values()].filter((v) => (v as { scriptId: string }).scriptId === val); },
  };
}

let dbp: Promise<Store> | null = null;
/** false when the browser refused IndexedDB (private mode, sandboxed preview) and we're in memory */
export let persistent = true;

export function db(): Promise<Store> {
  if (!dbp) {
    const real = openDB<CineDB>('cine-ezhuthu', 1, {
      upgrade(d) {
        d.createObjectStore('scripts', { keyPath: 'id' });
        d.createObjectStore('versions', { keyPath: 'id' }).createIndex('byScript', 'scriptId');
        d.createObjectStore('media', { keyPath: 'id' }).createIndex('byScript', 'scriptId');
        d.createObjectStore('kv');
      },
    }) as Promise<IDBPDatabase<CineDB>> as unknown as Promise<Store>;
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('IndexedDB timeout')), 4000));
    dbp = (async () => {
      try {
        if (typeof indexedDB === 'undefined') throw new Error('no IndexedDB');
        return await Promise.race([real, timeout]);
      } catch {
        persistent = false;
        return memoryStore();
      }
    })();
  }
  return dbp;
}

// ---------- scripts ----------

export async function listScripts(): Promise<Script[]> {
  const all = await (await db()).getAll('scripts');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export const getScript = async (id: string) => (await db()).get('scripts', id);

export async function saveScript(s: Script) {
  await (await db()).put('scripts', s);
}

export async function deleteScript(id: string) {
  const d = await db();
  await d.delete('scripts', id);
  for (const v of await d.getAllFromIndex('versions', 'byScript', id)) await d.delete('versions', v.id);
  for (const m of await d.getAllFromIndex('media', 'byScript', id)) await d.delete('media', m.id);
}

// ---------- versions ----------

export async function listVersions(scriptId: string): Promise<Version[]> {
  const v = await (await db()).getAllFromIndex('versions', 'byScript', scriptId);
  return v.sort((a, b) => b.createdAt - a.createdAt);
}

const MAX_AUTO_VERSIONS = 30;

export async function saveVersion(script: Script, label: string, auto = false): Promise<Version> {
  const v: Version = { id: uid(), scriptId: script.id, label, createdAt: Date.now(), auto, snapshot: structuredClone(script) };
  const d = await db();
  await d.put('versions', v);
  if (auto) {
    const autos = (await listVersions(script.id)).filter((x) => x.auto);
    for (const old of autos.slice(MAX_AUTO_VERSIONS)) await d.delete('versions', old.id);
  }
  return v;
}

export async function deleteVersion(id: string) {
  await (await db()).delete('versions', id);
}

// ---------- media ----------

export async function putMedia(m: MediaItem) {
  await (await db()).put('media', m);
}
export const getMedia = async (id: string) => (await db()).get('media', id);
export async function deleteMedia(id: string) {
  await (await db()).delete('media', id);
}
export async function listMedia(scriptId: string) {
  return (await db()).getAllFromIndex('media', 'byScript', scriptId);
}

// ---------- settings ----------

export const DEFAULT_SETTINGS: Settings = {
  onlineRecognition: 'ask',
  transliterate: true,
  autoCommitMs: 900,
  penOnly: false,
  calibration: DEFAULT_CALIBRATION,
  seenWelcome: false,
};

export async function loadSettings(): Promise<Settings> {
  const s = (await (await db()).get('kv', 'settings')) as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...s, calibration: { ...DEFAULT_SETTINGS.calibration, ...s?.calibration } };
}

export async function saveSettings(s: Settings) {
  await (await db()).put('kv', s, 'settings');
}

// ---------- storage usage ----------

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}

export async function requestPersistence() {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
