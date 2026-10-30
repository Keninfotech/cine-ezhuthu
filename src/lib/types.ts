export type Lang = 'ml' | 'ta' | 'en';

export type ElementType =
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition';

export interface Block {
  id: string;
  type: ElementType;
  text: string;
}

/** A single pen stroke: list of [x, y, t] points. */
export type Stroke = { color: string; width: number; points: [number, number, number][] };

export interface Scene {
  id: string;
  heading: string;
  synopsis: string;
  blocks: Block[];
  /** ids into the media store */
  memoIds: string[];
  photoIds: string[];
  /** handwritten margin notes / storyboard sketch, kept as ink (not converted) */
  ink: Stroke[];
  color?: string;
}

export interface TitlePage {
  title: string;
  writtenBy: string;
  basedOn: string;
  contact: string;
  draftDate: string;
}

export interface CharacterEntry {
  name: string;
  description: string;
}

export interface Script {
  id: string;
  title: string;
  language: Lang;
  titlePage: TitlePage;
  scenes: Scene[];
  characters: CharacterEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface Version {
  id: string;
  scriptId: string;
  label: string;
  createdAt: number;
  auto: boolean;
  snapshot: Script;
}

export interface MediaItem {
  id: string;
  scriptId: string;
  kind: 'memo' | 'photo';
  blob: Blob;
  createdAt: number;
  name: string;
  duration?: number;
}

export interface Settings {
  onlineRecognition: 'ask' | 'on' | 'off';
  transliterate: boolean;
  autoCommitMs: number;
  penOnly: boolean;
  /** width factor per script used for page-count calibration */
  calibration: Record<Lang, number>;
  seenWelcome: boolean;
}

export const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '').slice(0, 16);

export const LANG_LABEL: Record<Lang, string> = { ml: 'Malayalam', ta: 'Tamil', en: 'English' };
export const LANG_NATIVE: Record<Lang, string> = { ml: 'മലയാളം', ta: 'தமிழ்', en: 'English' };
