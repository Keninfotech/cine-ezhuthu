export type Lang = 'ml' | 'ta' | 'te' | 'kn' | 'en';

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

export interface ShotItem {
  id: string;
  type: string; // e.g., 'EWS', 'WS', 'MS', 'MCU', 'CU', 'OTS', 'POV'
  angle?: string; // 'Eye-level', 'Low angle', 'High angle', 'Dutch angle'
  subject: string;
  description: string;
}

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
  shots?: ShotItem[];
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

// ---------------- The Writing Ladder (Proposal Slides 11 & 12) ----------------
export type WritingStage = 'idea' | 'story' | 'synopsis' | 'treatment' | 'screenplay';

export interface LoglineTemplate {
  protagonist: string;
  incitingIncident: string;
  goal: string;
  conflict: string;
}

export interface IdeaData {
  seed: string;
  genre: string;
  logline: LoglineTemplate;
  pinned: boolean;
}

export interface KeyMoment {
  id: string;
  title: string;
  note: string;
  timeHint?: string;
}

export interface StoryData {
  prose: string;
  keyMoments: KeyMoment[];
}

export interface BeatMarker {
  id: string;
  name: string;
  summary: string;
}

export interface SynopsisData {
  prose: string;
  targetWords: number;
  beats: BeatMarker[];
}

export interface TreatmentScene {
  id: string;
  slug: string;
  description: string;
  location: string;
  time: string;
  characters: string[];
}

export interface TreatmentData {
  scenes: TreatmentScene[];
}

export type RevisionColor =
  | 'white'
  | 'blue'
  | 'pink'
  | 'yellow'
  | 'green'
  | 'goldenrod'
  | 'buff'
  | 'salmon'
  | 'cherry';

export const REVISION_DRAFTS: { id: RevisionColor; label: string; name: string; hex: string }[] = [
  { id: 'white', label: '1st', name: 'White (First Draft)', hex: '#f8fafc' },
  { id: 'blue', label: '2nd', name: 'Blue Draft', hex: '#60a5fa' },
  { id: 'pink', label: '3rd', name: 'Pink Draft', hex: '#f472b6' },
  { id: 'yellow', label: '4th', name: 'Yellow Draft', hex: '#facc15' },
  { id: 'green', label: '5th', name: 'Green Draft', hex: '#4ade80' },
  { id: 'goldenrod', label: '6th', name: 'Goldenrod Draft', hex: '#fbbf24' },
  { id: 'buff', label: '7th', name: 'Buff Draft', hex: '#fdba74' },
  { id: 'salmon', label: '8th', name: 'Salmon Draft', hex: '#fb7185' },
  { id: 'cherry', label: '9th', name: 'Cherry Draft', hex: '#f43f5e' },
];

export interface Script {
  id: string;
  title: string;
  language: Lang;
  titlePage: TitlePage;
  scenes: Scene[];
  characters: CharacterEntry[];
  stage?: WritingStage;
  idea?: IdeaData;
  story?: StoryData;
  synopsis?: SynopsisData;
  treatment?: TreatmentData;
  revisionColor?: RevisionColor;
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
  donateHandwriting?: boolean;
}

export const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '').slice(0, 16);

export const LANG_LABEL: Record<Lang, string> = {
  ml: 'Malayalam',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
  en: 'English',
};

export const LANG_NATIVE: Record<Lang, string> = {
  ml: 'മലയാളം',
  ta: 'தமிழ்',
  te: 'తెలుగు',
  kn: 'ಕನ್ನಡ',
  en: 'English',
};
